#!/system/bin/sh
set -e
MODDIR=${0%/*}
. "$MODDIR/../lib/common.sh"

detect_keystore_manager

if [ "$KSM" != "omk" ]; then
  die "OhMyKeymint is not the active keystore manager (${KSM_NAME:-none})"
fi

ksm_reload_full
log_i "OMK_RESTART" "Full OMK restart requested (keymint + injector)"
exit 0
