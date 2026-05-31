#!/system/bin/sh
set -e
MODDIR=${0%/*}
. "$MODDIR/../lib/common.sh"

log "PIF" "Start"

PIF_DIR="/data/adb/modules/playintegrityfix"

check_network || { log "PIF" "Error: No internet connection"; exit 1; }

if [ ! -d "$PIF_DIR" ] || [ ! -f "$PIF_DIR/module.prop" ]; then
  log "PIF" "Error: Play Integrity Fix not found at $PIF_DIR"
  exit 1
fi

_NAME=$(grep "^name=" "$PIF_DIR/module.prop" | cut -d= -f2-)
log "PIF" "Detected: $_NAME"

case "$_NAME" in
  *INJECT*)
    sh "$PIF_DIR/autopif_ota.sh" 2>/dev/null || true
    sh "$PIF_DIR/autopif.sh" || log "PIF" "Warning: autopif.sh failed"
    ;;
  *Fork*)
    sh "$PIF_DIR/autopif4.sh" -m || log "PIF" "Warning: autopif4.sh failed"
    ;;
  *)
    log "PIF" "Error: Unknown module '$_NAME', can't update"
    log "PIF" "Use Play Integrity Fix [INJECT] or Play Integrity Fork"
    exit 1
    ;;
esac

unset _NAME PIF_DIR
log "PIF" "Finish"
exit 0
