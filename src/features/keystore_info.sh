#!/system/bin/sh
set -e
MODDIR=${0%/*}
. "$MODDIR/../lib/common.sh"
. "$MODDIR/../lib/constants.sh"

detect_keystore_manager

INFO_PATH="$MODDIR/../webroot/json/keystore_manager.json"
ensure_dir "$(dirname "$INFO_PATH")"

cat <<EOF > "$INFO_PATH"
{
  "id": "$KSM",
  "name": "$(_escape_json "$KSM_NAME")",
  "format": "$(_escape_json "$KSM_FORMAT")",
  "dir": "$(_escape_json "$KSM_DIR")",
  "targets": "$(_escape_json "$KSM_TARGETS")",
  "config": "$(_escape_json "$KSM_CONFIG")",
  "perAppModes": $([ "$KSM_PER_APP_MODES" = "1" ] && echo true || echo false)
}
EOF

log_i "KEYSTORE_INFO" "Active manager: ${KSM_NAME:-none}"
if [ "$KSM" != "none" ]; then
  log_i "KEYSTORE_INFO" "Configuration: format=$KSM_FORMAT; targets=$KSM_TARGETS; config=$KSM_CONFIG"
fi
exit 0
