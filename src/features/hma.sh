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

if ! _hma_installed | grep -Fxq "$HMAOSS_PKG"; then
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

_hma_inst="$_HMA_TMP/installed"
_hma_apps="$_HMA_TMP/hidden-apps"
_hma_user="$_HMA_TMP/user-apps"
_hma_scope="$_HMA_TMP/scope-entries"
_hma_default="$_HMA_TMP/default.json"
_hma_base="$_HMA_TMP/base.json"
_hma_merged="$_HMA_TMP/merged.json"

HMAOSS_CMD_TIMEOUT=$(_hma_budget 20)
_hma_installed > "$_hma_inst"
if [ ! -s "$_hma_inst" ]; then
  log_e "HMA" "could not list packages, aborting"
  exit 1
fi
_hma_filter_hide_list "$_hma_list" "$_hma_inst" "$_hma_apps"
_hma_skip_tpl=0
if [ ! -s "$_hma_apps" ]; then
  _hma_skip_tpl=1
  log_w "HMA" "no listed root manager installed, keeping existing template"
fi
if [ "$(cfg_get toggle_hma_target_user_apps 1)" = "1" ]; then
  _hma_user_apps > "$_hma_user"
  _hma_build_scope "$_hma_user" "$HMAOSS_TEMPLATE" "$_hma_scope"
else
  : > "$_hma_scope"
fi
_hma_appconfig_json "$HMAOSS_TEMPLATE" > "$_hma_default"

_hma_cfg="$_hma_dir/config.json"
HMAOSS_CMD_TIMEOUT=$(_hma_budget 20)
if [ -f "$_hma_cfg" ]; then
  if ! _hma_copy_config "$_hma_cfg" "$_hma_base"; then
    log_e "HMA" "failed to read existing config, leaving it untouched"
    exit 1
  fi
else
  : > "$_hma_base"
fi

_hmc_rc=0
_hma_merge_config "$_hma_base" "$_hma_apps" "$_hma_scope" "$_hma_default" "$_hma_merged" "$_hma_skip_tpl" "$(_hma_budget 30)" || _hmc_rc=$?
if [ "$_hmc_rc" -ne 0 ]; then
  if [ "$_hmc_rc" -eq 124 ]; then
    log_e "HMA" "config too large to merge (timed out), existing config left untouched"
  else
    log_e "HMA" "config merge failed, existing config left untouched"
  fi
  exit 1
fi

HMAOSS_CMD_TIMEOUT=$(_hma_budget 20)
_hma_backup "$_hma_cfg"
if ! _hma_install_config "$_hma_merged" "$_hma_cfg" "$_hma_dir"; then
  log_e "HMA" "failed to install config (root required)"
  exit 1
fi

_hma_hidden_n=$(wc -l < "$_hma_apps" | tr -d ' ')
_hma_added_n=$(wc -l < "$_hma_scope" | tr -d ' ')
log_i "HMA" "Hidden apps: $_hma_hidden_n | scope additions: $_hma_added_n"

_hma_policy=$(_hma_launch_policy)
if [ "$SPECTER_FIRST_BOOT" = "1" ] || [ "${SPECTER_HMA_NO_UI_RELOAD:-}" = "1" ]; then
  log_i "HMA" "Config written; reboot or long-press HMA-OSS Home to apply"
elif [ "$_hma_policy" = "skip" ]; then
  log_i "HMA" "Config written; HMA-OSS launch skipped (auto-refuse)"
elif [ "$_hma_policy" = "ask" ]; then
  log_i "HMA" "Config written; no terminal to ask, reboot or open HMA-OSS to apply"
elif [ "$(cfg_get toggle_hma_live_reload 1)" = "1" ] && [ "$(_hma_budget 20)" -ge 15 ] && _hma_request_reload "$_HMA_TMP"; then
  log_i "HMA" "Live reload requested in HMA-OSS"
elif [ "$(_hma_budget 20)" -ge 15 ] && _hma_open_ui; then
  log_i "HMA" "HMA-OSS opened; long-press the status card to apply"
else
  log_w "HMA" "Config written; reboot or long-press HMA-OSS Home to apply"
fi
exit 0
