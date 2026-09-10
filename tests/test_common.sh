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

# ---- sp_force: sets prop even if missing ----
rm -f "$PROPS_DIR/ro.boot.flash.locked"
sp_force "ro.boot.flash.locked" "1"
assert_prop_eq "sp_force sets missing prop" "ro.boot.flash.locked" "1"
set_prop "ro.boot.flash.locked" "0"
sp_force "ro.boot.flash.locked" "1"
assert_prop_eq "sp_force overrides wrong value" "ro.boot.flash.locked" "1"

# ---- apply_boot_props: one-line props ----
bootstrap
source_libs
set_prop "ro.build.selinux" "0"
set_prop "ro.secure" "0"
set_prop "ro.crypto.state" "unencrypted"
set_prop "ro.build.type" "eng"
set_prop "ro.build.tags" "dev-keys"
set_prop "ro.boot.warranty_bit" "1"
set_prop "ro.warranty_bit" "1"
set_prop "ro.vendor.warranty_bit" "1"
set_prop "ro.boot.vbmeta.device_state" "unlocked"
set_prop "ro.boot.verifiedbootstate" "orange"
# Note: ro.boot.flash.locked is omitted here to verify it gets set even when missing from device
set_prop "ro.boot.veritymode" "eio"
set_prop "ro.boot.selinux" "permissive"
set_prop "ro.system.build.tags" "dev-keys"

apply_boot_props
assert_prop_eq "boot: selinux 0→1"            "ro.build.selinux" "1"
assert_prop_eq "boot: secure 0→1"            "ro.secure" "1"
assert_prop_eq "boot: crypto→encrypted"      "ro.crypto.state" "encrypted"
assert_prop_eq "boot: build.type eng→user"   "ro.build.type" "user"
assert_prop_eq "boot: build.tags→release"    "ro.build.tags" "release-keys"
assert_prop_eq "boot: warranty_bit 1→0"      "ro.boot.warranty_bit" "0"
assert_prop_eq "boot: ro.warranty_bit 1→0"   "ro.warranty_bit" "0"
assert_prop_eq "boot: vendor.warranty_bit 1→0" "ro.vendor.warranty_bit" "0"
assert_prop_eq "boot: device_state→locked"   "ro.boot.vbmeta.device_state" "locked"
assert_prop_eq "boot: verifiedbootstate→green" "ro.boot.verifiedbootstate" "green"
assert_prop_eq "boot: flash.locked missing→1" "ro.boot.flash.locked" "1"
assert_prop_eq "boot: veritymode→enforcing"  "ro.boot.veritymode" "enforcing"
assert_prop_eq "boot: selinux→enforcing"     "ro.boot.selinux" "enforcing"

# ---- apply_boot_props: partition build.type ----
bootstrap
source_libs
set_prop "ro.vendor.build.type" "eng"
set_prop "ro.product.build.type" "eng"
set_prop "ro.system.build.type" "userdebug"
set_prop "ro.odm.build.type" "eng"
set_prop "ro.product.vendor.build.type" "eng"
set_prop "ro.product.odm.build.type" "eng"

apply_boot_props
assert_prop_eq "boot: vendor.build.type→user"        "ro.vendor.build.type" "user"
assert_prop_eq "boot: product.build.type→user"       "ro.product.build.type" "user"
assert_prop_eq "boot: system.build.type→user"        "ro.system.build.type" "user"
assert_prop_eq "boot: odm.build.type→user"           "ro.odm.build.type" "user"
assert_prop_eq "boot: product.vendor.build.type→user" "ro.product.vendor.build.type" "user"
assert_prop_eq "boot: product.odm.build.type→user"   "ro.product.odm.build.type" "user"

# ---- apply_boot_props: partition build.tags ----
bootstrap
source_libs
set_prop "ro.product.build.tags" "dev-keys"
set_prop "ro.system.build.tags" "dev-keys"
set_prop "ro.vendor.build.tags" "test-keys"
set_prop "ro.odm.build.tags" "dev-keys"
set_prop "ro.product.vendor.build.tags" "dev-keys"
set_prop "ro.product.odm.build.tags" "dev-keys"

apply_boot_props
assert_prop_eq "boot: product.build.tags→rel"         "ro.product.build.tags" "release-keys"
assert_prop_eq "boot: system.build.tags→rel"          "ro.system.build.tags" "release-keys"
assert_prop_eq "boot: vendor.build.tags→rel"          "ro.vendor.build.tags" "release-keys"
assert_prop_eq "boot: odm.build.tags→rel"             "ro.odm.build.tags" "release-keys"
assert_prop_eq "boot: product.vendor.build.tags→rel"  "ro.product.vendor.build.tags" "release-keys"
assert_prop_eq "boot: product.odm.build.tags→rel"     "ro.product.odm.build.tags" "release-keys"

# ---- apply_boot_props: partition verified ----
bootstrap
source_libs
set_prop "partition.system.verified" "0"
set_prop "partition.vendor.verified" "0"
set_prop "partition.product.verified" "0"
set_prop "partition.system_ext.verified" "0"
set_prop "partition.odm.verified" "0"

apply_boot_props
assert_prop_eq "boot: system.verified 0→1"       "partition.system.verified" "1"
assert_prop_eq "boot: vendor.verified 0→1"       "partition.vendor.verified" "1"
assert_prop_eq "boot: product.verified 0→1"      "partition.product.verified" "1"
assert_prop_eq "boot: system_ext.verified 0→1"   "partition.system_ext.verified" "1"
assert_prop_eq "boot: odm.verified 0→1"          "partition.odm.verified" "1"

# ---- spoof_build_props: userdebug → user ----
bootstrap
source_libs
set_prop "ro.build.flavor" "lineage_userdebug"
spoof_build_props
assert_prop_eq "spoof: lineage_userdebug→lineage_user" "ro.build.flavor" "lineage_user"

# ---- spoof_build_props: eng → user ----
bootstrap
source_libs
set_prop "ro.build.flavor" "aosp_eng"
spoof_build_props
assert_prop_eq "spoof: aosp_eng→aosp_user" "ro.build.flavor" "aosp_user"

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

_feature_should_run "opt_in_feature" 0; _rc=$?
assert_exit_code "feature: opt-in defaults to disabled" 1 $_rc

# ---- version_ge ----
source_libs
version_ge "1.0" "1.0";   assert_exit_code "ver: 1.0 >= 1.0" 0 $?
version_ge "2.0" "1.0";   assert_exit_code "ver: 2.0 >= 1.0" 0 $?
version_ge "1.0" "2.0";   assert_exit_code "ver: 1.0 < 2.0" 1 $?
version_ge "1.0.1" "1.0"; assert_exit_code "ver: 1.0.1 >= 1.0" 0 $?

done_testing
