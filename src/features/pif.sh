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
    _prefs=$(cfg_get pif_preferred_devices '')
    if [ -z "$_prefs" ]; then
      _legacy_p=$(cfg_get pif_preferred_product '')
      _legacy_m=$(cfg_get pif_preferred_model '')
      [ -n "$_legacy_p" ] && _prefs="${_legacy_m}|${_legacy_p}"
      unset _legacy_p _legacy_m
    fi
    _has_canary=0
    if [ -z "$_prefs" ]; then
      _has_canary=1
    else
      while IFS= read -r _pl || [ -n "$_pl" ]; do
        [ -n "$_pl" ] || continue
        case "${_pl#*|}" in
          imported:*) ;;
          *) _has_canary=1; break ;;
        esac
      done <<EOF
$_prefs
EOF
      unset _pl
    fi
    if [ "$_has_canary" = "1" ]; then
      check_network || { log_e "PIF" "No internet connection"; exit 1; }
      sh "$PIF_DIR/autopif_ota.sh" 2>/dev/null || true
    fi
    if [ -n "$_prefs" ]; then
      _list=""
      if [ "$_has_canary" = "1" ]; then
        _list=$(sh "$PIF_DIR/autopif.sh" --list 2>/dev/null) || _list=""
      fi
      _choice=$(pif_choose_preferred "$_list" "$_prefs") || _choice=""
      if [ -z "$_choice" ]; then
        log_w "PIF" "No preferred devices left, skipping fetch"
        unset _prefs _list _choice _has_canary _NAME
        log_i "PIF" "PIF fingerprint updating complete"
        exit 0
      fi
      _pref_model="${_choice%%|*}"
      _pref_product="${_choice#*|}"
      case "$_pref_product" in
        imported:*)
          _imp_id="${_pref_product#imported:}"
          log_i "PIF" "Using imported device: $_pref_model ($_imp_id)"
          if pif_apply_imported "$_imp_id"; then
            _pif_model="$_pref_model"
          else
            log_w "PIF" "Failed to apply imported device $_imp_id"
          fi
          unset _imp_id
          ;;
        *)
          log_i "PIF" "Using preferred device: $_pref_model ($_pref_product)"
          _pif_out=$(MODEL="$_pref_model" PRODUCT="$_pref_product" sh "$PIF_DIR/autopif.sh" 2>/dev/null) || log_w "PIF" "autopif.sh failed"
          _pif_model=$(echo "$_pif_out" | grep '^MODEL=' | head -1 | sed 's/^MODEL=//')
          unset _pif_out
          ;;
      esac
      unset _pref_model _pref_product _choice
    else
      _pif_out=$(sh "$PIF_DIR/autopif.sh" 2>/dev/null) || log_w "PIF" "autopif.sh failed"
      _pif_model=$(echo "$_pif_out" | grep '^MODEL=' | head -1 | sed 's/^MODEL=//')
      unset _pif_out
    fi
    [ -n "$_pif_model" ] && log_i "PIF" "Selected Device: $_pif_model"
    unset _pif_model _prefs _list _has_canary
    ;;
  *Fork*)
    check_network || { log_e "PIF" "No internet connection"; exit 1; }
    _pif_out=$(sh "$PIF_DIR/autopif4.sh" -m 2>/dev/null) || log_w "PIF" "autopif4.sh failed"
    _pif_model=$(echo "$_pif_out" | grep '^MODEL=' | head -1 | sed 's/^MODEL=//')
    [ -n "$_pif_model" ] && log_i "PIF" "Selected Device: $_pif_model"
    unset _pif_out _pif_model
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
