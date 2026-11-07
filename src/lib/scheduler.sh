# shellcheck shell=ksh

MODDIR="${0%/*}"
case "$MODDIR" in */lib) MODDIR="${MODDIR%/lib}" ;; */features) MODDIR="${MODDIR%/features}" ;; esac
[ -n "$MODDIR" ] || { echo "[SCHED] MODDIR not set" >&2; exit 1; }

. "$MODDIR/lib/common.sh"
. "$MODDIR/lib/constants.sh"
. "$MODDIR/lib/desc.sh"

PID_FILE="$SPECTER_DIR/scheduler.pid"
TASKS_DIR="$SPECTER_DIR/scheduler_tasks"
INOTIFY_HANDLER="$SPECTER_DIR/.inotify_handler.sh"

ensure_dir "$TASKS_DIR" 2>/dev/null
ensure_dir "$SPECTER_DIR/log" 2>/dev/null

if [ -f "$PID_FILE" ]; then
  _old_pid=$(cat "$PID_FILE" 2>/dev/null || echo "")
  if [ -n "$_old_pid" ] && [ -f "/proc/$_old_pid/cmdline" ]; then
    # shellcheck disable=SC2002
    _cmdline=$(cat "/proc/$_old_pid/cmdline" 2>/dev/null | tr '\0' ' ' || echo "")
    case "$_cmdline" in
      *scheduler*) log_w "SCHED" "Already running (PID $_old_pid), exiting"; exit 0 ;;
    esac
  fi
  rm -f "$PID_FILE"
fi
echo "$$" > "$PID_FILE"
trap 'rm -f "$PID_FILE" "$INOTIFY_HANDLER" 2>/dev/null; exit' EXIT TERM INT HUP

log_i "SCHED" "Started (PID $$)"
# KernelSU can leave the installer cwd deleted; app_process helpers need a
# valid working directory.
cd / 2>/dev/null || true

# One-time migration to the merged keybox-refresh model. Auto Keybox no longer
# rotates a healthy keybox; the refresh watch replaces only revoked/expired ones.
if [ ! -f "$SPECTER_DIR/.keybox_refresh_migrated" ]; then
  cfg_set toggle_keybox_auto_replace 1
  _kw_old=$(cfg_get keybox_watch_interval 300)
  [ "$_kw_old" = "300" ] && cfg_set keybox_watch_interval 3600
  rm -f "$CONFIG_DIR/val/toggle_autokeybox.val" "$CONFIG_DIR/val/autokeybox_interval.val" 2>/dev/null || true
  touch "$SPECTER_DIR/.keybox_refresh_migrated" 2>/dev/null || true
  unset _kw_old
fi

# Launch inotifyd for app install detection if available. The same watcher
# serves instant auto-target and auto-HMA; polling auto-target disables only
# its own handler path.
if { [ "$(cfg_get toggle_auto_target 1)" = "1" ] && [ "$(cfg_get auto_target_method instant)" != "polling" ]; } || [ "$(cfg_get toggle_auto_hma 1)" = "1" ]; then
  _inotify_bin="$MODDIR/deps/inotifyd"

  if [ -x "$_inotify_bin" ]; then
    cat > "$INOTIFY_HANDLER" <<EOF
#!/system/bin/sh
MODDIR='${MODDIR}'
SPECTER_DIR='${SPECTER_DIR}'
_at_val="\$(su -c "cat \${SPECTER_DIR}/config/val/toggle_auto_target.val" 2>/dev/null)"
_at_method="\$(su -c "cat \${SPECTER_DIR}/config/val/auto_target_method.val" 2>/dev/null)"
if [ "\${_at_val:-1}" = "1" ] && [ "\${_at_method:-instant}" != "polling" ]; then
  su -c "sh \${MODDIR}/features/auto_target.sh" 2>/dev/null || true
fi
_hma_val="\$(su -c "cat \${SPECTER_DIR}/config/val/toggle_auto_hma.val" 2>/dev/null)"
if [ "\${_hma_val:-1}" = "1" ]; then
  su -c "sh \${MODDIR}/features/hma.sh --watch >> '\${SPECTER_DIR}/log/sched_hma.log' 2>&1" 2>/dev/null || true
fi
. "\${MODDIR}/lib/common.sh" 2>/dev/null
. "\${MODDIR}/lib/desc.sh" 2>/dev/null
refresh_module_description 2>/dev/null || true
EOF
    chmod 755 "$INOTIFY_HANDLER"
    "$_inotify_bin" /data/app "$INOTIFY_HANDLER" >/dev/null 2>&1 &
    log_i "SCHED" "inotifyd launched for /data/app"
  fi
  unset _inotify_bin
fi

# Launch inotifyd for wallpaper changes — calls monet.sh (writes monet.json for WebUI).
# Watch the user directory, not /data/system/users/0/wallpaper: Android 17 no longer
# keeps that file, and wallpaper_info.xml is written via JournaledFile (rename).
# Mask 136 = IN_CLOSE_WRITE (8) | IN_MOVED_TO (128).
if [ -x "$MODDIR/deps/inotifyd" ] && [ -f "$MODDIR/features/monet.sh" ]; then
  _wp_watch="/data/system/users/0"
  if [ -d "$_wp_watch" ]; then
    "$MODDIR/deps/inotifyd" -m 136 "$_wp_watch" "$MODDIR/features/monet.sh" >/dev/null 2>&1 &
    log_i "SCHED" "inotifyd launched for wallpaper → $_wp_watch/monet.sh"
  else
    log_w "SCHED" "wallpaper watch dir missing: $_wp_watch"
  fi
  unset _wp_watch
