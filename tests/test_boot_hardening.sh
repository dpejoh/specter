plan "boot_hardening.sh — proc + bootmode spoofing"

# ---- bootmode: recovery hidden when toggle on ----
bootstrap
source_libs
set_cfg "boot_hardening_bootmode" "1"
set_prop "ro.boot.bootmode" "recovery"

if [ "$(cfg_get boot_hardening_bootmode 1)" != "0" ]; then
  for _bm in ro.boot.bootmode; do
    _bm_val=$(resetprop "$_bm" 2>/dev/null || echo "")
    case "$_bm_val" in *recovery*) sp_try "$_bm" "unknown" ;; esac
  done
fi

assert_prop_eq "boot_harden: ro.boot.bootmode recovery→unknown" "ro.boot.bootmode" "unknown"

# ---- all three bootmode props recovery→unknown ----
bootstrap
source_libs
set_cfg "boot_hardening_bootmode" "1"
set_prop "ro.boot.bootmode" "recovery"
set_prop "ro.bootmode" "recovery"
set_prop "vendor.boot.bootmode" "recovery"

if [ "$(cfg_get boot_hardening_bootmode 1)" != "0" ]; then
  for _bm in ro.boot.bootmode ro.bootmode vendor.boot.bootmode; do
    _bm_val=$(resetprop "$_bm" 2>/dev/null || echo "")
    case "$_bm_val" in *recovery*) sp_try "$_bm" "unknown" ;; esac
  done
fi

assert_prop_eq "boot_harden: ro.boot.bootmode recovery→unknown"   "ro.boot.bootmode" "unknown"
assert_prop_eq "boot_harden: ro.bootmode recovery→unknown"         "ro.bootmode" "unknown"
assert_prop_eq "boot_harden: vendor.boot.bootmode recovery→unknown" "vendor.boot.bootmode" "unknown"

# ---- bootmode: non-recovery untouched ----
bootstrap
source_libs
set_cfg "boot_hardening_bootmode" "1"
set_prop "ro.boot.bootmode" "normal"
set_prop "vendor.boot.bootmode" "ffbm-00"

if [ "$(cfg_get boot_hardening_bootmode 1)" != "0" ]; then
  for _bm in ro.boot.bootmode ro.bootmode vendor.boot.bootmode; do
    _bm_val=$(resetprop "$_bm" 2>/dev/null || echo "")
    case "$_bm_val" in *recovery*) sp_try "$_bm" "unknown" ;; esac
  done
fi

assert_prop_eq "boot_harden: normal bootmode unchanged" "ro.boot.bootmode" "normal"
assert_prop_eq "boot_harden: vendor non-recovery unchanged" "vendor.boot.bootmode" "ffbm-00"

# ---- bootmode: toggle off ----
bootstrap
source_libs
set_cfg "boot_hardening_bootmode" "0"
set_prop "ro.boot.bootmode" "recovery"

if [ "$(cfg_get boot_hardening_bootmode 1)" != "0" ]; then
  for _bm in ro.boot.bootmode; do
    _bm_val=$(resetprop "$_bm" 2>/dev/null || echo "")
    case "$_bm_val" in *recovery*) sp_try "$_bm" "unknown" ;; esac
  done
fi

assert_prop_eq "boot_harden: toggle off, recovery unchanged" "ro.boot.bootmode" "recovery"

done_testing
