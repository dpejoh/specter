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

set_prop "ro.build.type" "eng"
set_prop "ro.build.flavor" "lineage_userdebug"
set_prop "ro.build.selinux" "0"
set_prop "ro.secure" "0"

_boot_state=$(cfg_get boot_state_props 1)
_spoof_build=$(cfg_get spoof_build_props 1)
_sp=$(cfg_get suspicious_props 1)

if [ "$_boot_state" != "0" ]; then
  apply_boot_props
fi
if [ "$_spoof_build" != "0" ]; then
  spoof_build_props
fi

assert_prop_eq "props: build.type=user"              "ro.build.type" "user"
assert_prop_eq "props: build.flavor lineage_user"    "ro.build.flavor" "lineage_user"
assert_prop_eq "props: selinux=1"                    "ro.build.selinux" "1"
assert_prop_eq "props: secure=1"                     "ro.secure" "1"

# ---- scenario: only boot_state_props ----
bootstrap
source_libs
set_cfg "toggle_prop_handler" "1"
set_cfg "boot_state_props" "1"
set_cfg "spoof_build_props" "0"
set_cfg "suspicious_props" "0"

set_prop "ro.build.type" "userdebug"

if [ "$(cfg_get boot_state_props 1)" != "0" ]; then
  apply_boot_props
fi
assert_prop_eq "props: only boot_state runs" "ro.build.type" "user"
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
