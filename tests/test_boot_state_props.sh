. "$(dirname "$0")/helpers.sh"

plan "boot_state_props.sh — boot props + build spoof + suspicious props clean"

# ---- scenario: master toggle off (inline guard) ----
bootstrap
source_libs
set_cfg "toggle_prop_handler" "0"

_should_exit=false
[ "$(cfg_get toggle_prop_handler 1)" = "0" ] && _should_exit=true

assert_eq "props: master off detected" "true" "$_should_exit"

# ---- scenario: all three sub-toggles enabled ----
bootstrap
source_libs
set_cfg "toggle_prop_handler" "1"
set_cfg "boot_state_props" "1"
set_cfg "spoof_build_props" "1"
set_cfg "suspicious_props" "1"

# Static props (build.type, selinux, secure) moved to system.prop.
# apply_boot_props() now only handles partition-specific wildcards + dm-verity.
set_prop "ro.vendor.build.type" "eng"
set_prop "partition.system.verified" "0"
set_prop "partition.vendor.verified" "0"
set_prop "partition.product.verified" "0"
set_prop "ro.build.flavor" "lineage_userdebug"

if [ "$(cfg_get boot_state_props 1)" != "0" ]; then
  apply_boot_props
fi
if [ "$(cfg_get spoof_build_props 1)" != "0" ]; then
  spoof_build_props
fi

assert_prop_eq "props: vendor.build.type=user"       "ro.vendor.build.type" "user"
assert_prop_eq "props: build.flavor lineage_user"    "ro.build.flavor" "lineage_user"

# ---- scenario: only boot_state_props ----
bootstrap
source_libs
set_cfg "toggle_prop_handler" "1"
set_cfg "boot_state_props" "1"
set_cfg "spoof_build_props" "0"
set_cfg "suspicious_props" "0"

set_prop "ro.system.build.type" "userdebug"

if [ "$(cfg_get boot_state_props 1)" != "0" ]; then
  apply_boot_props
fi
assert_prop_eq "props: only boot_state runs" "ro.system.build.type" "user"
assert_prop_not_set "props: spoof did not run" "ro.build.flavor"

# ---- scenario: only spoof_build_props ----
bootstrap
source_libs
set_cfg "toggle_prop_handler" "1"
set_cfg "boot_state_props" "0"
set_cfg "spoof_build_props" "1"
set_cfg "suspicious_props" "0"

set_prop "ro.build.flavor" "aosp_eng"

if [ "$(cfg_get spoof_build_props 1)" != "0" ]; then
  spoof_build_props
fi
assert_prop_eq "props: aosp_eng->aosp_user" "ro.build.flavor" "aosp_user"

done_testing
