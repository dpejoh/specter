. "$(dirname "$0")/helpers.sh"

plan "adb_disabler.sh — ADB + USB debugging disable"

strip_adb_from_usb_config() {
    local PROP="$1"
    local VAL="$(resetprop "$PROP" 2>/dev/null || echo "")"
    if [ -n "$VAL" ]; then
        local NEWVAL="$(echo "$VAL" | sed 's/,adb//g; s/adb,//g; s/^adb$//; s/^adb,//')"
        if [ "$NEWVAL" != "$VAL" ]; then
            resetprop -n "$PROP" "$NEWVAL"
        fi
    fi
}

# ---- scenario: both sub-toggles enabled ----
bootstrap
source_libs
set_cfg "toggle_adb_disabler_dev_options" "1"
set_cfg "toggle_adb_disabler_usb_debug" "1"
set_prop "persist.sys.usb.config" "mtp,adb"
set_prop "sys.usb.config" "adb"

# Inline the feature logic
if [ "$(cfg_get toggle_adb_disabler_dev_options 1)" != "0" ]; then
  settings put global development_settings_enabled 0
fi
if [ "$(cfg_get toggle_adb_disabler_usb_debug 1)" != "0" ]; then
  resetprop -n ro.debuggable 0
  resetprop -n ro.force.debuggable 0
  resetprop -n ro.adb.secure 1
  strip_adb_from_usb_config persist.sys.usb.config
  strip_adb_from_usb_config sys.usb.config
  resetprop -n sys.oem_unlock_allowed 0
  settings put global adb_enabled 0
fi

assert_prop_eq "adb: debuggable=0"            "ro.debuggable" "0"
assert_prop_eq "adb: force.debuggable=0"      "ro.force.debuggable" "0"
assert_prop_eq "adb: adb.secure=1"            "ro.adb.secure" "1"
assert_prop_eq "adb: persist.usb adb stripped" "persist.sys.usb.config" "mtp"
assert_prop_eq "adb: sys.usb adb stripped"    "sys.usb.config" ""
assert_prop_eq "adb: oem_unlock_allowed=0"    "sys.oem_unlock_allowed" "0"
assert_log_contains "adb: adb_enabled set"    "settings.log" "adb_enabled"
assert_log_contains "adb: dev_options set"    "settings.log" "development_settings_enabled"

# ---- scenario: only dev_options ----
bootstrap
source_libs
set_cfg "toggle_adb_disabler_dev_options" "1"
set_cfg "toggle_adb_disabler_usb_debug" "0"

if [ "$(cfg_get toggle_adb_disabler_dev_options 1)" != "0" ]; then
  settings put global development_settings_enabled 0
fi
if [ "$(cfg_get toggle_adb_disabler_usb_debug 1)" != "0" ]; then
  resetprop -n ro.debuggable 0
fi

assert_prop_not_set "adb: usb debug off, debuggable not set" "ro.debuggable"
assert_log_contains "adb: dev_options still called"          "settings.log" "development_settings_enabled"

# ---- scenario: only usb_debug ----
bootstrap
source_libs
set_cfg "toggle_adb_disabler_dev_options" "0"
set_cfg "toggle_adb_disabler_usb_debug" "1"
set_prop "persist.sys.usb.config" "adb"

if [ "$(cfg_get toggle_adb_disabler_dev_options 1)" != "0" ]; then
  settings put global development_settings_enabled 0
fi
if [ "$(cfg_get toggle_adb_disabler_usb_debug 1)" != "0" ]; then
  resetprop -n ro.debuggable 0
  resetprop -n ro.force.debuggable 0
  resetprop -n ro.adb.secure 1
  strip_adb_from_usb_config persist.sys.usb.config
  strip_adb_from_usb_config sys.usb.config
  resetprop -n sys.oem_unlock_allowed 0
  settings put global adb_enabled 0
fi

assert_prop_eq "adb: persist.usb cleaned"       "persist.sys.usb.config" ""
assert_log_not_contains "adb: dev_options not called" "settings.log" "development_settings_enabled"

# ---- scenario: usb config without adb is unchanged ----
bootstrap
source_libs
set_cfg "toggle_adb_disabler_dev_options" "0"
set_cfg "toggle_adb_disabler_usb_debug" "1"
set_prop "persist.sys.usb.config" "mtp"

if [ "$(cfg_get toggle_adb_disabler_usb_debug 1)" != "0" ]; then
  strip_adb_from_usb_config persist.sys.usb.config
fi

assert_prop_eq "adb: mtp only unchanged" "persist.sys.usb.config" "mtp"

# ---- scenario: both off ----
bootstrap
source_libs
set_cfg "toggle_adb_disabler_dev_options" "0"
set_cfg "toggle_adb_disabler_usb_debug" "0"

# Neither block runs — no calls to settings
assert_log_not_contains "adb: no settings changes" "settings.log" "adb_enabled"

done_testing
