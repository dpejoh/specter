#!/system/bin/sh
set -e
MODDIR=${0%/*}
. "$MODDIR/../lib/common.sh"
. "$MODDIR/../lib/paths.sh"

REQUIRED="1.3.0"

log "ZYGISK_NEXT" "Start"

ZYNEXT_DIR="/data/adb/modules/zygisksu"
[ ! -d "$ZYNEXT_DIR" ] && ZYNEXT_DIR="/data/adb/modules_update/zygisksu"

ZYNEXT_PROPFILE="$ZYNEXT_DIR/module.prop"
SCRIPT_FILE="$ZYNEXT_DIR/bin/zygiskd"

if [ ! -f "$ZYNEXT_PROPFILE" ]; then
  log "ZYGISK_NEXT" "Error: Zygisk Next module not found at $ZYNEXT_DIR"
  exit 1
fi

if [ ! -x "$SCRIPT_FILE" ]; then
  log "ZYGISK_NEXT" "Error: zygiskd binary not found or not executable at $SCRIPT_FILE"
  exit 1
fi

CURRENT=$(grep "^version=" "$ZYNEXT_PROPFILE" | cut -d'=' -f2 | cut -d' ' -f1)
log "ZYGISK_NEXT" "Detected Zygisk Next version $CURRENT"
ensure_dir "$(dirname "$SCRIPT_FILE")"

version_ge "$CURRENT" "$REQUIRED" || {
  log "ZYGISK_NEXT" "Error: Zygisk Next version $CURRENT is too low, need $REQUIRED"
  exit 0
}

_settled=0
for _pair in "enforce-denylist:just_umount" "memory-type:anonymous" "linker:builtin"; do
  _key="${_pair%:*}"
  _val="${_pair#*:}"
  _current=$("$SCRIPT_FILE" "$_key" 2>/dev/null || echo "")
  if [ "$_current" = "$_val" ]; then
    _settled=$((_settled + 1))
    continue
  fi
  "$SCRIPT_FILE" "$_key" "$_val" 2>/dev/null && _settled=$((_settled + 1)) || log "ZYGISK_NEXT" "Warning: Failed to set $_key"
done
unset _pair _key _val _current

log "ZYGISK_NEXT" "$_settled/3 settings applied"
log "ZYGISK_NEXT" "Finish"
exit 0
