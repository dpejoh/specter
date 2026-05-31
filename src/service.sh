#!/system/bin/sh
set -e
MODDIR=${0%/*}
. "$MODDIR/lib/common.sh"
. "$MODDIR/lib/package_list.sh"
. "$MODDIR/lib/paths.sh"
. "$MODDIR/lib/config_env.sh"
detect_root_solution
export ROOT_SOL

# Early boot props now set in post-fs-data.sh (runs before service.sh for all root solutions)

# KernelSU / APatch: boot-completed.sh handles the rest
[ "$KSU" = "true" ] && {
  log "SERVICE" "KernelSU/APatch detected, boot-completed.sh handles hardening"
  exit 0
}

# Magisk: poll sys.boot_completed, then run unified boot core
log "SERVICE" "Magisk detected, waiting for boot completion"
while [ "$(getprop sys.boot_completed)" != "1" ]; do
  sleep 1
done
log "SERVICE" "Boot completed, sourcing unified boot core"

. "$MODDIR/lib/boot_core.sh"
