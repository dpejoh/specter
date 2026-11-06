#!/system/bin/sh
set -e
MODDIR=${0%/*}
. "$MODDIR/../lib/common.sh"
. "$MODDIR/../lib/constants.sh"

INFO_PATH="${SPECTER_KEYBOX_INFO:-$MODDIR/../webroot/json/keybox_info.json}"
INFO_SCRIPT="${SPECTER_KEYBOX_INFO_SCRIPT:-$MODDIR/keybox_info.sh}"
KEYBOX_SCRIPT="${SPECTER_KEYBOX_SCRIPT:-$MODDIR/keybox.sh}"
GUARD="$SPECTER_DIR/cache/keybox_watch_last_replace"
GUARD_SECONDS="${KEYBOX_WATCH_REPLACE_GUARD:-1800}"

log_d "KEYBOX_WATCH" "Starting keybox watch"

sh "$INFO_SCRIPT" >/dev/null 2>&1 || true

_info=""
[ -f "$INFO_PATH" ] && _info=$(tr -d '\n\r' < "$INFO_PATH" 2>/dev/null || true)

_needs_replace=0
if printf '%s' "$_info" | grep -qE '"revoked"[[:space:]]*:[[:space:]]*true|"expired"[[:space:]]*:[[:space:]]*true'; then
  _needs_replace=1
fi

if [ "$_needs_replace" != "1" ]; then
  log_d "KEYBOX_WATCH" "Keybox is healthy"
  exit 0
fi

if [ "$(cfg_get toggle_autokeybox 0)" != "1" ]; then
  log_w "KEYBOX_WATCH" "Keybox needs replacement but Auto Keybox is off"
  exit 0
fi

_now=$(date +%s 2>/dev/null || echo 0)
_last=$(cat "$GUARD" 2>/dev/null || echo 0)
case "$_last" in *[!0-9]*|"") _last=0 ;; esac
if [ "$_now" -ge 0 ] && [ "$_last" -gt 0 ] && [ "$((_now - _last))" -lt "$GUARD_SECONDS" ]; then
  log_w "KEYBOX_WATCH" "Auto replacement already attempted recently, waiting"
  exit 0
fi

ensure_dir "$SPECTER_DIR/cache"
ensure_dir "$SPECTER_DIR/log"
printf '%s' "$_now" > "$GUARD" 2>/dev/null || true

log_w "KEYBOX_WATCH" "Revoked/expired keybox detected; attempting automatic replacement"
if sh "$KEYBOX_SCRIPT" >>"$SPECTER_DIR/log/keybox_watch.log" 2>&1; then
  log_i "KEYBOX_WATCH" "Replacement installed"
else
  log_e "KEYBOX_WATCH" "Automatic replacement failed"
fi

# Refresh the snapshot even when installation failed, so the UI reflects reality.
sh "$INFO_SCRIPT" >/dev/null 2>&1 || true

unset _info _needs_replace _now _last
exit 0
