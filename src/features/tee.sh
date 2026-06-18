#!/system/bin/sh
set -e
MODDIR=${0%/*}
. "$MODDIR/../lib/common.sh"

log "TEE" "Start"

if [ -f "$TEE_STATUS" ]; then
  _b=$(grep -E '^(tee_broken|tee_fallback)=' "$TEE_STATUS" 2>/dev/null | cut -d= -f2)
  log "TEE" "Status: ${_b:-$(cat "$TEE_STATUS")}"
else
  log "TEE" "Status: pending"
fi

if [ -f "$TEE_HASH" ]; then
  _h=$(cat "$TEE_HASH")
elif [ -f "$VBMETA_DIGEST" ]; then
  _h=$(cat "$VBMETA_DIGEST")
fi
[ -n "$_h" ] && log "TEE" "Hash: $_h" || log "TEE" "Hash: unavailable"
unset _b _h

log "TEE" "Done"