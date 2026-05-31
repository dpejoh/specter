# shellcheck shell=sh
# Unified boot logic for both Magisk (via service.sh) and KSU/APatch (via boot-completed.sh).
# Sourced after sys.boot_completed=1 and basic common libs are loaded.
# Single source of truth for all boot-time features, no more platform fork drift.

[ -n "$MODDIR" ] || { echo "[BOOT] MODDIR not set" >&2; exit 1; }
# Requires: caller has sourced common.sh, paths.sh, config_env.sh and called detect_root_solution

log "BOOT" "Running unified boot core"



# Critical boot props are set in post-fs-data.sh (before framework starts, all root solutions).
# boot_state_props.sh below re-applies as a safety net at boot_completed.

# Boot-time features, single authoritative list, all dispatched as scripts
for _bf in recovery boot_hardening lsposed security_patch adb_disabler rom_fingerprint vbmeta; do
  case "$_bf" in *[!a-zA-Z0-9_-]*) log "BOOT" "Skipping invalid feature: $_bf"; continue ;; esac
  case "$_bf" in adb_disabler|rom_fingerprint) _feature_should_run "$_bf" 0 || continue ;; *) _feature_should_run "$_bf" || continue ;; esac
  sh "$MODDIR/features/$_bf.sh" >/dev/null 2>&1 || true
done
unset _bf

# Boot state props + suspicious props clean (gated by toggle_prop_handler master)
_feature_should_run "prop_handler" && sh "$MODDIR/features/boot_state_props.sh" >/dev/null 2>&1 || true

log "BOOT" "Boot-time features done (critical props set in post-fs-data.sh)"

# TEE: run only on first boot after install (marker set by customize.sh)
if [ -f "$SPECTER_DIR/tee_reported" ]; then
  ( sh "$MODDIR/features/tee.sh" >/dev/null 2>&1 ) &
  rm -f "$SPECTER_DIR/tee_reported"
fi

if [ -f "$SPECTER_DIR/rom_spoof_reported" ]; then
  sh "$MODDIR/features/rom_spoof_cleanup.sh" >/dev/null 2>&1 || true
  rm -f "$SPECTER_DIR/rom_spoof_reported"
fi

# Generate fresh keybox info for description (backgrounded, no blocking)
sh "$MODDIR/features/keybox_info.sh" >/dev/null 2>&1 &

. "$MODDIR/lib/desc.sh"
refresh_module_description

# Periodic suspicious props cleaning, re-run every hour.
# No delayed re-apply needed: props are set in post-fs-data.sh (before framework)
# and re-applied above in boot_state_props.sh (right at boot_completed).
# The hourly loop below catches any runtime changes.
if [ "$(cfg_get toggle_prop_handler 1)" != "0" ]; then
  (
    while true; do
      sleep 3600
      sh "$MODDIR/features/boot_state_props.sh" >/dev/null 2>&1 || true
    done
  ) &
fi

# Auto-targeting daemon, watches for new app installs and adds them to target.txt
if [ "$(cfg_get toggle_auto_target 0)" = "1" ]; then
  sh "$MODDIR/features/auto_target.sh" >/dev/null 2>&1 &
fi

# Periodic keybox info refresh, keeps cache fresh, updates module description
(
  while true; do
    sleep 21600
    sh "$MODDIR/features/keybox_info.sh" >/dev/null 2>&1 || true
    . "$MODDIR/lib/desc.sh"
    refresh_module_description
  done
) &

log "BOOT" "Unified boot core done"
