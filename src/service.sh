#!/system/bin/sh
set -e
MODDIR=${0%/*}
. "$MODDIR/lib/common.sh"
export ROOT_SOL

BOOT_LOG="$SPECTER_DIR/log/boot.log"
mkdir -p "$SPECTER_DIR/log" 2>/dev/null || true
log_rotate "$BOOT_LOG"
exec >>"$BOOT_LOG" 2>&1

log_i "SERVICE" "Running Specter boot tasks"

# Seed default configs before running any features
for _tk_pair in toggle_boot_hardening:1 toggle_prop_handler:1 toggle_adb_disabler:0 \
                toggle_rom_fingerprint:0 toggle_action_gms:1 toggle_action_target:1 \
                toggle_action_security_patch:1 toggle_action_pif:1 toggle_action_keybox:1 \
                toggle_auto_target:1 toggle_keybox_info:1 toggle_autopif:0 toggle_autokeybox:0; do
  _key="${_tk_pair%%:*}"
  _def="${_tk_pair#*:}"
  [ -f "$CONFIG_DIR/$_key.val" ] || cfg_set "$_key" "$_def"
done

for _bf in adb_disabler rom_fingerprint tee boot_hardening; do
  case "$_bf" in *[!a-zA-Z0-9_-]*) log_w "SERVICE" "Skipping invalid feature: $_bf"; continue ;; esac
  _bf_default=1
  case "$_bf" in adb_disabler|rom_fingerprint) _bf_default=0 ;; esac
  _feature_should_run "$_bf" $_bf_default || { log_d "SERVICE" "Skipping $_bf (disabled by config)"; continue; }
  sh "$MODDIR/features/$_bf.sh" >"$SPECTER_DIR/log/boot_${_bf}.log" 2>&1 || log_e "SERVICE" "$_bf failed (exit $?)"
done
unset _bf _bf_default

[ "$(cfg_get toggle_boot_hash 1)" != "0" ] && sh "$MODDIR/features/boot_hash.sh" >"$SPECTER_DIR/log/boot_hash.log" 2>&1 || true

log_i "SERVICE" "Boot-time features done"

[ -f "$SPECTER_DIR/rom_spoof_reported" ] && {
  sh "$MODDIR/features/rom_spoof_cleanup.sh" >/dev/null 2>&1 || true
  rm -f "$SPECTER_DIR/rom_spoof_reported"
}

ensure_dir "$SPECTER_DIR/backup" 2>/dev/null || true
if [ -f "$MODDIR/.first_boot_pending" ]; then
  log_i "SERVICE" "First-boot setup pending, running..."
  sh "$MODDIR/features/first_boot_setup.sh" >"$SPECTER_DIR/log/first_boot_setup.log" 2>&1 || log_e "SERVICE" "First-boot setup failed"
  rm -f "$MODDIR/.first_boot_pending"
  log_i "SERVICE" "First-boot setup complete"
fi

. "$MODDIR/lib/desc.sh"
refresh_module_description

[ "$(cfg_get toggle_scheduler 1)" != "0" ] && {
  sh "$MODDIR/lib/scheduler.sh" >"$SPECTER_DIR/log/scheduler.log" 2>&1 &
  log_i "SERVICE" "Scheduler launched (PID $!)"
}

log_i "SERVICE" "Specter boot tasks complete"
