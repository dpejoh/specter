#!/system/bin/sh
set -e
MODDIR=${0%/*}
. "$MODDIR/../lib/common.sh"
. "$MODDIR/../lib/constants.sh"

log_i "ADB" "Disabling USB debugging and developer options"

_dev_opt=$(cfg_get toggle_adb_disabler_dev_options 1)
_usb_dbg=$(cfg_get toggle_adb_disabler_usb_debug 1)
_oem_unlock=$(cfg_get toggle_adb_disabler_oem_unlock 1)

if [ "$_dev_opt" != "0" ]; then
  settings put global development_settings_enabled 0 && log_d "ADB" "development_settings_enabled → 0"
  resetprop -n persist.sys.development_settings_enabled 0 && log_d "ADB" "persist.sys.development_settings_enabled → 0"
  log_i "ADB" "Developer options disabled"
fi

if [ "$_usb_dbg" != "0" ]; then
  resetprop -n ro.debuggable 0 && log_d "ADB" "ro.debuggable → 0"
  resetprop -n ro.force.debuggable 0 && log_d "ADB" "ro.force.debuggable → 0"
  resetprop -n ro.adb.secure 1 && log_d "ADB" "ro.adb.secure → 1"
  resetprop -n persist.sys.usb.config mtp && log_d "ADB" "persist.sys.usb.config → mtp"
  resetprop -n sys.usb.config mtp && log_d "ADB" "sys.usb.config → mtp"
  resetprop -n sys.oem_unlock_allowed 0 && log_d "ADB" "sys.oem_unlock_allowed → 0"
  resetprop -n service.adb.root 0 && log_d "ADB" "service.adb.root → 0"
  settings put global adb_enabled 0 && log_d "ADB" "adb_enabled → 0"
  log_i "ADB" "USB debugging disabled"
fi

if [ "$_oem_unlock" != "0" ]; then
  resetprop -n ro.oem_unlock_supported 0 && log_d "ADB" "ro.oem_unlock_supported → 0"
  log_i "ADB" "OEM unlock support hidden"
fi

log_i "ADB" "ADB disabler complete"
