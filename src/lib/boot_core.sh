# shellcheck shell=sh

[ -n "$MODDIR" ] || { echo "[BOOT] MODDIR not set" >&2; exit 1; }

log "BOOT" "Running unified boot core"

mkdir -p "$SPECTER_DIR/log" 2>/dev/null || true

if [ "$(cfg_get toggle_prop_handler 1)" != "0" ]; then
  [ "$(cfg_get boot_state_props 1)" != "0" ] && apply_boot_props
  [ "$(cfg_get spoof_build_props 1)" != "0" ] && spoof_build_props
fi

for _bf in recovery boot_hardening lsposed security_patch adb_disabler rom_fingerprint vbmeta; do
  case "$_bf" in *[!a-zA-Z0-9_-]*) log "BOOT" "Skipping invalid feature: $_bf"; continue ;; esac
  _bf_default=1
  case "$_bf" in adb_disabler|rom_fingerprint) _bf_default=0 ;; esac
  _feature_should_run "$_bf" $_bf_default || { log "BOOT" "Skipping $_bf (disabled by config)"; continue; }
  sh "$MODDIR/features/$_bf.sh" >"$SPECTER_DIR/log/boot_${_bf}.log" 2>&1 || log "BOOT" "Feature $_bf failed (exit $? — see log/boot_${_bf}.log)"
done
unset _bf _bf_default

_feature_should_run "prop_handler" && sh "$MODDIR/features/boot_state_props.sh" >"$SPECTER_DIR/log/boot_state_props.log" 2>&1 || log "BOOT" "Skipping boot_state_props (disabled by config)"

log "BOOT" "Boot-time features done"

log "BOOT" "Cleaning bootloader spoofer"
disable_bootloader_spoofer 2>/dev/null || true

if [ -f "$SPECTER_DIR/tee_reported" ]; then
  ( sh "$MODDIR/features/tee.sh" >/dev/null 2>&1 ) &
  rm -f "$SPECTER_DIR/tee_reported"
fi

if [ -f "$SPECTER_DIR/rom_spoof_reported" ]; then
  sh "$MODDIR/features/rom_spoof_cleanup.sh" >/dev/null 2>&1 || true
  rm -f "$SPECTER_DIR/rom_spoof_reported"
fi

sh "$MODDIR/features/keybox_info.sh" >/dev/null 2>&1 &

. "$MODDIR/lib/desc.sh"
refresh_module_description

if [ "$(cfg_get toggle_prop_handler 1)" != "0" ]; then
  (
    while [ -f "$SPECTER_DIR/loop_prop_handler.pid" ]; do
      sleep 3600
      [ -d "$MODDIR" ] || exit 0
      sh "$MODDIR/features/boot_state_props.sh" >>"$SPECTER_DIR/log/boot_state_props.log" 2>&1 || true
    done
  ) &
  echo "$!" > "$SPECTER_DIR/loop_prop_handler.pid"
fi

if [ "$(cfg_get toggle_auto_target 0)" = "1" ]; then
  sh "$MODDIR/features/auto_target.sh" >"$SPECTER_DIR/log/auto_target.log" 2>&1 &
fi

(
  while [ -f "$SPECTER_DIR/loop_keybox_info.pid" ]; do
    sleep 21600
    [ -d "$MODDIR" ] || exit 0
    sh "$MODDIR/features/keybox_info.sh" >"$SPECTER_DIR/log/keybox_info.log" 2>&1 || true
    . "$MODDIR/lib/desc.sh"
    refresh_module_description
  done
) &
echo "$!" > "$SPECTER_DIR/loop_keybox_info.pid"

log "BOOT" "Unified boot core done"
