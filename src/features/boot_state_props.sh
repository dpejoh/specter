#!/system/bin/sh
set -e
MODDIR=${0%/*}
. "$MODDIR/../lib/common.sh"
. "$MODDIR/../lib/constants.sh"

log_i "PROPS" "Starting boot-time property hardening"

# --- Conditional toggles ---
_do_proc=$(cfg_get boot_hardening_proc 1)
_do_bootmode=$(cfg_get boot_hardening_bootmode 1)
_do_bootprops=$(cfg_get boot_state_props 1)
_do_spoof=$(cfg_get spoof_build_props 1)
_do_region=$(cfg_get region_props 1)
_do_persist_scan=1  # always check persistent props

# --- 1. Proc hardening (formerly boot_hardening.sh) ---
if [ "$_do_proc" != "0" ]; then
  chmod 440 /proc/cmdline 2>/dev/null && log_i "PROPS" "chmod 440 /proc/cmdline" || true
  chmod 440 /proc/net/unix 2>/dev/null && log_i "PROPS" "chmod 440 /proc/net/unix" || true
  find /vendor/bin /system/bin -name install-recovery.sh -exec chmod 440 {} + -print 2>/dev/null | while read -r _ir; do log_i "PROPS" "chmod 440 $_ir"; done
  log_i "PROPS" "Proc hardening applied"
fi

# --- 2. Bootmode hardening (formerly boot_hardening.sh) ---
if [ "$_do_bootmode" != "0" ]; then
  for _bm in ro.boot.bootmode ro.bootmode vendor.boot.bootmode; do
    _bm_val=$(resetprop "$_bm" 2>/dev/null || echo "")
    case "$_bm_val" in *recovery*)
      sp_try "$_bm" "unknown"
      log_i "PROPS" "$_bm: recovery → unknown"
    ;; esac
  done
  unset _bm _bm_val
  log_i "PROPS" "Bootmode hardening applied"
fi

# --- 3. Boot property overrides (formerly inline in service.sh) ---
if [ "$_do_bootprops" != "0" ]; then
  apply_boot_props
  log_i "PROPS" "Boot property overrides applied"
fi

# --- 4. Build type spoofing (formerly inline in service.sh) ---
if [ "$_do_spoof" != "0" ]; then
  spoof_build_props
  log_i "PROPS" "Build type spoofing applied"
fi

# --- 5. Region-specific props (formerly inline in service.sh) ---
if [ "$_do_region" != "0" ]; then
  apply_region_props
  log_i "PROPS" "Region-specific props applied"
fi

# --- 6. Persistent prop scan (existing logic) ---
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
