#!/system/bin/sh
set -e
MODDIR=${0%/*}
. "$MODDIR/../lib/common.sh"
. "$MODDIR/../lib/constants.sh"

log_d "PLAY_STORE" "Force-stopping Play Store"
am force-stop com.android.vending >/dev/null 2>&1 && log_i "PLAY_STORE" "Play Store force-stopped" || log_w "PLAY_STORE" "Failed to force-stop Play Store"
pm clear com.android.vending >/dev/null 2>&1 && log_i "PLAY_STORE" "Play Store data cleared" || log_w "PLAY_STORE" "Failed to clear Play Store data"
log_i "PLAY_STORE" "Play Store management complete"
exit 0
