#!/system/bin/sh
set -e
MODDIR=${0%/*}
. "$MODDIR/lib/common.sh"
. "$MODDIR/lib/package_list.sh"
detect_root_solution

log "SERVICE" "Setting boot properties"

# ============================================================================
# EARLY BOOT PROPS (immediate, no wait)
# ============================================================================

# --- Security model ---
sp_try ro.boot.selinux enforcing
sp_try ro.build.selinux 1
sp_try ro.secure 1
sp_try ro.adb.secure 1
sp_try ro.debuggable 0
sp_try ro.force.debuggable 0
sp_try ro.kernel.qemu 0
sp_try ro.boot.qemu 0
sp_try ro.crypto.state encrypted
sp_try ro.hardware.virtual_device 0

# --- Build identity ---
sp_try ro.build.type user
sp_try ro.build.tags release-keys
while IFS= read -r _prop; do
  [ -z "$_prop" ] && continue
  case "$_prop" in
    *.build.type) sp_try "$_prop" user ;;
    *.build.tags) sp_try "$_prop" release-keys ;;
  esac
done <<PROPS
$(resetprop 2>/dev/null | grep -oE 'ro\.[^.]+\.build\.(type|tags)' || true)
PROPS
unset _prop

# --- Boot state ---
sp_try ro.boot.verifiedbootstate green
sp_try vendor.boot.verifiedbootstate green
sp_try ro.boot.vbmeta.device_state locked
sp_try vendor.boot.vbmeta.device_state locked
sp_try ro.boot.flash.locked 1
sp_try ro.boot.veritymode enforcing
sp_try ro.boot.veritymode.managed yes
sp_try ro.boot.vbmeta.avb_version 2.0
sp_try ro.boot.vbmeta.hash_alg sha256

# --- Warranty bits ---
sp_try ro.warranty_bit 0
sp_try ro.boot.warranty_bit 0
sp_try ro.vendor.warranty_bit 0
sp_try ro.vendor.boot.warranty_bit 0
sp_try ro.is_ever_orange 0
sp_try ro.secureboot.lockstate locked

# --- OEM-specific ---
sp_try ro.boot.realme.lockstate 1
sp_try ro.boot.realmebootstate green
sp_try sys.oem_unlock_allowed 0
sp_try ro.oem_unlock_supported 0

# --- Recovery hiding ---
sp_try ro.bootmode recovery unknown
sp_try ro.boot.bootmode recovery unknown
sp_try vendor.boot.bootmode recovery unknown
sp_try ro.boot.mode recovery unknown

# --- USB / ADB ---
sp_try sys.usb.config mtp
sp_try sys.usb.adb.disabled 1
sp_try persist.sys.usb.config none
sp_try service.adb.root 0

# Protect SELinux policy files
if [ "$(toybox cat /sys/fs/selinux/enforce 2>/dev/null)" = "0" ]; then
  chmod 640 /sys/fs/selinux/enforce 2>/dev/null || true
  chmod 440 /sys/fs/selinux/policy 2>/dev/null || true
fi

# --- Vbmeta fixer — read real size/digest from block device ---
_vbmeta_out=$(read_vbmeta 2>/dev/null || echo "")
if [ -n "$_vbmeta_out" ]; then
  _vbsize="${_vbmeta_out%% *}"
  _vbhash="${_vbmeta_out#* }"
  resetprop -n ro.boot.vbmeta.size "$_vbsize" 2>/dev/null || true
  sp_try ro.boot.vbmeta.hash_alg sha256
  sp_try ro.boot.vbmeta.avb_version 2.0
  if [ -n "$_vbhash" ] && [ ! -f "/data/adb/boot_hash" ]; then
    resetprop -n ro.boot.vbmeta.digest "$_vbhash" 2>/dev/null || true
  fi
fi
unset _vbmeta_out _vbsize _vbhash

log "SERVICE" "Boot properties set"

# ============================================================================
# AFTER BOOT COMPLETED
# ============================================================================

# KernelSU / APatch: boot-completed.sh handles hardening
[ "$KSU" = "true" ] && {
  log "SERVICE" "KernelSU/APatch detected - boot-completed.sh handles hardening"
  exit 0
}

# Magisk: poll sys.boot_completed, then apply hardening
log "SERVICE" "Magisk detected - waiting for boot completion"
while [ "$(getprop sys.boot_completed)" != "1" ]; do
  sleep 1
done
log "SERVICE" "Boot completed - applying hardening"

# Apply boot hardening (settings + prop deletes)
apply_boot_hardening
log "SERVICE" "Boot hardening applied"


# Hide TWRP / OrangeFox / FOX recovery folders from /sdcard
log "SERVICE" "Hiding recovery folders..."
hide_recovery_folders
log "SERVICE" "Recovery folders hidden"

log "SERVICE" "Running boot-time features..."

sh "$MODDIR/features/boot_hash.sh" 2>/dev/null || true
sh "$MODDIR/features/security_patch.sh" 2>/dev/null || true

disable_bootloader_spoofer

sh "$MODDIR/features/suspicious_props.sh" >/dev/null 2>&1 || true

block_rom_spoof_engines

log "SERVICE" "Boot-time features done"

# Delayed spoofing - 120s delay to re-apply props that system may have overridden
(
  sleep 120
  log "SERVICE" "Delayed spoofing - reapplying critical props"
  sp_try ro.crypto.state encrypted
  sp_try ro.build.tags release-keys
  hide_recovery_folders
) &

log "SERVICE" "Done"
