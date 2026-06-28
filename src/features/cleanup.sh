#!/system/bin/sh
set -e
MODDIR=${0%/*}
. "$MODDIR/../lib/common.sh"
. "$MODDIR/../lib/constants.sh"

MODE="${1:-full}"

log_i "CLEANUP" "Starting cleanup (mode=$MODE)"

# Safety watchdog: self-terminate if we run too long
(sleep 30 && kill "$$" 2>/dev/null) &
_watchdog_pid="$!"

case "$MODE" in
  logs-only)
    log_i "CLEANUP" "Log-only mode: clearing log files"
    rm -f "$SPECTER_DIR/log"/*.log "$SPECTER_DIR/log"/*.gz 2>/dev/null || true
    log_i "CLEANUP" "Log files cleared"
    kill "$_watchdog_pid" 2>/dev/null || true
    unset _watchdog_pid MODE
    exit 0
    ;;
  full)
    log_d "CLEANUP" "Waiting for boot completion..."
    while [ "$(getprop sys.boot_completed)" != "1" ]; do
      sleep 1
    done

    _rm() {
      [ -n "$1" ] || return 0
      [ -e "$1" ] || return 0
      rm -rf "$1" 2>/dev/null || log_w "CLEANUP" "Failed to remove $1"
    }

    log_i "CLEANUP" "Removing detector log files..."
    _rm "/storage/emulated/0/meow_detector.log"
    _rm "/storage/emulated/0/keybox_status.json"
    log_d "CLEANUP" "Detector logs removed"

    log_i "CLEANUP" "Removing tool app data directories..."
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
    log_d "CLEANUP" "Tool app data removed"

    log_i "CLEANUP" "Cleaning temp files..."
    _rm "/data/local/tmp/shizuku"
    _rm "/data/local/tmp/shizuku_starter"
    _rm "/data/local/tmp/byyang"
    _rm "/data/local/tmp/HyperCeiler"
    _rm "/data/local/tmp/luckys"
    _rm "/data/local/tmp/input_devices"
    _rm "/data/local/tmp/resetprop"
    log_d "CLEANUP" "Temp files cleaned"

    log_i "CLEANUP" "Clearing log buffers..."
    timeout 3 logcat -c >/dev/null 2>/dev/null || true
    timeout 3 dmesg -c >/dev/null 2>/dev/null || true
    log_d "CLEANUP" "Log buffers cleared"

    log_i "CLEANUP" "Cleaning system data..."
    _rm "/data/system/graphicsstats"
    _rm "/data/system/package_cache"
    _rm "/data/system/NoActive"
    _rm "/data/system/Freezer"
    _rm "/data/system/junge"
    log_d "CLEANUP" "System data cleaned"

    kill "$_watchdog_pid" 2>/dev/null || true
    unset _watchdog_pid
    ;;
esac

log_i "CLEANUP" "Cleanup completed (mode=$MODE)"
unset MODE
exit 0
