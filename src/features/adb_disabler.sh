#!/system/bin/sh
set -e
MODDIR=${0%/*}
. "$MODDIR/../lib/common.sh"
. "$MODDIR/../lib/paths.sh"
. "$MODDIR/../lib/config_env.sh"

log "ADB" "Disabling USB debugging and developer options"

_dev_opt=$(cfg_get toggle_adb_disabler_dev_options 1)
_usb_dbg=$(cfg_get toggle_adb_disabler_usb_debug 1)

if [ "$_dev_opt" != "0" ]; then
  settings put global development_settings_enabled 0
  log "ADB" "Developer options disabled"
fi

if [ "$_usb_dbg" != "0" ]; then
  resetprop -n ro.debuggable 0
  resetprop -n ro.force.debuggable 0
  resetprop -n ro.adb.secure 1

  strip_adb_from_usb_config() {
      local PROP="$1"
      local VAL="$(resetprop "$PROP")"
      if [ -n "$VAL" ]; then
          local NEWVAL="$(echo "$VAL" | sed 's/,adb//g; s/adb,//g; s/^adb$//; s/^adb,//')"
          if [ "$NEWVAL" != "$VAL" ]; then
              resetprop -n "$PROP" "$NEWVAL"
          fi
      fi
  }

  strip_adb_from_usb_config persist.sys.usb.config
  strip_adb_from_usb_config sys.usb.config

  resetprop -n sys.oem_unlock_allowed 0
  settings put global adb_enabled 0
  log "ADB" "USB debugging disabled"
fi

log "ADB" "Done"