fi

# Refresh the monet record once per scheduler start. This populates the full
# system role palette after a hot update without waiting for a wallpaper event.
if [ -f "$MODDIR/features/monet.sh" ]; then
  sh "$MODDIR/features/monet.sh" >/dev/null 2>&1 &
  log_i "SCHED" "monet refresh launched"
fi

_setup_info_stale() {
  _sis_stamp="$SPECTER_DIR/cache/setup_info.stamp"
  [ -f "$_sis_stamp" ] || return 0
  [ -d /data/adb/modules ] && [ /data/adb/modules -nt "$_sis_stamp" ] && return 0
  [ -d "${MODULES_BASE}_update" ] && [ "${MODULES_BASE}_update" -nt "$_sis_stamp" ] && return 0

  for _sis_f in \
    "$MODDIR/module.prop" \
    "$CONFIG_DIR"/val/*.val \
    /data/adb/modules/*/module.prop \
    "${MODULES_BASE}_update"/*/module.prop \
    /data/adb/tricky_store/target.txt \
    /data/adb/tricky_store/config.ini \
    /data/adb/tricky_store/security_patch.txt \
    /data/adb/teesim/config.json \
    /data/misc/keystore/omk/config.toml \
    /data/misc/keystore/omk/injector.toml \
    /data/adb/pif.prop \
    "$PIF_DIR"/custom.pif.prop \
    "$PIF_DIR"/pif.json \
    "$PIF_DIR"/autopif.json \
    "$PIF_DIR"/custom.pif.json \
    /data/misc/hide_my_applist*/config.json; do
    [ -e "$_sis_f" ] || continue
    [ "$_sis_f" -nt "$_sis_stamp" ] && return 0
  done
  unset _sis_stamp _sis_f
  return 1
}

while true; do
  [ -d "$MODDIR" ] || exit 0
  _now=$(date +%s 2>/dev/null || echo "0")

  for _task_line in keybox_watch:keybox_watch.sh:3600:toggle_keybox_info \
                    auto_target:auto_target.sh:300:toggle_auto_target \
                    hma:hma.sh:21600:toggle_auto_hma \
                    autopif:pif.sh:86400:toggle_autopif; do
    _name="${_task_line%%:*}"
    _rest="${_task_line#*:}"
    _script="${_rest%%:*}"
    _rest="${_rest#*:}"
    _default_interval="${_rest%%:*}"
    _toggle="${_rest#*:}"

    _toggle_default=1
    case "$_toggle" in
      toggle_autopif) _toggle_default=0 ;;
    esac
    [ "$(cfg_get "$_toggle" "$_toggle_default")" = "0" ] && continue

    _last_run=$(cat "$TASKS_DIR/${_name}_last" 2>/dev/null || echo "0")
    if [ "$_name" = "hma" ]; then
      _hma_cfg_ok=0
      for _hma_cfg in "$HMAOSS_BASE"/hide_my_applist*/config.json; do
        [ -s "$_hma_cfg" ] && { _hma_cfg_ok=1; break; }
      done
      [ "$_hma_cfg_ok" = "1" ] || _last_run=0
      unset _hma_cfg _hma_cfg_ok
    fi
    _cfg_interval=$(cfg_get "${_name}_interval" "$_default_interval")

    # Instant auto-target is event-driven via inotifyd; the periodic run only
    # cleans stale targets, so a 6-hour pass is enough.
    if [ "$_name" = "auto_target" ] && [ "$(cfg_get auto_target_method instant)" != "polling" ]; then
      _cfg_interval=21600
    fi
    [ "$_cfg_interval" -lt 10 ] && _cfg_interval=10
    [ "$_name" = "keybox_watch" ] && [ "$_cfg_interval" -lt 60 ] && _cfg_interval=60

    if [ "$_now" -ge "$((_last_run + _cfg_interval))" ]; then
      log_rotate "$SPECTER_DIR/log/sched_${_name}.log"
      log_i "SCHED" "Running $_name"
      _task_rc=0
      if [ "$_name" = "hma" ]; then
        sh "$MODDIR/features/$_script" >"$SPECTER_DIR/log/sched_${_name}.log" 2>&1 || _task_rc=$?
      else
        sh "$MODDIR/features/$_script" >"$SPECTER_DIR/log/sched_${_name}.log" 2>&1 || _task_rc=$?
      fi
      if [ "$_name" = "hma" ] && [ "$_task_rc" -ne 0 ]; then
        log_e "SCHED" "$_name failed (rc $_task_rc), retrying in 5m"
        printf '%s' "$((_now - _cfg_interval + 300))" > "$TASKS_DIR/${_name}_last"
      else
        printf '%s' "$_now" > "$TASKS_DIR/${_name}_last"
      fi
      unset _task_rc

      case "$_name" in
        keybox_watch|auto_target|autopif)
          refresh_module_description
          ;;
      esac
    fi
  done

  if _setup_info_stale; then
    log_rotate "$SPECTER_DIR/log/sched_setup_info.log"
    log_i "SCHED" "Inputs changed, rebuilding setup snapshot"
    sh "$MODDIR/features/setup_info.sh" >"$SPECTER_DIR/log/sched_setup_info.log" 2>&1 || log_e "SCHED" "setup_info failed"
    sh "$MODDIR/features/modules_state.sh" >/dev/null 2>&1 || log_e "SCHED" "modules_state failed"
    write_webui_state
  fi

  sleep 57
done
