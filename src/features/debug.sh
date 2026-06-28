#!/system/bin/sh
set -e
MODDIR=${0%/*}
. "$MODDIR/../lib/common.sh"
. "$MODDIR/../lib/constants.sh"

LOG_DIR="$SPECTER_DIR/log"

_filter_level="${1:-all}"
case "$_filter_level" in
  all|error|warn|info|debug) ;;
  *) echo "Usage: debug.sh [all|error|warn|info|debug]" >&2; exit 1 ;;
esac

_filter_re=""
case "$_filter_level" in
  error) _filter_re='^\[[^]]*\] \[E\]' ;;
  warn)  _filter_re='^\[[^]]*\] \[[W]\]' ;;
  info)  _filter_re='^\[[^]]*\] \[[I]\]' ;;
  debug) _filter_re='^\[[^]]*\] \[[D]\]' ;;
esac

_filter_log() {
  _fl_file="$1" _fl_lines="${2:-30}"
  [ -f "$_fl_file" ] || { echo "(no $(basename "$_fl_file"))"; return 0; }
  if [ -z "$_filter_re" ]; then
    tail -"$_fl_lines" "$_fl_file" 2>/dev/null
  else
    grep -E "$_filter_re" "$_fl_file" 2>/dev/null | tail -"$_fl_lines"
  fi
}

echo "========================================"
echo "  Specter Debug Summary [$_filter_level]"
echo "========================================"
echo ""

echo "=== Boot Log (last 30 lines) ==="
_filter_log "$LOG_DIR/boot.log" 30
echo ""

echo "=== Action Log (last 15 lines) ==="
_filter_log "$LOG_DIR/action.log" 15
echo ""

echo "=== Scheduler Log (last 15 lines) ==="
_filter_log "$LOG_DIR/scheduler.log" 15
echo ""

echo "=== Scheduler Tasks ==="
for _stf in "$LOG_DIR"/sched_*.log; do
  [ -f "$_stf" ] || continue
  _stf_errors=$(grep -cE '^\[[^]]*\] \[[EW]\]' "$_stf" 2>/dev/null || echo "0")
  echo "  $(basename "$_stf"): $_stf_errors issues"
done
echo ""

echo "=== Scheduler Status ==="
if [ -f "$SPECTER_DIR/scheduler.pid" ]; then
  _pid=$(cat "$SPECTER_DIR/scheduler.pid" 2>/dev/null)
  if kill -0 "$_pid" 2>/dev/null; then
    echo "  Running (PID $_pid)"
  else
    echo "  Stale PID $_pid (not running)"
  fi
else
  echo "  Not running"
fi
echo ""

echo "=== Log Directory ==="
ls -lh "$LOG_DIR" 2>/dev/null || echo "(empty)"
echo ""

echo "=== Log Storage ==="
_total=0
for _lf in "$LOG_DIR"/*; do
  [ -f "$_lf" ] && _total=$((_total + $(stat -c%s "$_lf" 2>/dev/null || echo 0)))
done
echo "  Total: $(_total / 1024 2>/dev/null || echo 0) KB ($_total bytes)"
echo ""

echo "=== logcat (last 20 Specter lines) ==="
if command -v logcat >/dev/null 2>&1; then
  logcat -d -s Specter 2>/dev/null | tail -20 || echo "  (logcat unavailable)"
else
  echo "  (logcat not available)"
fi
echo ""
echo "========================================"
exit 0
