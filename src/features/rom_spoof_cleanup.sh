#!/system/bin/sh
set -e
MODDIR=${0%/*}
. "$MODDIR/../lib/common.sh"
. "$MODDIR/../lib/constants.sh"

log_i "ROM_SPOOF" "Starting ROM spoof cleanup"

if resetprop 2>/dev/null | grep -qE 'persist\.sys\.(entryhooks|pixelprops)' || [ -f "$GMS_PROPS_FILE" ]; then
  log_i "ROM_SPOOF" "Spoof engines detected, cleaning"
  block_rom_spoof_engines
  log_d "ROM_SPOOF" "Done"
else
  log_d "ROM_SPOOF" "No spoof engines found"
fi

log_i "ROM_SPOOF" "ROM spoof cleanup complete"
exit 0
