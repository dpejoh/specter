plan "root detection prefers the manager that is actually running"
bootstrap
source_libs
unset KSU_VER KSU_VER_CODE APATCH APATCH_VER APATCH_VER_CODE MAGISK_VER MAGISK_VER_CODE

# KernelSU and APatch export their markers into every script they run. A
# stale /data/adb/ksu or /data/adb/ap directory must not override the manager
# that is actually installing/running us (Magisk exports MAGISK_VER too).
KSU_VER="1.0" MAGISK_VER="30.0" MAGISK_VER_CODE="30000"; export KSU_VER MAGISK_VER MAGISK_VER_CODE
detect_root_solution
assert_eq "KSU_VER: KernelSU wins over Magisk" "kernelsu" "$ROOT_SOL"
assert_eq "KSU_VER: KernelSU type" "KernelSU" "$ROOT_TYPE"
unset KSU_VER

KSU_VER_CODE="12345" MAGISK_VER="30.0"; export KSU_VER_CODE MAGISK_VER
detect_root_solution
assert_eq "KSU_VER_CODE: KernelSU wins over Magisk" "kernelsu" "$ROOT_SOL"
unset KSU_VER_CODE

APATCH="true" MAGISK_VER="30.0"; export APATCH MAGISK_VER
detect_root_solution
assert_eq "APATCH: APatch wins over Magisk" "apatch" "$ROOT_SOL"
assert_eq "APATCH: APatch type" "APatch" "$ROOT_TYPE"
unset APATCH

APATCH_VER="0.10.4" MAGISK_VER="30.0"; export APATCH_VER MAGISK_VER
detect_root_solution
assert_eq "APATCH_VER: APatch wins over Magisk" "apatch" "$ROOT_SOL"
unset APATCH_VER

MAGISK_VER="30.0"; export MAGISK_VER
detect_root_solution
assert_eq "MAGISK_VER: Magisk detected" "magisk" "$ROOT_SOL"
assert_eq "MAGISK_VER: Magisk type" "Magisk" "$ROOT_TYPE"
unset MAGISK_VER

MAGISK_VER_CODE="30000"; export MAGISK_VER_CODE
detect_root_solution
assert_eq "MAGISK_VER_CODE: Magisk detected" "magisk" "$ROOT_SOL"
unset MAGISK_VER_CODE

# No installer markers on the host: resetprop from the test PATH is the
# Magisk fallback, never a stale directory-based KernelSU guess.
detect_root_solution
assert_eq "fallback: Magisk via resetprop" "magisk" "$ROOT_SOL"

done_testing
