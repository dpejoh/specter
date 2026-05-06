#!/system/bin/sh
MODDIR=${0%/*}
. "$MODDIR/../lib/common.sh"

log "PIF" "Start"

PIF_DIR="/data/adb/modules/playintegrityfix"

check_network || { log "PIF" "Error: No internet connection"; exit 1; }

if [ ! -d "$PIF_DIR" ] || [ ! -f "$PIF_DIR/module.prop" ]; then
  log "PIF" "Error: Play Integrity Fix not found at $PIF_DIR"
  exit 1
fi

# Detect variant by checking scripts on disk
if [ -f "$PIF_DIR/autopif_ota.sh" ]; then
  log "PIF" "Variant: Play Integrity Fix [INJECT]"
else
  log "PIF" "Variant: Play Integrity Fork"
fi

_ran=0

if [ -f "$PIF_DIR/autopif_ota.sh" ]; then
  log "PIF" "Running autopif_ota.sh..."
  sh "$PIF_DIR/autopif_ota.sh" && log "PIF" "autopif_ota.sh done" || log "PIF" "Warning: autopif_ota.sh failed"
  _ran=$((_ran + 1))
fi

if [ -f "$PIF_DIR/autopif.sh" ]; then
  log "PIF" "Running autopif.sh..."
  sh "$PIF_DIR/autopif.sh" && log "PIF" "autopif.sh done" || log "PIF" "Warning: autopif.sh failed"
  _ran=$((_ran + 1))
fi

if [ -f "$PIF_DIR/autopif4.sh" ]; then
  log "PIF" "Running autopif4.sh..."
  sh "$PIF_DIR/autopif4.sh" -m && log "PIF" "autopif4.sh done" || log "PIF" "Warning: autopif4.sh failed"
  _ran=$((_ran + 1))
fi

if [ "$_ran" -eq 0 ]; then
  log "PIF" "Error: No update scripts found in $PIF_DIR"
  exit 1
fi

unset _ran
log "PIF" "Finish"
exit 0
