#!/system/bin/sh
set -e
MODDIR=${0%/*}
. "$MODDIR/lib/common.sh"

detect_keystore_manager
if [ -f "$BACKUP_FILE" ] && [ -n "$KSM_KEYBOX" ]; then
    if ksm_install_keybox "$BACKUP_FILE" move; then
      log_i "UNINSTALL" "Restored original keybox from backup"
    else
      log_w "UNINSTALL" "Could not restore keybox (dest missing or write failed)"
    fi
fi

if [ -d "$CONFIG_DIR" ]; then
    rm -rf "$CONFIG_DIR" 2>/dev/null
    log_i "UNINSTALL" "Removed $CONFIG_DIR"
fi

# Restore persisted props, format: restore|prop_name|prop_value
if [ -f "$SPECTER_DIR/persist_backup.txt" ]; then
  while IFS='|' read -r _pr_cmd _pr_name _pr_val; do
    [ "$_pr_cmd" = "restore" ] || continue
    [ -n "$_pr_name" ] || continue
    resetprop -n -p "$_pr_name" "$_pr_val" 2>/dev/null || true
    log_d "UNINSTALL" "Restored prop: $_pr_name"
  done < "$SPECTER_DIR/persist_backup.txt"
  rm -f "$SPECTER_DIR/persist_backup.txt" 2>/dev/null
  log_i "UNINSTALL" "All persistent props restored"
fi

# Clean up any persist props the module may have set or deleted
for _pr in \
  persist.sys.entryhooks_enabled \
  persist.sys.pixelprops.gms \
  persist.sys.pixelprops.gapps \
  persist.sys.pixelprops.google \
  persist.sys.pixelprops.pi \
  persist.sys.spoof.gms \
  persist.sys.pihooks.disable.gms; do
  resetprop -p --delete "$_pr" 2>/dev/null || true
done
while IFS= read -r _pr; do
  [ -z "$_pr" ] && continue
  resetprop -p --delete "$_pr" 2>/dev/null || true
done << PROPS
$(getprop 2>/dev/null | grep -E "(pixelprops|pihooks)" | sed "s/^\[\(.*\)\]:.*/\1/" || true)
PROPS

# Restore conflict backups, return renamed scripts to their modules
if [ -f "$SPECTER_DIR/conflict_backups.txt" ]; then
  while IFS= read -r _bak_path; do
    [ -z "$_bak_path" ] && continue
    if [ -f "${_bak_path}.bak" ]; then
      mv "${_bak_path}.bak" "$_bak_path" 2>/dev/null || true
      log_i "UNINSTALL" "Restored conflict backup: $_bak_path"
    fi
  done < "$SPECTER_DIR/conflict_backups.txt"
  rm -f "$SPECTER_DIR/conflict_backups.txt" 2>/dev/null
  log_i "UNINSTALL" "All conflict backups restored"
fi

# Clean up all log files and data files
rm -rf "$SPECTER_DIR/log" 2>/dev/null || rm -f "$SPECTER_DIR/log"/*.log "$SPECTER_DIR/log"/*.gz 2>/dev/null || true
rm -f "$SPECTER_DIR/.first_boot_pending" 2>/dev/null || true
rm -f "$SPECTER_DIR/tee_status" "$SPECTER_DIR/tee_bhash" "$SPECTER_DIR/tee_tier" 2>/dev/null || true
rm -f "$SPECTER_DIR/tee_keymaster_version" "$SPECTER_DIR/tee_challenge" 2>/dev/null || true
rm -f "$SPECTER_DIR/vbmeta_digest" "$SPECTER_DIR/app_labels.json" 2>/dev/null || true

rm -rf "$SPECTER_DIR/backup" 2>/dev/null || true

# Clean up scheduler PID
if [ -f "$SPECTER_DIR/scheduler.pid" ]; then
  _sched_pid=$(cat "$SPECTER_DIR/scheduler.pid" 2>/dev/null || echo "")
  [ -n "$_sched_pid" ] && kill "$_sched_pid" 2>/dev/null || true
  rm -f "$SPECTER_DIR/scheduler.pid"
fi

# Clean up scheduler task data
rm -rf "$SPECTER_DIR/scheduler_tasks" 2>/dev/null
rm -f "$SPECTER_DIR/.inotify_handler.sh" 2>/dev/null
rm -f "$SPECTER_DIR/auto_known_packages.txt" 2>/dev/null

# Clean up legacy loop PID files
for _pid_key in loop_prop_handler.pid loop_keybox_info.pid auto_target.pid; do
  _pid_path="$SPECTER_DIR/$_pid_key"
  if [ -f "$_pid_path" ]; then
    _old_pid=$(cat "$_pid_path" 2>/dev/null || echo "")
    [ -n "$_old_pid" ] && kill "$_old_pid" 2>/dev/null || true
    rm -f "$_pid_path"
  fi
done
unset _pid_key _pid_path _old_pid

exit 0
