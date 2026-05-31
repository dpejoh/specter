#!/system/bin/sh
set -e
MODDIR=${0%/*}

. "$MODDIR/lib/common.sh"
. "$MODDIR/lib/paths.sh"
. "$MODDIR/lib/config_env.sh"

# Early boot: set critical props before Android framework starts.
# This runs during post-fs-data, the earliest possible window — before
# Zygote, system_server, or GMS/DroidGuard have read any properties.
# Previously props were set in service.sh, which under KSU/APatch ran
# with no early window, and under Magisk raced with GMS init.
detect_root_solution
export ROOT_SOL
if [ "$(cfg_get toggle_prop_handler 1)" != "0" ]; then
  [ "$(cfg_get boot_state_props 1)" != "0" ] && apply_boot_props
  [ "$(cfg_get spoof_build_props 1)" != "0" ] && spoof_build_props
fi

resolve_conflicts
