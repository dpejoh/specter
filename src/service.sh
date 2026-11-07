#!/system/bin/sh
set -e
MODDIR=${0%/*}
. "$MODDIR/lib/common.sh"
export ROOT_SOL

# Remove first-boot token immediately on EVERY boot so it never
# persists if we crash/hang before the first-boot block
_specter_first_boot=0
[ -f "$SPECTER_DIR/.first_boot_pending" ] && { _specter_first_boot=1; rm -f "$SPECTER_DIR/.first_boot_pending"; }

BOOT_LOG="$SPECTER_DIR/log/boot.log"
mkdir -p "$SPECTER_DIR/log" 2>/dev/null || true
log_rotate "$BOOT_LOG"
exec >>"$BOOT_LOG" 2>&1

log_i "SERVICE" "Running Specter boot tasks"

# Migrate legacy .val files to val/ subdirectory
if [ -d "$CONFIG_DIR" ] && [ ! -d "$CONFIG_DIR/val" ] && ls "$CONFIG_DIR"/*.val >/dev/null 2>&1; then
  mkdir -p "$CONFIG_DIR/val"
  for _f in "$CONFIG_DIR"/*.val; do
    [ -f "$_f" ] || continue
    mv "$_f" "$CONFIG_DIR/val/"
  done
  unset _f
fi

# Migrate renamed config keys (old_name → new_name)
for _pair in rom_fingerprint_hexpatch:toggle_rom_fingerprint_names \
             spoof_build_props:toggle_rom_fingerprint_build_type \
             action_gms_force_stop:toggle_action_gms_force_stop \
             action_gms_clear_data:toggle_action_gms_clear_data \
             toggle_crom_props:toggle_custom_rom_props \
             kb_custom_type:keybox_custom_type \
             kb_custom_value:keybox_custom_value \
             kb_provider:keybox_provider \
             kb_private:keybox_private; do
  _old="${_pair%%:*}"
  _new="${_pair#*:}"
  if [ -f "$CONFIG_DIR/val/$_old.val" ] && [ ! -f "$CONFIG_DIR/val/$_new.val" ]; then
    mv "$CONFIG_DIR/val/$_old.val" "$CONFIG_DIR/val/$_new.val"
    log_i "SERVICE" "Migrated $_old → $_new"
  fi
done
unset _pair _old _new

_apply_toggle_defaults

for _bf in adb_disabler rom_fingerprint pif_props crom_props; do
  case "$_bf" in *[!a-zA-Z0-9_-]*) log_w "SERVICE" "Skipping invalid feature: $_bf"; continue ;; esac
  _bf_default=1
  case "$_bf" in adb_disabler|rom_fingerprint) _bf_default=0 ;; esac
  _feature_should_run "$_bf" $_bf_default || { log_d "SERVICE" "Skipping $_bf (disabled by config)"; continue; }
  sh "$MODDIR/features/$_bf.sh" >"$SPECTER_DIR/log/boot_${_bf}.log" 2>&1 || log_e "SERVICE" "$_bf failed (exit $?)"
done
unset _bf _bf_default

[ "$(cfg_get toggle_prop_handler 1)" != "0" ] && sh "$MODDIR/features/boot_state_props.sh" >"$SPECTER_DIR/log/boot_state_props.log" 2>&1 || true

# Before keystore_info / first_boot (refresh_module_description enforces again later).
ksm_enforce_singleton >/dev/null || true

sh "$MODDIR/features/keystore_info.sh" >"$SPECTER_DIR/log/keystore_info.log" 2>&1 || true
sh "$MODDIR/features/modules_state.sh" >/dev/null 2>&1 || true
write_webui_state
# Keep the setup page's cache warm; the page renders it before refreshing.
if command -v setsid >/dev/null 2>&1; then
  setsid sh "$MODDIR/features/setup_info.sh" >/dev/null 2>&1 &
else
  sh "$MODDIR/features/setup_info.sh" >/dev/null 2>&1 &
fi

log_i "SERVICE" "Boot-time features done"

ensure_dir "$SPECTER_DIR/backup" 2>/dev/null || true
if [ "$_specter_first_boot" = "1" ]; then
  log_i "SERVICE" "First-boot setup pending, running..."
  SPECTER_FIRST_BOOT=1 sh "$MODDIR/features/first_boot_setup.sh" >"$SPECTER_DIR/log/first_boot_setup.log" 2>&1 || log_e "SERVICE" "First-boot setup failed"
  log_i "SERVICE" "First-boot setup complete"
fi

. "$MODDIR/lib/desc.sh"
refresh_module_description

[ "$(cfg_get toggle_scheduler 1)" != "0" ] && {
  sh "$MODDIR/lib/scheduler.sh" >"$SPECTER_DIR/log/scheduler.log" 2>&1 &
  log_i "SERVICE" "Scheduler launched (PID $!)"
}

log_i "SERVICE" "Specter boot tasks complete"
