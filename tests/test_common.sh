. "$(dirname "$0")/helpers.sh"

plan "common.sh — core library functions"

bootstrap
source_libs

# ---- sp_try: 2-arg form (only overrides if existing value is wrong) ----
set_prop "ro.build.selinux" "1"
sp_try "ro.build.selinux" "1"
assert_prop_eq "sp_try(2) skips if already correct" "ro.build.selinux" "1"

set_prop "ro.build.type" "eng"
sp_try "ro.build.type" "user"
assert_prop_eq "sp_try(2) overrides wrong value" "ro.build.type" "user"

# sp_try skips missing props (by design — prop doesn't exist, nothing to fix)
rm -f "$PROPS_DIR/ro.debuggable"
sp_try "ro.debuggable" "0"
assert_prop_not_set "sp_try(2) skips missing props" "ro.debuggable"

# ---- sp_try: 3-arg form (conditional on needle) ----
set_prop "ro.build.flavor" "lineage_userdebug"
sp_try "ro.build.flavor" "userdebug" "user"
assert_prop_eq "sp_try(3) replaces needle with value" "ro.build.flavor" "user"

set_prop "ro.build.flavor" "lineage_user"
sp_try "ro.build.flavor" "userdebug" "user"
assert_prop_eq "sp_try(3) skips if needle not found" "ro.build.flavor" "lineage_user"

# ---- apply_boot_props: pre-seed with wrong values to verify fix ----
bootstrap
source_libs
# Most props don't exist in test env, but we pre-seed a few wrong ones
set_prop "ro.build.type" "eng"
set_prop "ro.build.tags" "dev-keys"
set_prop "ro.warranty_bit" "1"
set_prop "ro.boot.vbmeta.device_state" "unlocked"
set_prop "ro.boot.verifiedbootstate" "orange"
set_prop "ro.boot.flash.locked" "0"
set_prop "ro.secure" "0"
set_prop "ro.build.selinux" "0"
set_prop "ro.kernel.qemu" "1"
set_prop "ro.boot.qemu" "1"
set_prop "ro.boot.selinux" "permissive"
set_prop "ro.vendor.build.type" "eng"

apply_boot_props
assert_prop_eq "boot: build.type eng->user"                "ro.build.type" "user"
assert_prop_eq "boot: build.tags dev-keys->release-keys"   "ro.build.tags" "release-keys"
assert_prop_eq "boot: warranty_bit 1->0"                   "ro.warranty_bit" "0"
assert_prop_eq "boot: vbmeta unlocked->locked"             "ro.boot.vbmeta.device_state" "locked"
assert_prop_eq "boot: verifiedbootstate orange->green"     "ro.boot.verifiedbootstate" "green"
assert_prop_eq "boot: flash.locked 0->1"                   "ro.boot.flash.locked" "1"
assert_prop_eq "boot: secure 0->1"                         "ro.secure" "1"
assert_prop_eq "boot: build.selinux 0->1"                  "ro.build.selinux" "1"
assert_prop_eq "boot: kernel.qemu 1->0"                    "ro.kernel.qemu" "0"
assert_prop_eq "boot: boot.qemu 1->0"                      "ro.boot.qemu" "0"
assert_prop_eq "boot: boot.selinux permissive->enforcing"  "ro.boot.selinux" "enforcing"
assert_prop_eq "boot: vendor.build.type eng->user"         "ro.vendor.build.type" "user"


# ---- apply_boot_hardening: no crash when selinux enforced ----
bootstrap
source_libs
apply_boot_hardening
ok "hardening: no crash when already enforcing"

# ---- spoof_build_props: userdebug -> user (preserves prefix) ----
bootstrap
source_libs
set_prop "ro.build.flavor" "lineage_userdebug"
spoof_build_props
assert_prop_eq "spoof: lineage_userdebug->lineage_user" "ro.build.flavor" "lineage_user"

# ---- spoof_build_props: eng -> user (preserves prefix) ----
bootstrap
source_libs
set_prop "ro.build.flavor" "aosp_eng"
spoof_build_props
assert_prop_eq "spoof: aosp_eng->aosp_user" "ro.build.flavor" "aosp_user"

# ---- spoof_build_props: user stays user ----
bootstrap
source_libs
set_prop "ro.build.flavor" "lineage_user"
spoof_build_props
assert_prop_eq "spoof: user unchanged" "ro.build.flavor" "lineage_user"

# ---- _feature_should_run ----
bootstrap
source_libs
set_cfg "toggle_test_feature" "1"
_feature_should_run "test_feature"; _rc=$?
assert_exit_code "feature: enabled when toggle=1" 0 $_rc

set_cfg "toggle_test_feature" "0"
_feature_should_run "test_feature"; _rc=$?
assert_exit_code "feature: disabled when toggle=0" 1 $_rc

# custom default
_feature_should_run "opt_in_feature" 0; _rc=$?
assert_exit_code "feature: opt-in defaults to disabled" 1 $_rc

# ---- hide_recovery_folders ----
bootstrap
source_libs
hide_recovery_folders
ok "recovery: no crash when no recovery dirs"

# ---- hexpatch_deleteprop ----
bootstrap
source_libs
set_prop "ro.test.prop" "bad_value"
hexpatch_deleteprop "ro.test.prop"
assert_prop_not_set "hexpatch: prop deleted" "ro.test.prop"

# ---- version_ge ----
source_libs  # re-sourcing ok since idempotent
version_ge "1.0" "1.0";   assert_exit_code "ver: 1.0 >= 1.0" 0 $?
version_ge "2.0" "1.0";   assert_exit_code "ver: 2.0 >= 1.0" 0 $?
version_ge "1.0" "2.0";   assert_exit_code "ver: 1.0 < 2.0" 1 $?
version_ge "1.0.1" "1.0"; assert_exit_code "ver: 1.0.1 >= 1.0" 0 $?

done_testing
