#!/system/bin/sh
set -e
MODDIR=${0%/*}
. "$MODDIR/../lib/common.sh"

log_i "PIF" "Starting PIF fingerprint update"

: "${PIF_DIR:=$MODULES_BASE/playintegrityfix}"

check_network || { log_e "PIF" "No internet connection"; exit 1; }

if [ ! -d "$PIF_DIR" ] || [ ! -f "$PIF_DIR/module.prop" ]; then
  log_e "PIF" "Play Integrity Fix not found at $PIF_DIR"
  exit 1
fi

_NAME=$(grep "^name=" "$PIF_DIR/module.prop" | cut -d= -f2-)
log_i "PIF" "Detected: $_NAME"

case "$_NAME" in
  *INJECT*)
    sh "$PIF_DIR/autopif_ota.sh" 2>/dev/null || true
    _pif_out=$(sh "$PIF_DIR/autopif.sh" 2>/dev/null) || log_w "PIF" "autopif.sh failed"
    _pif_model=$(echo "$_pif_out" | grep '^MODEL=' | head -1 | sed 's/^MODEL=//')
    [ -n "$_pif_model" ] && log_i "PIF" "Selected Device: $_pif_model"
    unset _pif_out _pif_model
    ;;
  *Fork*)
    _pif_out=$(sh "$PIF_DIR/autopif4.sh" -m 2>/dev/null) || log_w "PIF" "autopif4.sh failed"
    _pif_model=$(echo "$_pif_out" | grep '^MODEL=' | head -1 | sed 's/^MODEL=//')
    [ -n "$_pif_model" ] && log_i "PIF" "Selected Device: $_pif_model"
    unset _pif_out _pif_model
    ;;
  *)
    log_e "PIF" "Unknown module '$_NAME', can't update"
    log_w "PIF" "Use Play Integrity Fix [INJECT] or Play Integrity Fork"
    exit 1
    ;;
esac

unset _NAME
log_i "PIF" "PIF fingerprint updating complete"
exit 0
