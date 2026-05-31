#!/system/bin/sh
set -e
MODDIR=${0%/*}
. "$MODDIR/lib/common.sh"
. "$MODDIR/lib/paths.sh"

if [ -f "$BACKUP_FILE" ]; then
    rm -f "$TARGET_FILE"
    mv "$BACKUP_FILE" "$TARGET_FILE"
    log "UNINSTALL" "Restored original keybox from backup"
fi

if [ -d "$BBIN" ]; then
    rm -rf "$BBIN" 2>/dev/null
    log "UNINSTALL" "Removed $BBIN"
fi

if [ -d "$CONFIG_DIR" ]; then
    rm -rf "$CONFIG_DIR" 2>/dev/null
    log "UNINSTALL" "Removed $CONFIG_DIR"
fi

if [ -f "$MIGRATION_MARKER" ]; then
    rm -f "$MIGRATION_MARKER" 2>/dev/null
    log "UNINSTALL" "Removed migration marker"
fi

# Restore persisted props, format: restore|prop_name|prop_value
if [ -f "$SPECTER_DIR/persist_backup.txt" ]; then
  while IFS='|' read -r _pr_cmd _pr_name _pr_val; do
    [ "$_pr_cmd" = "restore" ] || continue
    [ -n "$_pr_name" ] || continue
    resetprop -n -p "$_pr_name" "$_pr_val" 2>/dev/null || true
    log "UNINSTALL" "Restored prop: $_pr_name"
  done < "$SPECTER_DIR/persist_backup.txt"
  rm -f "$SPECTER_DIR/persist_backup.txt" 2>/dev/null
  log "UNINSTALL" "All persistent props restored"
fi

# Clean up any persist props the module may have set or deleted
for _pr in \
  persist.sys.entryhooks_enabled \
  persist.sys.pixelprops.gms \
  persist.sys.pixelprops.gapps \
  persist.sys.pixelprops.google \
  persist.sys.pixelprops.pi \
  persist.sys.spoof.gms; do
  resetprop -p --delete "$_pr" 2>/dev/null || true
done
while IFS= read -r _pr; do
  [ -z "$_pr" ] && continue
  resetprop -p --delete "$_pr" 2>/dev/null || true
done << PROPS
$(getprop 2>/dev/null | grep -E "pixelprops" | sed "s/^\[\(.*\)\]:.*/\1/" || true)
PROPS

# Restore conflict backups, return renamed scripts to their modules
if [ -f "$SPECTER_DIR/conflict_backups.txt" ]; then
  while IFS= read -r _bak_path; do
    [ -z "$_bak_path" ] && continue
    if [ -f "${_bak_path}.bak" ]; then
      mv "${_bak_path}.bak" "$_bak_path" 2>/dev/null || true
      log "UNINSTALL" "Restored conflict backup: $_bak_path"
    fi
  done < "$SPECTER_DIR/conflict_backups.txt"
  rm -f "$SPECTER_DIR/conflict_backups.txt" 2>/dev/null
  log "UNINSTALL" "All conflict backups restored"
fi

return 0
