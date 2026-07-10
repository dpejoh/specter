#!/system/bin/sh
set -e
MODDIR=${0%/*}
. "$MODDIR/../lib/common.sh"

detect_keystore_manager

if [ "$KSM" != "omk" ]; then
  log_i "OMK_HEAL" "Active keystore manager is ${KSM_NAME:-none}, nothing to do"
  exit 0
fi

ksm_heal_if_wedged
log_i "OMK_HEAL" "Heal check complete"
exit 0
