# shellcheck shell=sh

[ -n "$MODDIR" ] || { echo "[BOOT] MODDIR not set" >&2; exit 1; }

BOOT_LOG="$SPECTER_DIR/log/boot.log"
mkdir -p "$SPECTER_DIR/log" 2>/dev/null || true
log_rotate "$BOOT_LOG"
exec >>"$BOOT_LOG" 2>&1

log "BOOT" "Running unified boot core"

for _bf in boot_hardening lsposed adb_disabler rom_fingerprint vbmeta; do
  case "$_bf" in *[!a-zA-Z0-9_-]*) log "BOOT" "Skipping invalid feature: $_bf"; continue ;; esac
  _bf_default=1
  case "$_bf" in adb_disabler|rom_fingerprint) _bf_default=0 ;; esac
  _feature_should_run "$_bf" $_bf_default || { log "BOOT" "Skipping $_bf (disabled by config)"; continue; }
  sh "$MODDIR/features/$_bf.sh" >"$SPECTER_DIR/log/boot_${_bf}.log" 2>&1 || log "BOOT" "Feature $_bf failed (exit $? — see log/boot_${_bf}.log)"
done
unset _bf _bf_default

if _feature_should_run "prop_handler"; then
  [ "$(cfg_get boot_state_props 1)" != "0" ] && ! _conflict_claimed "boot_state_props" && apply_boot_props
  [ "$(cfg_get spoof_build_props 1)" != "0" ] && ! _conflict_claimed "spoof_build_props" && spoof_build_props
  [ "$(cfg_get region_props 1)" != "0" ] && ! _conflict_claimed "region_props" && apply_region_props
  sh "$MODDIR/features/boot_state_props.sh" >"$SPECTER_DIR/log/boot_state_props.log" 2>&1
else
  log "BOOT" "Skipping boot_state_props (disabled by config)"
fi

log "BOOT" "Boot-time features done"

# Skip on first boot — first_boot_setup already handles target.txt
if [ ! -f "$MODDIR/.first_boot_pending" ] && [ "$ROOT_SOL" = "magisk" ] && [ "$(cfg_get toggle_denylist_merge 1)" != "0" ]; then
  sh "$MODDIR/features/target.sh" --merge-denylist >"$SPECTER_DIR/log/boot_denylist.log" 2>&1 || log "BOOT" "Denylist merge failed"
fi

log "BOOT" "Cleaning bootloader spoofer"
disable_bootloader_spoofer 2>/dev/null || true

if [ -f "$SPECTER_DIR/tee_reported" ]; then
  sh "$MODDIR/features/tee.sh" >"$SPECTER_DIR/log/boot_tee.log" 2>&1 || log "BOOT" "TEE check failed"
  rm -f "$SPECTER_DIR/tee_reported"
fi

if [ -f "$SPECTER_DIR/rom_spoof_reported" ]; then
  sh "$MODDIR/features/rom_spoof_cleanup.sh" >/dev/null 2>&1 || true
  rm -f "$SPECTER_DIR/rom_spoof_reported"
fi

# One-shot first-boot setup (keybox install + target generation)
if [ -f "$MODDIR/.first_boot_pending" ]; then
  log "BOOT" "First-boot setup pending, running..."
  sh "$MODDIR/features/first_boot_setup.sh" >"$SPECTER_DIR/log/first_boot_setup.log" 2>&1 || log "BOOT" "First-boot setup failed (see log/first_boot_setup.log)"
  rm -f "$MODDIR/.first_boot_pending"
  log "BOOT" "First-boot setup complete"
fi

. "$MODDIR/lib/desc.sh"
refresh_module_description

if [ "$(cfg_get toggle_scheduler 1)" != "0" ]; then
  sh "$MODDIR/lib/scheduler.sh" >"$SPECTER_DIR/log/scheduler.log" 2>&1 &
  log "BOOT" "Scheduler launched (PID $!)"
fi

log "BOOT" "Unified boot core done"
