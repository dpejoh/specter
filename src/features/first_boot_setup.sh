#!/system/bin/sh
set -e
MODDIR=${0%/*}
. "$MODDIR/../lib/common.sh"
. "$MODDIR/../lib/constants.sh"

log_i "FIRST_BOOT" "Starting first-boot setup"

ensure_dir "$BACKUP_DIR"

detect_keystore_manager

log_i "FIRST_BOOT" "Backing up existing $KSM_NAME files"

if [ -f "$KSM_KEYBOX" ]; then
  cp "$KSM_KEYBOX" "$BACKUP_DIR/keybox.xml.bak"
  log_d "FIRST_BOOT" "Backed up $KSM_KEYBOX"
fi

case "$KSM_FORMAT" in
  toml|json)
    ksm_read_targets > "$BACKUP_DIR/targets.list.bak" 2>/dev/null
    _fbs_patch=$(sh "$MODDIR/security_patch.sh" --get 2>/dev/null) || _fbs_patch=""
    [ -n "$_fbs_patch" ] && printf '%s\n' "$_fbs_patch" > "$BACKUP_DIR/security_patch.value.bak"
    unset _fbs_patch
    if [ "$KSM_FORMAT" = "json" ] && [ -f "$KSM_TARGETS" ]; then
      cp "$KSM_TARGETS" "$BACKUP_DIR/teesim_config.json.bak"
      log_d "FIRST_BOOT" "Backed up $KSM_TARGETS"
    fi
    ;;
  *)
    if [ -f "$KSM_TARGETS" ]; then
      cp "$KSM_TARGETS" "$BACKUP_DIR/target.txt.bak"
      log_d "FIRST_BOOT" "Backed up $KSM_TARGETS"
    fi
    if [ -f "$KSM_LOCKED" ]; then
      cp "$KSM_LOCKED" "$BACKUP_DIR/locked.xml.bak"
      log_d "FIRST_BOOT" "Backed up $KSM_LOCKED"
    fi
    if [ -f "$KSM_SECURITY" ]; then
      cp "$KSM_SECURITY" "$BACKUP_DIR/security_patch.txt.bak"
      log_d "FIRST_BOOT" "Backed up $KSM_SECURITY"
    fi
    ;;
esac

log_i "FIRST_BOOT" "Waiting for network..."
for _sec in 1 2 3 4 5 6 7 8 9 10; do check_network 2>/dev/null && break; sleep 1; done
unset _sec

log_i "FIRST_BOOT" "Running full integrity pipeline"
SPECTER_FIRST_BOOT=1 sh "$MODDIR/../action.sh" || log_e "FIRST_BOOT" "action.sh failed (exit $?)"

log_i "FIRST_BOOT" "First-boot setup complete"
exit 0
