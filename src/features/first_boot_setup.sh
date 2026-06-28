#!/system/bin/sh
set -e
MODDIR=${0%/*}
. "$MODDIR/../lib/common.sh"
. "$MODDIR/../lib/constants.sh"

log_i "FIRST_BOOT" "Starting first-boot setup"

ensure_dir "$BACKUP_DIR"

log_i "FIRST_BOOT" "Backing up existing Tricky Store files"

if [ -f "$TARGET_FILE" ]; then
  cp "$TARGET_FILE" "$BACKUP_DIR/keybox.xml.bak"
  log_d "FIRST_BOOT" "Backed up $TARGET_FILE"
fi

if [ -f "$TARGET_TXT" ]; then
  cp "$TARGET_TXT" "$BACKUP_DIR/target.txt.bak"
  log_d "FIRST_BOOT" "Backed up $TARGET_TXT"
fi

if [ -f "$LOCKED_FILE" ]; then
  cp "$LOCKED_FILE" "$BACKUP_DIR/locked.xml.bak"
  log_d "FIRST_BOOT" "Backed up $LOCKED_FILE"
fi

if [ -f "$SECURITY_PATCH_FILE" ]; then
  cp "$SECURITY_PATCH_FILE" "$BACKUP_DIR/security_patch.txt.bak"
  log_d "FIRST_BOOT" "Backed up $SECURITY_PATCH_FILE"
fi

log_i "FIRST_BOOT" "Waiting for network..."
for _sec in 1 2 3 4 5 6 7 8 9 10; do check_network 2>/dev/null && break; sleep 1; done
unset _sec

log_i "FIRST_BOOT" "Running full integrity pipeline"
sh "$MODDIR/../action.sh" || log_e "FIRST_BOOT" "action.sh failed (exit $?)"

log_i "FIRST_BOOT" "First-boot setup complete"
exit 0
