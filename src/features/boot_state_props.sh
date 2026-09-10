#!/system/bin/sh
set -e
MODDIR=${0%/*}
. "$MODDIR/../lib/common.sh"
. "$MODDIR/../lib/constants.sh"

[ "$(cfg_get toggle_prop_handler 1)" = "0" ] && exit 0

log_i "PROPS" "Starting boot-time property hardening"

# --- Conditional toggles ---
_do_bootprops=$(cfg_get toggle_boot_state_props 1)
_do_bootmode=$(cfg_get toggle_bootmode_spoof 1)
_do_persist_scan=1  # always check persistent props

# --- 1. Boot property overrides (formerly inline in service.sh) ---
if [ "$_do_bootprops" != "0" ]; then
  if [ "$_do_bootmode" != "0" ]; then
    sp_try "ro.bootmode" "normal"
  fi

  apply_boot_props
  log_i "PROPS" "Boot property overrides applied"

  if [ -f "$MODDIR/boot_hash.sh" ]; then
    sh "$MODDIR/boot_hash.sh" || log_w "PROPS" "Boot hash resolution failed"
  fi
fi

# --- 2. Persistent prop scan (existing logic) ---
PROP_FILE="/data/property/persistent_properties"
if [ -f "$PROP_FILE" ]; then
  if strings "$PROP_FILE" 2>/dev/null | grep -qiE "lsposed|hyperceiler|luckytool"; then
    log_i "PROPS" "Suspicious props detected, cleaning..."
    cp "$PROP_FILE" "$PROP_FILE.bak" 2>/dev/null || true
    strings "$PROP_FILE" 2>/dev/null | grep -iE "lsposed|hyperceiler|luckytool" | while read -r _prop; do
      resetprop -p --delete "$_prop" 2>/dev/null || true
      log_i "PROPS" "Deleted: $_prop"
    done
    unset _prop
    log_i "PROPS" "Boot state props cleaned"
  else
    log_i "PROPS" "No suspicious persistent props found"
  fi
else
  log_i "PROPS" "Persistent properties file not present"
fi

log_i "PROPS" "Boot-time property hardening complete"
exit 0
