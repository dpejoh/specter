#!/system/bin/sh
set -e
MODDIR=${0%/*}
. "$MODDIR/../lib/common.sh"
. "$MODDIR/../lib/config_env.sh"

if [ "$(cfg_get boot_hardening_selinux 1)" != "0" ]; then
  apply_boot_hardening
  chmod 440 /proc/cmdline 2>/dev/null || true
  chmod 440 /proc/net/unix 2>/dev/null || true
  find /vendor/bin /system/bin -name install-recovery.sh -exec chmod 440 {} + 2>/dev/null || true
  chmod 750 /system/addon.d 2>/dev/null || true
fi

if [ "$(cfg_get boot_hardening_bootmode 1)" != "0" ]; then
  for _bm in ro.boot.bootmode ro.bootmode vendor.boot.bootmode; do
    _bm_val=$(resetprop "$_bm" 2>/dev/null || echo "")
    case "$_bm_val" in *recovery*) sp_try "$_bm" "unknown" ;; esac
  done
  unset _bm _bm_val
fi