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

_restored=0

if [ -f "$BACKUP_DIR/keybox.xml.bak" ]; then
  cp "$BACKUP_DIR/keybox.xml.bak" "$TARGET_FILE"
  log_i "RESTORE" "Restored keybox.xml"
  _restored=$((_restored + 1))
fi

if [ -f "$BACKUP_DIR/target.txt.bak" ]; then
  cp "$BACKUP_DIR/target.txt.bak" "$TARGET_TXT"
  log_i "RESTORE" "Restored target.txt"
  _restored=$((_restored + 1))
fi

if [ -f "$BACKUP_DIR/locked.xml.bak" ]; then
  cp "$BACKUP_DIR/locked.xml.bak" "$LOCKED_FILE"
  log_i "RESTORE" "Restored locked.xml"
  _restored=$((_restored + 1))
fi

if [ -f "$BACKUP_DIR/security_patch.txt.bak" ]; then
  cp "$BACKUP_DIR/security_patch.txt.bak" "$SECURITY_PATCH_FILE"
  log_i "RESTORE" "Restored security_patch.txt"
  _restored=$((_restored + 1))
fi

if [ "$_restored" -eq 0 ]; then
  log_w "RESTORE" "No backup files found"
  echo "No backup files found in $BACKUP_DIR"
  exit 1
fi

log_i "RESTORE" "Restored $_restored files"
echo "Restored $_restored files from backup."

log_i "RESTORE" "Backup restoration complete"
exit 0
