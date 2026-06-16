#!/system/bin/sh
set -e
MODDIR=${0%/*}
. "$MODDIR/../lib/common.sh"
. "$MODDIR/../lib/urls.sh"
. "$MODDIR/../lib/config_env.sh"

log "FIRST_BOOT" "Start"

ensure_dir "$BACKUP_DIR"

log "FIRST_BOOT" "Backing up existing Tricky Store files"

if [ -f "$TARGET_FILE" ]; then
  cp "$TARGET_FILE" "$BACKUP_DIR/keybox.xml.bak"
  log "FIRST_BOOT" "Backed up $TARGET_FILE"
fi

if [ -f "$TARGET_TXT" ]; then
  cp "$TARGET_TXT" "$BACKUP_DIR/target.txt.bak"
  log "FIRST_BOOT" "Backed up $TARGET_TXT"
fi

if [ -f "$LOCKED_FILE" ]; then
  cp "$LOCKED_FILE" "$BACKUP_DIR/locked.xml.bak"
  log "FIRST_BOOT" "Backed up $LOCKED_FILE"
fi

if [ -f "$SECURITY_PATCH_FILE" ]; then
  cp "$SECURITY_PATCH_FILE" "$BACKUP_DIR/security_patch.txt.bak"
  log "FIRST_BOOT" "Backed up $SECURITY_PATCH_FILE"
fi

log "FIRST_BOOT" "Installing keybox"
sh "$MODDIR/../features/keybox.sh" || log "FIRST_BOOT" "Keybox installation failed (exit $?)"


log "FIRST_BOOT" "Refreshing keybox info cache"
sh "$MODDIR/../features/keybox_info.sh" || log "FIRST_BOOT" "keybox_info.sh failed (exit $?)"

log "FIRST_BOOT" "Finish"
exit 0
