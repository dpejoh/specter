#!/system/bin/sh
set -e
MODDIR=${0%/*}
. "$MODDIR/../lib/common.sh"
. "$MODDIR/../lib/paths.sh"
. "$MODDIR/../lib/package_list.sh"
. "$MODDIR/../lib/config_env.sh"

log "CLEANUP" "Start"

log "CLEANUP" "Waiting for boot completion..."
while [ "$(getprop sys.boot_completed)" != "1" ]; do
  sleep 1
done

_rm() {
  [ -n "$1" ] || return 0
  [ -e "$1" ] || return 0
  rm -rf "$1" 2>/dev/null || log "CLEANUP" "Warning: Failed to remove $1"
}

log "CLEANUP" "Hiding recovery folders..."
hide_recovery_folders

log "CLEANUP" "Removing detector app data directories..."
for _pkg in $DETECTOR_APPS; do
  _rm "/storage/emulated/0/Android/data/$_pkg"
  _rm "/storage/emulated/0/Android/obb/$_pkg"
  _rm "/storage/emulated/0/Android/media/$_pkg"
done
log "CLEANUP" "Detector app directories cleaned"

log "CLEANUP" "Removing detector log files..."
_rm "/storage/emulated/0/meow_detector.log"
_rm "/storage/emulated/0/keybox_status.json"
log "CLEANUP" "Detector logs removed"

log "CLEANUP" "Removing tool app data directories..."
for _pkg in $TOOL_APPS; do
  _rm "/storage/emulated/0/Android/data/$_pkg"
done
_rm "/storage/emulated/0/MT2"
_rm "/storage/emulated/0/bin.mt.termux"
_rm "/storage/emulated/0/com.termux"
_rm "/storage/emulated/0/xzr.hkf"
_rm "/storage/emulated/0/Download/WechatXposed"
_rm "/storage/emulated/0/WechatXposed"
_rm "/storage/emulated/0/Android/naki"
_rm "/storage/emulated/0/最新版隐藏配置.json"
_rm "/storage/emulated/0/rlgg"
_rm "/storage/emulated/legacy"
_rm "/storage/emulated/com.luckyzyx.luckytool"
log "CLEANUP" "Tool app data removed"

log "CLEANUP" "Cleaning temp files..."
_rm "/data/local/tmp/shizuku"
_rm "/data/local/tmp/shizuku_starter"
_rm "/data/local/tmp/byyang"
_rm "/data/local/tmp/HyperCeiler"
_rm "/data/local/tmp/luckys"
_rm "/data/local/tmp/input_devices"
_rm "/data/local/tmp/resetprop"
log "CLEANUP" "Temp files cleaned"

log "CLEANUP" "Clearing log buffers..."
logcat -c 2>/dev/null || true
dmesg -c 2>/dev/null || true
log "CLEANUP" "Log buffers cleared"

log "CLEANUP" "Cleaning ANR traces..."
_rm "/data/anr"
log "CLEANUP" "ANR traces cleaned"

log "CLEANUP" "Cleaning device logs..."
_rm "/dev/log"
log "CLEANUP" "Device logs cleaned"

log "CLEANUP" "Cleaning kernel debug traces..."
_rm "/sys/kernel/debug"
log "CLEANUP" "Kernel debug traces cleaned"

log "CLEANUP" "Cleaning system data..."
_rm "/data/system/graphicsstats"
_rm "/data/system/package_cache"
_rm "/data/system/NoActive"
_rm "/data/system/Freezer"
_rm "/data/system/junge"
log "CLEANUP" "System data cleaned"

log "CLEANUP" "Cleanup completed"
log "CLEANUP" "Finish"
exit 0
