# shellcheck shell=sh

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

# Launch inotifyd for app install detection if available (skip if method=polling)
if [ "$(cfg_get toggle_auto_target 1)" = "1" ] && [ "$(cfg_get auto_target_method instant)" != "polling" ]; then
  _inotify_bin="$MODDIR/deps/inotifyd"

  if [ -x "$_inotify_bin" ]; then
    cat > "$INOTIFY_HANDLER" <<EOF
#!/system/bin/sh
MODDIR='${MODDIR}'
SPECTER_DIR='${SPECTER_DIR}'
_cg_val="\$(su -c "cat \${SPECTER_DIR}/config/val/toggle_auto_target.val" 2>/dev/null)"
[ "\${_cg_val:-1}" = "1" ] || exit 0
su -c "sh \${MODDIR}/features/auto_target.sh" 2>/dev/null || true
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

  for _task_line in keybox_watch:keybox_watch.sh:300:toggle_keybox_info \
                    auto_target:auto_target.sh:300:toggle_auto_target \
                    hma:hma.sh:21600:toggle_auto_hma \
                    autopif:pif.sh:86400:toggle_autopif \
                    autokeybox:keybox.sh:86400:toggle_autokeybox; do
    _name="${_task_line%%:*}"
    _rest="${_task_line#*:}"
    _script="${_rest%%:*}"
    _rest="${_rest#*:}"
    _default_interval="${_rest%%:*}"
    _toggle="${_rest#*:}"

    _toggle_default=1
    case "$_toggle" in
      toggle_autopif|toggle_autokeybox) _toggle_default=0 ;;
    esac
    [ "$(cfg_get "$_toggle" "$_toggle_default")" = "0" ] && continue

    _last_run=$(cat "$TASKS_DIR/${_name}_last" 2>/dev/null || echo "0")
    _cfg_interval=$(cfg_get "${_name}_interval" "$_default_interval")
    [ "$_cfg_interval" -lt 10 ] && _cfg_interval=10
    [ "$_name" = "keybox_watch" ] && [ "$_cfg_interval" -lt 60 ] && _cfg_interval=60

    if [ "$_now" -ge "$((_last_run + _cfg_interval))" ]; then
      log_rotate "$SPECTER_DIR/log/sched_${_name}.log"
      log_i "SCHED" "Running $_name"
      if [ "$_name" = "hma" ]; then
        SPECTER_HMA_NO_UI_RELOAD=1 sh "$MODDIR/features/$_script" >"$SPECTER_DIR/log/sched_${_name}.log" 2>&1 || log_e "SCHED" "$_name failed"
      else
        sh "$MODDIR/features/$_script" >"$SPECTER_DIR/log/sched_${_name}.log" 2>&1 || log_e "SCHED" "$_name failed"
      fi
      printf '%s' "$_now" > "$TASKS_DIR/${_name}_last"

      case "$_name" in
        keybox_watch|auto_target|autopif|autokeybox)
          refresh_module_description
          ;;
      esac
    fi
  done

  if _setup_info_stale; then
    log_rotate "$SPECTER_DIR/log/sched_setup_info.log"
    log_i "SCHED" "Inputs changed, rebuilding setup snapshot"
    sh "$MODDIR/features/setup_info.sh" >"$SPECTER_DIR/log/sched_setup_info.log" 2>&1 || log_e "SCHED" "setup_info failed"
  fi

  sleep 57
done
