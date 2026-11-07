#!/system/bin/sh
# Deploy module update from sdcard zip to /data/adb/modules/specter/
# Usage: su -c sh /sdcard/specter-update/deploy-module.sh [zip-path]
# If no zip path given, uses latest Specter-*.zip in the same directory

SRC="${1:-/sdcard/specter-update/Specter-*.zip}"
ZIP=$(ls $SRC 2>/dev/null | sort | tail -1)

if [ -z "$ZIP" ] || [ ! -f "$ZIP" ]; then
  echo "No zip found matching: $SRC"
  echo "Push the zip first: adb push Specter-*.zip /sdcard/specter-update/"
  exit 1
fi

MODULE_DIR="/data/adb/modules/specter"
SPECTER_DATA="${SPECTER_DATA:-/data/adb/specter}"
echo "=== Deploying: $ZIP"
echo "Target: $MODULE_DIR"

# Stop every scheduler copy and watcher, not just the pid-file one: repeated
# hot installs can leave older schedulers running against the old files.
for _sched_pid in $(pgrep -f "$MODULE_DIR/lib/scheduler.sh" 2>/dev/null || true); do
  for _child_pid in $(pgrep -P "$_sched_pid" 2>/dev/null || true); do
    kill -9 "$_child_pid" 2>/dev/null || true
  done
  kill -9 "$_sched_pid" 2>/dev/null || true
done
for _watch_pid in $(pgrep -f "$MODULE_DIR/deps/inotifyd" 2>/dev/null || true); do
  kill -9 "$_watch_pid" 2>/dev/null || true
done
rm -f "$SPECTER_DATA/scheduler.pid" "$SPECTER_DATA/.inotify_handler.sh"
sleep 1
unset _sched_pid _child_pid _watch_pid

# Backup config if it exists
if [ -f "$MODULE_DIR/config/specter.conf" ]; then
  cp "$MODULE_DIR/config/specter.conf" /data/local/tmp/specter.conf.bak
  echo "Backed up config"
fi

# Runtime state is generated on-device and is not in the zip.
RUNTIME_JSON="/data/local/tmp/specter-webui-json"
rm -rf "$RUNTIME_JSON"
mkdir -p "$RUNTIME_JSON"
for _f in state.json info.json keybox_info.json keystore_manager.json monet.json setup_info.json; do
  [ -f "$MODULE_DIR/webroot/json/$_f" ] && cp "$MODULE_DIR/webroot/json/$_f" "$RUNTIME_JSON/$_f"
done
unset _f

# Clean and extract
rm -rf "$MODULE_DIR"
mkdir -p "$MODULE_DIR"
unzip -o "$ZIP" -d "$MODULE_DIR" > /dev/null 2>&1
if [ $? -ne 0 ]; then
  echo "ERROR: unzip failed"
  exit 1
fi

# Restore config
if [ -f /data/local/tmp/specter.conf.bak ]; then
  mkdir -p "$MODULE_DIR/config"
  cp /data/local/tmp/specter.conf.bak "$MODULE_DIR/config/specter.conf"
  rm /data/local/tmp/specter.conf.bak
  echo "Restored config"
fi

# Restore runtime WebUI state and refresh the combined snapshot.
if [ -d "$RUNTIME_JSON" ]; then
  for _f in state.json info.json keybox_info.json keystore_manager.json monet.json setup_info.json; do
    [ -f "$RUNTIME_JSON/$_f" ] && cp "$RUNTIME_JSON/$_f" "$MODULE_DIR/webroot/json/$_f"
  done
  unset _f
  rm -rf "$RUNTIME_JSON"
  if [ -f "$MODULE_DIR/features/modules_state.sh" ]; then
    MODDIR="$MODULE_DIR" sh "$MODULE_DIR/features/modules_state.sh" >/dev/null 2>&1 || true
  fi
  if [ -f "$MODULE_DIR/lib/common.sh" ]; then
    ( MODDIR="$MODULE_DIR"; . "$MODULE_DIR/lib/common.sh"; write_webui_state ) >/dev/null 2>&1 || true
  fi
  echo "Restored WebUI state"
fi

# Permissions
chmod -R 755 "$MODULE_DIR"
chmod -R 644 "$MODULE_DIR/webroot"/*.html "$MODULE_DIR/webroot/assets"/*.css "$MODULE_DIR/webroot/assets"/*.js 2>/dev/null || true
chmod 644 "$MODULE_DIR/webroot/json/"*.json 2>/dev/null || true

# Hot installs skip customize.sh, so normalize the arch-specific watcher binary.
if [ -f "$MODULE_DIR/lib/common.sh" ]; then
  ( MODDIR="$MODULE_DIR"; . "$MODULE_DIR/lib/common.sh"; install_inotifyd "$MODULE_DIR" ) >/dev/null 2>&1 || true
fi

# Start the scheduler with the new task intervals/state code. Respect a
# disabled scheduler so a hot install cannot silently re-enable it.
_sched_enabled=1
[ -f "$SPECTER_DATA/config/val/toggle_scheduler.val" ] && _sched_enabled=$(cat "$SPECTER_DATA/config/val/toggle_scheduler.val" 2>/dev/null || echo 1)
if [ "$_sched_enabled" != "0" ]; then
  mkdir -p "$SPECTER_DATA/log" 2>/dev/null || true
  if command -v setsid >/dev/null 2>&1; then
    nohup setsid sh "$MODULE_DIR/lib/scheduler.sh" >>"$SPECTER_DATA/log/scheduler.log" 2>&1 </dev/null &
  else
    nohup sh "$MODULE_DIR/lib/scheduler.sh" >>"$SPECTER_DATA/log/scheduler.log" 2>&1 </dev/null &
  fi
  echo "Started scheduler"
fi
unset _sched_enabled

echo "=== Done! Module files updated at $MODULE_DIR"
echo "Hard-refresh the webui page to pick up changes."
