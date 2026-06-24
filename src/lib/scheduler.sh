# shellcheck shell=sh

MODDIR="${0%/*}"
case "$MODDIR" in */lib) MODDIR="${MODDIR%/lib}" ;; */features) MODDIR="${MODDIR%/features}" ;; esac
[ -n "$MODDIR" ] || { echo "[SCHED] MODDIR not set" >&2; exit 1; }

. "$MODDIR/lib/common.sh"
. "$MODDIR/lib/config_env.sh"
. "$MODDIR/lib/desc.sh"

PID_FILE="$SPECTER_DIR/scheduler.pid"
TASKS_DIR="$SPECTER_DIR/scheduler_tasks"
INOTIFY_HANDLER="$SPECTER_DIR/.inotify_handler.sh"

ensure_dir "$TASKS_DIR" 2>/dev/null
ensure_dir "$SPECTER_DIR/log" 2>/dev/null

if [ -f "$PID_FILE" ]; then
  _old_pid=$(cat "$PID_FILE" 2>/dev/null || echo "")
  if [ -n "$_old_pid" ] && [ -f "/proc/$_old_pid/cmdline" ]; then
    _cmdline=$(tr '\0' ' ' < "/proc/$_old_pid/cmdline" 2>/dev/null || echo "")
    case "$_cmdline" in
      *scheduler*) log "SCHED" "Already running (PID $_old_pid), exiting"; exit 0 ;;
    esac
  fi
  rm -f "$PID_FILE"
fi
echo "$$" > "$PID_FILE"
trap 'rm -f "$PID_FILE" "$INOTIFY_HANDLER" 2>/dev/null; exit' EXIT TERM INT HUP

log "SCHED" "Started (PID $$)"

# Launch inotifyd for app install detection if available (skip if method=polling)
if command -v inotifyd >/dev/null 2>&1 && [ "$(cfg_get toggle_auto_target 1)" = "1" ] && [ "$(cfg_get auto_target_method instant)" != "polling" ]; then
  cat > "$INOTIFY_HANDLER" <<EOF
#!/system/bin/sh
MODDIR='${MODDIR}'
SPECTER_DIR='${SPECTER_DIR}'
_cg_val="\$(su -c "cat \${SPECTER_DIR}/config/toggle_auto_target.val" 2>/dev/null)"
[ "\${_cg_val:-1}" = "1" ] || exit 0
su -c "sh \${MODDIR}/features/auto_target.sh" 2>/dev/null || true
. "\${MODDIR}/lib/paths.sh" 2>/dev/null
. "\${MODDIR}/lib/desc.sh" 2>/dev/null
refresh_module_description 2>/dev/null || true
EOF
  chmod 755 "$INOTIFY_HANDLER"

  inotifyd "$INOTIFY_HANDLER" /data/app:n >/dev/null 2>&1 &
  log "SCHED" "inotifyd launched for /data/app"
fi

while true; do
  [ -d "$MODDIR" ] || exit 0
  _now=$(date +%s 2>/dev/null || echo "0")

  for _task_line in keybox_info:keybox_info.sh:21600:toggle_keybox_info \
                    auto_target:auto_target.sh:300:toggle_auto_target \
                    autopif:pif.sh:86400:toggle_autopif \
                    autokeybox:keybox.sh:86400:toggle_autokeybox; do
    _name="${_task_line%%:*}"
    _rest="${_task_line#*:}"
    _script="${_rest%%:*}"
    _rest="${_rest#*:}"
    _default_interval="${_rest%%:*}"
    _toggle="${_rest#*:}"

    [ "$(cfg_get "$_toggle" 1)" = "0" ] && continue

    _last_run=$(cat "$TASKS_DIR/${_name}_last" 2>/dev/null || echo "0")
    _cfg_interval=$(cfg_get "${_name}_interval" "$_default_interval")
    [ "$_cfg_interval" -lt 10 ] && _cfg_interval=10

    if [ "$_now" -ge "$((_last_run + _cfg_interval))" ]; then
      log_rotate "$SPECTER_DIR/log/sched_${_name}.log"
      log "SCHED" "Running $_name"
      sh "$MODDIR/features/$_script" >"$SPECTER_DIR/log/sched_${_name}.log" 2>&1 || log "SCHED" "$_name failed"
      printf '%s' "$_now" > "$TASKS_DIR/${_name}_last"

      case "$_name" in
        keybox_info|auto_target|autopif|autokeybox)
          refresh_module_description
          ;;
      esac
    fi
  done

  sleep 57
done
