#!/system/bin/sh
set -e
MODDIR=${0%/*}
. "$MODDIR/../lib/common.sh"
. "$MODDIR/../lib/constants.sh"

log_i "RESTORE" "Starting backup restoration"

if [ ! -d "$BACKUP_DIR" ]; then
  log_w "RESTORE" "No backup directory found"
  echo "No backups found to restore."
  exit 1
fi

detect_keystore_manager

_restored=0

if [ -f "$BACKUP_DIR/keybox.xml.bak" ] && [ -n "$KSM_KEYBOX" ]; then
  cp "$BACKUP_DIR/keybox.xml.bak" "$KSM_KEYBOX"
  log_i "RESTORE" "Restored keybox.xml"
  _restored=$((_restored + 1))
fi

case "$KSM_FORMAT" in
  toml)
    if [ -f "$BACKUP_DIR/targets.list.bak" ]; then
      _rb_tmp="$SPECTER_DIR/.restore_targets.$$"
      cp "$BACKUP_DIR/targets.list.bak" "$_rb_tmp"
      ksm_commit_targets "$_rb_tmp"
      log_i "RESTORE" "Restored app target list"
      _restored=$((_restored + 1))
    fi
    if [ -f "$BACKUP_DIR/security_patch.value.bak" ]; then
      ksm_set_security_patch "$(cat "$BACKUP_DIR/security_patch.value.bak")"
      log_i "RESTORE" "Restored security patch"
      _restored=$((_restored + 1))
    fi
    ;;
  *)
    if [ -f "$BACKUP_DIR/target.txt.bak" ] && [ -n "$KSM_TARGETS" ]; then
      cp "$BACKUP_DIR/target.txt.bak" "$KSM_TARGETS"
      log_i "RESTORE" "Restored target.txt"
      _restored=$((_restored + 1))
    fi
    if [ -f "$BACKUP_DIR/locked.xml.bak" ] && [ -n "$KSM_LOCKED" ]; then
      cp "$BACKUP_DIR/locked.xml.bak" "$KSM_LOCKED"
      log_i "RESTORE" "Restored locked.xml"
      _restored=$((_restored + 1))
    fi
    if [ -f "$BACKUP_DIR/security_patch.txt.bak" ] && [ -n "$KSM_SECURITY" ]; then
      cp "$BACKUP_DIR/security_patch.txt.bak" "$KSM_SECURITY"
      log_i "RESTORE" "Restored security_patch.txt"
      _restored=$((_restored + 1))
    fi
    ;;
esac

if [ "$_restored" -eq 0 ]; then
  log_w "RESTORE" "No backup files found"
  echo "No backup files found in $BACKUP_DIR"
  exit 1
fi

log_i "RESTORE" "Restored $_restored files"
echo "Restored $_restored files from backup."

log_i "RESTORE" "Backup restoration complete"
exit 0
