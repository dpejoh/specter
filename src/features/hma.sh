#!/system/bin/sh
# HMAOSS_CMD_TIMEOUT is read by lib/hma.sh, which shellcheck does not see.
# shellcheck disable=SC2034
set -e
MODDIR=${0%/*}
. "$MODDIR/../lib/common.sh"

case "${1:-}" in
  --list|--list-raw)
    _hma_inst_tmp=$(_hma_tmp_base)/specter_hma_list.$$
    mkdir -p "$_hma_inst_tmp" 2>/dev/null || true
    trap 'rm -rf "$_hma_inst_tmp" 2>/dev/null || true' EXIT
    _hma_inst="$_hma_inst_tmp/installed"
    _hma_installed > "$_hma_inst"
    if ! grep -Fxq "$HMAOSS_PKG" "$_hma_inst"; then
      exit 0
    fi
    _hma_dir=$(_hma_find_dir)
    [ -z "$_hma_dir" ] && exit 0
    _hma_cfg="$_hma_dir/config.json"
    if [ -f "$_hma_cfg" ]; then
      _hma_base="$_hma_inst_tmp/base.json"
      if [ -r "$_hma_cfg" ] && IFS= read -r _hma_probe < "$_hma_cfg"; then
        _hma_base="$_hma_cfg"
      elif ! _hma_copy_config "$_hma_cfg" "$_hma_base"; then
        exit 0
      fi
      _hma_list_scope "$_hma_base"
    fi
    exit 0
    ;;
  --set)
    [ -n "${2:-}" ] && [ -f "$2" ] || die "hma.sh --set requires an existing file argument"
    _hma_custom_file="$2"
    ;;
esac

_HMA_LOCK="$SPECTER_DIR/.hma.lock"
# Serialize config writes across the watcher, scheduler, action and WebUI.
if ! mkdir "$_HMA_LOCK" 2>/dev/null; then
  _hma_lock_pid=$(cat "$_HMA_LOCK/pid" 2>/dev/null || echo "")
  if [ -n "$_hma_lock_pid" ] && [ -d "/proc/$_hma_lock_pid" ]; then
    exit 0
  fi
  rm -rf "$_HMA_LOCK" 2>/dev/null || true
  mkdir "$_HMA_LOCK" 2>/dev/null || exit 0
fi
printf '%s' "$$" > "$_HMA_LOCK/pid" 2>/dev/null || true

_HMA_TMP_BASE=$(_hma_tmp_base)
_HMA_TMP="$_HMA_TMP_BASE/specter_hma.$$"
mkdir -p "$_HMA_TMP" 2>/dev/null || true
trap 'rm -rf "$_HMA_TMP" "$_HMA_LOCK" 2>/dev/null || true' EXIT

# The install watcher can fire several times for one package event. Debounce
# watcher-triggered runs; scheduler/action/WebUI runs are not debounced.
if [ "${1:-}" = "--watch" ]; then
  _hma_stamp="$SPECTER_DIR/scheduler_tasks/hma_watch_last"
  _hma_now=$(date +%s 2>/dev/null || echo 0)
  _hma_last=$(cat "$_hma_stamp" 2>/dev/null || echo 0)
  case "$_hma_last" in ''|*[!0-9]*) _hma_last=0 ;; esac
  if [ "$_hma_now" -gt 0 ] && [ $((_hma_now - _hma_last)) -lt 60 ]; then
    exit 0
  fi
  printf '%s' "$_hma_now" > "$_hma_stamp" 2>/dev/null || true
fi

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

_hma_cache_file=$(_hma_find_preset_cache "$_hma_dir")
_hma_preset_apps="$_HMA_TMP/preset-apps"
_hma_detectors="$_HMA_TMP/detector-apps"
: > "$_hma_preset_apps"
: > "$_hma_detectors"
if [ -n "$_hma_cache_file" ]; then
  _hma_cache_copy="$_HMA_TMP/preset_cache_v2.json"
  HMAOSS_CMD_TIMEOUT=$(_hma_budget 20)
  if _hma_copy_config "$_hma_cache_file" "$_hma_cache_copy" && [ -s "$_hma_cache_copy" ]; then
    HMAOSS_CMD_TIMEOUT=$(_hma_budget 20)
    _hma_preset_cache_apps "$_hma_cache_copy" "$_hma_preset_apps" "$_hma_detectors"
  else
    log_w "HMA" "HMA-OSS preset cache unreadable — continuing without preset exclusions"
  fi
else
  log_w "HMA" "HMA-OSS preset cache missing — continuing without preset exclusions"
fi
if [ ! -s "$_hma_preset_apps" ]; then
  log_i "HMA" "no preset cache apps to exclude"
fi

_hma_user="$_HMA_TMP/user-apps"
_hma_scope="$_HMA_TMP/scope-entries"
_hma_default="$_HMA_TMP/default.json"
_hma_default6="$_HMA_TMP/default-no-detectors.json"
_hma_base="$_HMA_TMP/base.json"
_hma_merged="$_HMA_TMP/merged.json"

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

# Sensitive apps detected across HMA-OSS built-in presets (excluding detector
# apps, which must remain in scope for testing/hiding) and blacklisted apps
# must never have hiding enabled on themselves.
_hma_exclude="$_HMA_TMP/exclude-apps"
cp -f "$_hma_preset_apps" "$_hma_exclude" 2>/dev/null || : > "$_hma_exclude"
if [ -f "$SPECTER_DIR/blacklist_enabled" ] && [ -s "$SPECTER_DIR/blacklist.txt" ]; then
  awk '{
    gsub(/\r/, "")
    sub(/^[[:space:]]+/, "")
    sub(/[[:space:]]+$/, "")
    sub(/[[:space:]].*$/, "")
    if ($0 != "" && $0 !~ /^#/) print
  }' "$SPECTER_DIR/blacklist.txt" >> "$_hma_exclude"
fi

_hma_appconfig_json > "$_hma_default"
_hma_appconfig_json no-detectors > "$_hma_default6"

_hma_scope_mode="merge"
if [ -n "${_hma_custom_file:-}" ]; then
  _hua_bl=""
  if [ -f "$SPECTER_DIR/blacklist_enabled" ] && [ -s "$SPECTER_DIR/blacklist.txt" ]; then
    _hua_bl="$SPECTER_DIR/blacklist.txt"
  fi
  _hma_timeout "$HMAOSS_CMD_TIMEOUT" awk \
    -v hma="$HMAOSS_PKG" -v bl_file="$_hua_bl" -v exclude_file="$_hma_exclude" '
    BEGIN {
      if (bl_file != "") {
        while ((getline b < bl_file) > 0) {
          gsub(/\r/, "", b); gsub(/^[[:space:]]+/, "", b); gsub(/[[:space:]]+$/, "", b)
          sub(/[[:space:]].*$/, "", b)
          if (b != "" && b !~ /^#/) black[b] = 1
        }
        close(bl_file)
      }
      if (exclude_file != "") {
        while ((getline ex < exclude_file) > 0) {
          gsub(/\r/, "", ex); gsub(/^[[:space:]]+/, "", ex); gsub(/[[:space:]]+$/, "", ex)
          sub(/[[:space:]].*$/, "", ex)
          if (ex != "" && ex !~ /^#/) excluded[ex] = 1
        }
        close(exclude_file)
      }
    }
    {
      sub(/\r$/, "", $0); sub(/[[:space:]]+$/, "", $0); sub(/^[[:space:]]+/, "", $0)
      if ($0 == "" || $0 ~ /^#/ || $0 == hma) next
      if ($0 in black || $0 in excluded) next
      if (seen[$0]++) next
      print
    }
  ' "$_hma_custom_file" > "$_hma_user"
  rm -f "$_hma_custom_file" 2>/dev/null || true
  _hma_scope_mode="replace"
else
  _hma_user_apps "$_hma_exclude" > "$_hma_user"
fi

_hma_build_scope "$_hma_user" "$_hma_scope" "$_hma_default" "$_hma_default6" "$_hma_detectors"

_hmc_rc=0
_hma_merge_config "$_hma_base" "$_hma_scope" "$_hma_default" "$_hma_merged" "$(_hma_budget 30)" "$_hma_exclude" "$_hma_detectors" "$_hma_scope_mode" || _hmc_rc=$?
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

_hma_preset_n=$(wc -l < "$_hma_preset_apps" 2>/dev/null)
_hma_preset_n=${_hma_preset_n##* }
_hma_det_n=$(wc -l < "$_hma_detectors" 2>/dev/null)
_hma_det_n=${_hma_det_n##* }
_hma_added_n=$(wc -l < "$_hma_scope" 2>/dev/null)
_hma_added_n=${_hma_added_n##* }
log_i "HMA" "Preset exclusions: $_hma_preset_n | detector targets: $_hma_det_n | scope targets: $_hma_added_n"
log_i "HMA" "Config written; HMA-OSS applies it automatically on oss-175+"
exit 0
