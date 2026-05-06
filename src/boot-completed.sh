#!/system/bin/sh
set -e
MODDIR=${0%/*}
# Guard: KernelSU and APatch both set $KSU=true; skip if not running under them
[ -z "$KSU" ] && exit 0

. "$MODDIR/lib/common.sh"
. "$MODDIR/lib/paths.sh"
. "$MODDIR/lib/config_env.sh"
detect_root_solution

log "BOOT" "Boot completed - finalizing"

apply_boot_hardening

log "BOOT" "Running boot-time features..."

sh "$MODDIR/features/boot_hash.sh" 2>/dev/null || true
sh "$MODDIR/features/security_patch.sh" 2>/dev/null || true

disable_bootloader_spoofer

sh "$MODDIR/features/suspicious_props.sh" >/dev/null 2>&1 || true

block_rom_spoof_engines

log "BOOT" "Boot-time features done"

_release=$(getprop ro.build.version.release 2>/dev/null || echo "Unknown")
if [ -f "$TARGET_FILE" ]; then
    cfg_set "override.description" "Active | $_release"
    log "BOOT" "Description set to: Active | $_release"
else
    cfg_set "override.description" "Run action button to set up keybox"
    log "BOOT" "Description set to: Run action button to set up keybox"
fi
unset _release

log "BOOT" "Done"
