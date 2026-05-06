#!/system/bin/sh
set -e
MODDIR=${0%/*}
. "$MODDIR/../lib/common.sh"

log "PIF2" "Start"

if resetprop 2>/dev/null | grep -qE 'persist\.sys\.(pihooks|entryhooks|pixelprops)' || [ -f "$GMS_PROPS_FILE" ]; then
  log "PIF2" "Spoof engines detected — cleaning"
  disable_rom_spoof_engines
  log "PIF2" "Done"
else
  log "PIF2" "No spoof engines found"
fi

log "PIF2" "Finish"
exit 0
