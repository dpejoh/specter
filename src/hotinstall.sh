#!/system/bin/sh
set -e
MODDIR=${0%/*}

. "$MODDIR/lib/common.sh"
export ROOT_SOL

# Skip tee.sh's boot-time sleep — the system is already running.
SPECTER_HOT_INSTALL=1
export SPECTER_HOT_INSTALL

HOT_LOG="$SPECTER_DIR/log/hotinstall.log"
ensure_dir "$SPECTER_DIR/log" 2>/dev/null || true
log_rotate "$HOT_LOG" 2>/dev/null || true

# Parent reads this back; exit status across the streaming pipe isn't reliable.
rm -f "$SPECTER_DIR/.hotinstall_failed"

{
  log_i "HOT" "Hot-install live-apply starting"

  # service.sh is skipped, so refresh TEE status here for the WebUI info.json.
  log_i "HOT" "Refreshing TEE status"
  sh "$MODDIR/features/tee.sh" || log_w "HOT" "tee.sh failed (TEE indicator may be stale until reboot)"

  # Kill the boot-time scheduler + its inotifyd children (pre-update code).
  if [ -f "$SPECTER_DIR/scheduler.pid" ]; then
    _old_pid="$(cat "$SPECTER_DIR/scheduler.pid" 2>/dev/null || true)"
    if [ -n "$_old_pid" ]; then
      for _child in $(pgrep -P "$_old_pid" 2>/dev/null || true); do
        kill "$_child" 2>/dev/null || true
      done
      unset _child
      kill "$_old_pid" 2>/dev/null || true
    fi
    rm -f "$SPECTER_DIR/scheduler.pid" 2>/dev/null || true
    unset _old_pid
  fi

  if [ "$(cfg_get toggle_scheduler 1)" != "0" ]; then
    sh "$MODDIR/lib/scheduler.sh" >"$SPECTER_DIR/log/scheduler.log" 2>&1 &
    log_i "HOT" "Scheduler relaunched (PID $!)"
  fi

  log_i "HOT" "Running action.sh"
  if sh "$MODDIR/action.sh"; then
    log_i "HOT" "action.sh completed"
  else
    _rc=$?
    log_e "HOT" "action.sh failed (exit $_rc)"
    : > "$SPECTER_DIR/.hotinstall_failed"
  fi

  log_i "HOT" "Hot-install live-apply done"
} 2>&1 | tee -a "$HOT_LOG"
