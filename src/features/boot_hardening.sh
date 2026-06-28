#!/system/bin/sh
set -e
MODDIR=${0%/*}
. "$MODDIR/../lib/common.sh"

log_i "BOOT_HARDEN" "Delegating to boot_state_props.sh"
sh "$MODDIR/boot_state_props.sh" || true
