#!/system/bin/sh
set -e
MODDIR=${0%/*}
. "$MODDIR/lib/common.sh"
. "$MODDIR/lib/package_list.sh"
. "$MODDIR/lib/paths.sh"
. "$MODDIR/lib/config_env.sh"
[ -z "$ROOT_SOL" ] && detect_root_solution
export ROOT_SOL

[ "$KSU" = "true" ] && {
  log "SERVICE" "KernelSU/APatch detected, boot-completed.sh handles hardening"
  exit 0
}

log "SERVICE" "Magisk detected, waiting for boot completion"
resetprop -w sys.boot_completed 1 2>/dev/null || while [ "$(getprop sys.boot_completed)" != "1" ]; do sleep 5; done
log "SERVICE" "Boot completed, sourcing unified boot core"

. "$MODDIR/lib/boot_core.sh"
