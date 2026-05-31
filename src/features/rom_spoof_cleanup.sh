#!/system/bin/sh
set -e
MODDIR=${0%/*}
. "$MODDIR/../lib/common.sh"
. "$MODDIR/../lib/config_env.sh"

log "ROM_SPOOF" "Start"

if resetprop 2>/dev/null | grep -qE 'persist\.sys\.(entryhooks|pixelprops)' || [ -f "$GMS_PROPS_FILE" ]; then
  log "ROM_SPOOF" "Spoof engines detected, cleaning"
  block_rom_spoof_engines
  log "ROM_SPOOF" "Done"
else
  log "ROM_SPOOF" "No spoof engines found"
fi

log "ROM_SPOOF" "Finish"
exit 0
