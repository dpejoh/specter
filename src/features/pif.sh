#!/system/bin/sh
set -e
MODDIR=${0%/*}
. "$MODDIR/../lib/common.sh"
. "$MODDIR/../lib/pif_preferred.sh"

log_i "PIF" "Starting PIF fingerprint update"

: "${PIF_DIR:=$MODULES_BASE/playintegrityfix}"

if [ ! -d "$PIF_DIR" ] || [ ! -f "$PIF_DIR/module.prop" ]; then
  log_e "PIF" "Play Integrity Fix not found at $PIF_DIR"
  exit 1
fi

_NAME=$(grep "^name=" "$PIF_DIR/module.prop" | cut -d= -f2-)
log_i "PIF" "Detected: $_NAME"

case "$_NAME" in
  *INJECT*)
    _pap_rc=0
    pif_apply_preferred "$_NAME" || _pap_rc=$?
    if [ "$_pap_rc" -eq 2 ]; then
      unset _NAME _pap_rc
      exit 1
    fi
    if [ "$_pap_rc" -ne 0 ]; then
      check_network || { log_e "PIF" "No internet connection"; exit 1; }
      sh "$PIF_DIR/autopif_ota.sh" 2>/dev/null || true
      _pif_out=$(sh "$PIF_DIR/autopif.sh" 2>/dev/null) || log_w "PIF" "autopif.sh failed"
      _pif_model=$(echo "$_pif_out" | grep '^MODEL=' | head -1 | sed 's/^MODEL=//')
      [ -n "$_pif_model" ] && log_i "PIF" "Selected Device: $_pif_model"
      unset _pif_out _pif_model
    fi
    unset _pap_rc
    ;;
  *Fork*)
    _pap_rc=0
    pif_apply_preferred "$_NAME" || _pap_rc=$?
    if [ "$_pap_rc" -eq 2 ]; then
      unset _NAME _pap_rc
      exit 1
    fi
    if [ "$_pap_rc" -ne 0 ]; then
      check_network || { log_e "PIF" "No internet connection"; exit 1; }
      _pif_out=$(sh "$PIF_DIR/autopif4.sh" -m 2>/dev/null) || log_w "PIF" "autopif4.sh failed"
      _pif_model=$(echo "$_pif_out" | grep '^MODEL=' | head -1 | sed 's/^MODEL=//')
      [ -n "$_pif_model" ] && log_i "PIF" "Selected Device: $_pif_model"
      unset _pif_out _pif_model
    fi
    unset _pap_rc
    ;;
  *Hybrid*)
    log_i "PIF" "Hybrid manages fingerprints itself, skipping"
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
