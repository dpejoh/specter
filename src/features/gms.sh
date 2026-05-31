#!/system/bin/sh
MODDIR=${0%/*}
. "$MODDIR/../lib/common.sh" || { echo "[GMS] FATAL: common.sh" >&2; exit 1; }
. "$MODDIR/../lib/config_env.sh"
. "$MODDIR/../lib/package_list.sh"

[ "$(cfg_get toggle_action_gms 1)" = "0" ] && exit 0

_force_stop=$(cfg_get action_gms_force_stop 1)
_clear_data=$(cfg_get action_gms_clear_data 1)

[ "$_force_stop$_clear_data" = "00" ] && exit 0

log "GMS" "Start"

_installed_pkgs=$(pm list packages 2>/dev/null) || log "GMS" "Warning: Failed to list installed packages"
_count=0

if [ "$_force_stop" != "0" ]; then
  for _pid in $(pgrep -f 'droidguard\|com\.google\.android\.gms\b' 2>/dev/null); do
    kill -9 "$_pid" 2>/dev/null || true
    _count=$((_count + 1))
  done
  unset _pid

  for _pkg in $GMS_KILL_LIST; do
    echo "$_installed_pkgs" | grep -Fq "package:$_pkg" || continue
    log "GMS" "Force-stopping $_pkg"
    am force-stop "$_pkg" >/dev/null 2>&1 || true
    _count=$((_count + 1))
  done
fi

if [ "$_clear_data" != "0" ] && echo "$_installed_pkgs" | grep -q "package:com.android.vending"; then
  log "GMS" "Clearing Play Store data..."
  pm clear com.android.vending >/dev/null 2>&1 || true
  log "GMS" "Play Store data cleared"
fi
unset _installed_pkgs

log "GMS" "Force-stopped $_count packages"
log "GMS" "Finish"
exit 0
