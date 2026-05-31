#!/system/bin/sh
set -e
MODDIR=${0%/*}
# Guard: KernelSU and APatch both set $KSU=true; skip if not running under them
[ -z "$KSU" ] && exit 0

. "$MODDIR/lib/common.sh"
. "$MODDIR/lib/paths.sh"
. "$MODDIR/lib/package_list.sh"
. "$MODDIR/lib/config_env.sh"
detect_root_solution
export ROOT_SOL

log "BOOT" "KSU/APatch detected, sourcing unified boot core"

. "$MODDIR/lib/boot_core.sh"
