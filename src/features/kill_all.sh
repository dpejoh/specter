#!/system/bin/sh
set -e
MODDIR=${0%/*}
. "$MODDIR/../lib/common.sh"
. "$MODDIR/../lib/constants.sh"

log_i "KILL_ALL" "Starting GMS kill-all"

_count=0
ALL_PKGS="$GMS_APPS $TOOL_APPS"
_installed_pkgs=$(pm list packages 2>/dev/null) || log_w "KILL_ALL" "Failed to list installed packages"

for pkg in $ALL_PKGS; do
  echo "$_installed_pkgs" | grep -Fq "package:$pkg" || continue
  am force-stop "$pkg" >/dev/null 2>&1 || log_w "KILL_ALL" "Failed to force-stop $pkg"
  pm clear "$pkg" >/dev/null 2>&1 || log_w "KILL_ALL" "Failed to clear $pkg"
  _count=$((_count + 1))
done
unset _installed_pkgs

log_i "KILL_ALL" "Cleared $_count packages"
exit 0
