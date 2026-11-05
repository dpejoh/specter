#!/system/bin/sh
# HMAOSS_CMD_TIMEOUT is read by lib/hma.sh, which shellcheck does not see.
# shellcheck disable=SC2034
set -e
MODDIR=${0%/*}
. "$MODDIR/../lib/common.sh"

_HMA_ROOT="${MODDIR%/*}"
_HMA_TMP_BASE=$(_hma_tmp_base)
_HMA_TMP="$_HMA_TMP_BASE/specter_hma.$$"
mkdir -p "$_HMA_TMP" 2>/dev/null || true
trap 'rm -rf "$_HMA_TMP" 2>/dev/null || true' EXIT

# The WebUI drops its output callback at 60s, so the run gets one budget
# instead of a per-call cap. Each phase can only use what is left.
: "${HMAOSS_TOTAL_TIMEOUT:=45}"
_HMA_DEADLINE=$(( $(date +%s) + HMAOSS_TOTAL_TIMEOUT ))
_hma_budget() {
  _hb_left=$(( _HMA_DEADLINE - $(date +%s) ))
  [ "$_hb_left" -lt 1 ] && _hb_left=1
  [ "$_hb_left" -gt "$1" ] && _hb_left="$1"
  printf '%s\n' "$_hb_left"
}

log_i "HMA" "Starting HMA-OSS config generation"

_hma_inst="$_HMA_TMP/installed"
HMAOSS_CMD_TIMEOUT=$(_hma_budget 20)
_hma_installed > "$_hma_inst"
if ! grep -Fxq "$HMAOSS_PKG" "$_hma_inst"; then
  log_w "HMA" "HMA-OSS not installed, skipping"
  exit 0
fi

_hma_dir=$(_hma_find_dir)
if [ -z "$_hma_dir" ]; then
  log_w "HMA" "HMA-OSS data dir missing — open HMA-OSS once (or reboot), then re-run"
  exit 0
fi

_hma_list=$(_hma_list_path "$_HMA_ROOT")
if [ -z "$_hma_list" ]; then
  log_e "HMA" "hide list not found ($HMAOSS_HIDE_LIST)"
  exit 1
fi

_hma_apps="$_HMA_TMP/hidden-apps"
_hma_user="$_HMA_TMP/user-apps"
_hma_scope="$_HMA_TMP/scope-entries"
_hma_default="$_HMA_TMP/default.json"
_hma_base="$_HMA_TMP/base.json"
_hma_merged="$_HMA_TMP/merged.json"

_hma_filter_hide_list "$_hma_list" "$_hma_inst" "$_hma_apps"

# Xposed modules can be installed under any package name. Detect legacy
# metadata, assets/xposed_init, and libxposed META-INF markers.
if [ "$(cfg_get toggle_hma_hide_xposed 1)" = "1" ] &&
   command -v app_process >/dev/null 2>&1 &&
   [ -f "$_HMA_ROOT/features/xposed_scan.sh" ]; then
  if ! _hma_xposed=$(sh "$_HMA_ROOT/features/xposed_scan.sh" 2>/dev/null); then
    log_w "HMA" "Xposed module scan failed; continuing without detected modules"
  else
    _hma_xposed=$(printf '%s\n' "$_hma_xposed" | awk -F'\t' 'NF {print $1}')
    if [ -n "$_hma_xposed" ]; then
      {
        cat "$_hma_apps"
        printf '%s\n' "$_hma_xposed"
      } | awk 'NF && !seen[$0]++' > "${_hma_apps}.xposed"
      mv -f "${_hma_apps}.xposed" "$_hma_apps"
      _hma_xposed_n=$(printf '%s\n' "$_hma_xposed" | grep -c . || true)
      log_i "HMA" "Detected Xposed modules: $_hma_xposed_n"
    fi
  fi
  unset _hma_xposed _hma_xposed_n
fi

_hma_skip_tpl=0
if [ ! -s "$_hma_apps" ]; then
  _hma_skip_tpl=1
  log_w "HMA" "no hide-list apps installed, keeping existing template"
fi

_hma_cfg="$_hma_dir/config.json"
HMAOSS_CMD_TIMEOUT=$(_hma_budget 20)
if [ -f "$_hma_cfg" ]; then
  if [ -r "$_hma_cfg" ] && IFS= read -r _hma_probe < "$_hma_cfg"; then
    # Readable in place: let the merge read the real file and skip a copy.
    _hma_base="$_hma_cfg"
  elif ! _hma_copy_config "$_hma_cfg" "$_hma_base"; then
    log_e "HMA" "failed to read existing config, leaving it untouched"
    exit 1
  fi
else
  : > "$_hma_base"
fi
unset _hma_probe

# Apps that are invisible in a blacklist template should not also be applied-to.
# When the template is rebuilt, use _hma_apps instead of its stale copy; when
# it is kept (no hide-list apps installed), its appList is still authoritative.
_hma_exclude="$_HMA_TMP/template-targets"
if [ "$_hma_skip_tpl" = "1" ]; then
  _hma_template_targets "$_hma_base" "$_hma_exclude"
else
  _hma_template_targets "$_hma_base" "$_hma_exclude" "$HMAOSS_TEMPLATE"
fi
cat "$_hma_apps" >> "$_hma_exclude"
awk 'NF && !seen[$0]++' "$_hma_exclude" > "${_hma_exclude}.dedup" && \
  mv -f "${_hma_exclude}.dedup" "$_hma_exclude"

_hma_appconfig_json "$HMAOSS_TEMPLATE" > "$_hma_default"
_hma_prune=0
if [ "$(cfg_get toggle_hma_target_user_apps 1)" = "1" ]; then
  _hma_prune=1
  _hma_user_apps "$_hma_exclude" > "$_hma_user"
  _hma_build_scope "$_hma_user" "$HMAOSS_TEMPLATE" "$_hma_scope" "$_hma_default"
else
  : > "$_hma_scope"
fi

_hmc_rc=0
_hma_merge_config "$_hma_base" "$_hma_apps" "$_hma_scope" "$_hma_default" "$_hma_merged" "$_hma_skip_tpl" "$(_hma_budget 30)" "$_hma_prune" || _hmc_rc=$?
if [ "$_hmc_rc" -ne 0 ]; then
  if [ "$_hmc_rc" -eq 124 ]; then
    log_e "HMA" "config too large to merge (timed out), existing config left untouched"
  else
    log_e "HMA" "config merge failed, existing config left untouched"
  fi
  exit 1
fi
unset _hma_prune

HMAOSS_CMD_TIMEOUT=$(_hma_budget 20)
_hma_backup "$_hma_cfg"
if ! _hma_install_config "$_hma_merged" "$_hma_cfg" "$_hma_dir"; then
  log_e "HMA" "failed to install config (root required)"
  exit 1
fi

_hma_hidden_n=$(wc -l < "$_hma_apps" 2>/dev/null)
_hma_hidden_n=${_hma_hidden_n##* }
_hma_added_n=$(wc -l < "$_hma_scope" 2>/dev/null)
_hma_added_n=${_hma_added_n##* }
log_i "HMA" "Hidden apps: $_hma_hidden_n | scope targets: $_hma_added_n"
log_i "HMA" "Config written successfully"
exit 0
