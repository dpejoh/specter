#!/system/bin/sh
set -e
MODDIR=${0%/*}
. "$MODDIR/../lib/common.sh"

log_i "TEE" "Starting TEE status check"

# If a cached result exists, just log and exit
if [ -f "$TEE_STATUS" ] && [ ! -f "$SPECTER_DIR/tee_reported" ]; then
  _b=$(grep -E '^(tee_broken|tee_fallback)=' "$TEE_STATUS" 2>/dev/null | cut -d= -f2)
  case "$_b" in
    true)  _bs="Broken" ;;
    false) _bs="Normal" ;;
    *)     _bs="Unknown" ;;
  esac
  log_i "TEE" "Status: ${_bs:-$(cat "$TEE_STATUS")}"
  if [ -f "$TEE_TIER" ]; then
    _t=$(cat "$TEE_TIER" | tr -d ' \n')
    case "$_t" in
      0) _tn="Software" ;;
      1) _tn="TEE" ;;
      2) _tn="StrongBox" ;;
      *) _tn="Unknown(${_t})" ;;
    esac
    log_i "TEE" "Tier: $_tn"
    unset _tn _t
  fi
  if [ -f "$TEE_BHASH" ]; then
    _h=$(cat "$TEE_BHASH")
  elif [ -f "$VBMETA_DIGEST" ]; then
    _h=$(cat "$VBMETA_DIGEST")
  fi
  [ -n "$_h" ] && log_i "TEE" "Hash: $_h" || log_i "TEE" "Hash: unavailable"
  unset _b _bs _h
  log_d "TEE" "Done (cached)"
  exit 0
fi

# No cached result — run the check via app_process (needs Binder/keystore ready)
_dex="$MODDIR/../deps/classes.dex"
if [ ! -f "$_dex" ]; then
  log_e "TEE" "classes.dex not found at $_dex"
  exit 1
fi

sleep 5
/system/bin/app_process -Djava.class.path="$_dex" / com.dpejoh.specter.Main "$SPECTER_DIR" 2>&1 || true
rm -f "$SPECTER_DIR/tee_reported"
unset _dex

if [ -f "$TEE_STATUS" ]; then
  _b=$(grep -E '^(tee_broken|tee_fallback)=' "$TEE_STATUS" 2>/dev/null | cut -d= -f2)
  case "$_b" in
    true)  _bs="Broken" ;;
    false) _bs="Normal" ;;
    *)     _bs="Unknown" ;;
  esac
  log_i "TEE" "Status: ${_bs:-$(cat "$TEE_STATUS")}"
else
  log_w "TEE" "Status: unknown (no status file written)"
fi

if [ -f "$TEE_TIER" ]; then
  _t=$(cat "$TEE_TIER" | tr -d ' \n')
  case "$_t" in
    0) _tn="Software" ;;
    1) _tn="TEE" ;;
    2) _tn="StrongBox" ;;
    *) _tn="Unknown(${_t})" ;;
  esac
  log_i "TEE" "Tier: $_tn"
  unset _t _tn
fi

if [ -f "$TEE_BHASH" ]; then
  _h=$(cat "$TEE_BHASH")
  log_i "TEE" "Hash: $_h"
else
  log_i "TEE" "Hash: unavailable"
fi
unset _b _bs _h

log_i "TEE" "TEE status check complete"