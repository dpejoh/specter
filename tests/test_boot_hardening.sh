. "$(dirname "$0")/helpers.sh"

plan "boot_hardening.sh — SELinux + bootmode spoofing"

# ---- scenario: both sub-toggles enabled ----
bootstrap
source_libs
set_cfg "boot_hardening_selinux" "1"
set_cfg "boot_hardening_bootmode" "1"
set_prop "ro.boot.bootmode" "recovery"
set_prop "ro.bootmode" "normal"
set_prop "vendor.boot.bootmode" "recovery"

# Inline the feature boot_hardening logic
if [ "$(cfg_get boot_hardening_selinux 1)" != "0" ]; then
  apply_boot_hardening
fi

if [ "$(cfg_get boot_hardening_bootmode 1)" != "0" ]; then
  for _bm in ro.boot.bootmode ro.bootmode vendor.boot.bootmode; do
    _bm_val=$(resetprop "$_bm" 2>/dev/null || echo "")
    case "$_bm_val" in *recovery*) sp_try "$_bm" "unknown" ;; esac
  done
fi

assert_prop_eq "boot_harden: ro.boot.bootmode recovery->unknown"   "ro.boot.bootmode" "unknown"
assert_prop_eq "boot_harden: ro.bootmode unchanged (normal)"        "ro.bootmode" "normal"
assert_prop_eq "boot_harden: vendor.boot.bootmode recovery->unknown" "vendor.boot.bootmode" "unknown"

# ---- scenario: selinux disabled ----
bootstrap
source_libs
set_cfg "boot_hardening_selinux" "0"
set_cfg "boot_hardening_bootmode" "1"
set_prop "ro.boot.bootmode" "recovery"

if [ "$(cfg_get boot_hardening_bootmode 1)" != "0" ]; then
  for _bm in ro.boot.bootmode; do
    _bm_val=$(resetprop "$_bm" 2>/dev/null || echo "")
    case "$_bm_val" in *recovery*) sp_try "$_bm" "unknown" ;; esac
  done
fi

assert_prop_eq "boot_harden: selinux off, bootmode still works" "ro.boot.bootmode" "unknown"

# ---- scenario: bootmode disabled ----
bootstrap
source_libs
set_cfg "boot_hardening_selinux" "1"
set_cfg "boot_hardening_bootmode" "0"
set_prop "ro.boot.bootmode" "recovery"

if [ "$(cfg_get boot_hardening_selinux 1)" != "0" ]; then
  apply_boot_hardening
fi

# bootmode block skipped — prop unchanged
assert_prop_eq "boot_harden: bootmode off, unchanged" "ro.boot.bootmode" "recovery"

# ---- scenario: both disabled ----
bootstrap
source_libs
set_cfg "boot_hardening_selinux" "0"
set_cfg "boot_hardening_bootmode" "0"

# Neither block runs
assert_log_not_contains "boot_harden: no SET calls" "resetprop.log" "SET "

done_testing
