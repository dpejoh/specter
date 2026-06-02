#!/system/bin/sh
MODDIR=${0%/*}

# Re-exec into init mount namespace to escape APatch/KSU ksu.exec sandbox
if [ -z "$_NS_INIT" ] && [ -x /system/bin/nsenter ] && [ -e /proc/1/ns/mnt ]; then
  export _NS_INIT=1
  exec /system/bin/nsenter -t 1 -m -- /system/bin/sh "$0" "$@"
fi

. "$MODDIR/../lib/common.sh"
. "$MODDIR/../lib/config_env.sh"
. "$MODDIR/../lib/paths.sh"
. "$MODDIR/../lib/urls.sh"

log "HMA" "Start"

_installed_pkgs=$(pm list packages 2>/dev/null) || log "HMA" "Warning: Failed to list installed packages"

if echo "$_installed_pkgs" | grep -q "org.frknkrc44.hma_oss"; then
  _target_dir="$HMA_DIR"
  _target_file="$HMA_FILE"
  _found="HMA-OSS"
elif echo "$_installed_pkgs" | grep -q "com.tsng.hidemyapplist"; then
  _target_dir="/data/user/0/com.tsng.hidemyapplist/files"
  _target_file="$_target_dir/config.json"
  _found="HMA"
elif echo "$_installed_pkgs" | grep -q "com.google.android.hmal"; then
  _target_dir="/data/user/0/com.google.android.hmal/files"
  _target_file="$_target_dir/config.json"
  _found="HMAL"
else
  log "HMA" "No HMA variant installed, skipping"
  unset _installed_pkgs
  log "HMA" "Finish"
  exit 0
fi

log "HMA" "Found $_found"

if check_network; then
  ensure_dir "$_target_dir"
  rm -f "$_target_file" 2>/dev/null
  if [ -x /data/adb/ap/bin/busybox ] && /data/adb/ap/bin/busybox wget -T 10 --no-check-certificate -qO "$_target_file" -U "Specter/1.0" "$HMA_CONFIG_URL" 2>/dev/null && [ -s "$_target_file" ]; then
    chmod 600 "$_target_file" 2>/dev/null
    _pkg=$(echo "$_target_dir" | cut -d"/" -f5)
    _uid=$(pm list packages -U 2>/dev/null | grep "^package:$_pkg uid:" | sed "s/.*uid://") || _uid=0
    chown "$_uid:$_uid" "$_target_file" 2>/dev/null
    chown "$_uid:$_uid" "$_target_dir" 2>/dev/null
    log "HMA" "Config downloaded and written to $_found"
  elif download "$HMA_CONFIG_URL" "$_target_file" 2>/dev/null; then
    chmod 600 "$_target_file" 2>/dev/null
    _pkg=$(echo "$_target_dir" | cut -d"/" -f5)
    _uid=$(pm list packages -U 2>/dev/null | grep "^package:$_pkg uid:" | sed "s/.*uid://") || _uid=0
    chown "$_uid:$_uid" "$_target_file" 2>/dev/null
    chown "$_uid:$_uid" "$_target_dir" 2>/dev/null
    log "HMA" "Config downloaded and written to $_found"
  else
    log "HMA" "Download returned empty"
  fi
fi

unset _installed_pkgs _target_dir _target_file _found _uid _pkg
log "HMA" "Finish"
exit 0
