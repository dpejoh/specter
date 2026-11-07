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

for _kw_arg in "$@"; do
  [ "$_kw_arg" = "--fresh" ] && export KEYBOX_CATALOG_TTL=0 GOOGLE_REVOCATION_TTL=0
done
unset _kw_arg

log_d "KEYBOX_WATCH" "Starting keybox watch"

if ! sh "$INFO_SCRIPT" >/dev/null 2>&1; then
  log_w "KEYBOX_WATCH" "Keybox info refresh failed; skipping replacement"
  exit 1
fi

if [ ! -s "$INFO_PATH" ]; then
  log_w "KEYBOX_WATCH" "Keybox info unavailable; skipping replacement"
  exit 1
fi

_info=""
[ -f "$INFO_PATH" ] && _info=$(tr -d '\n\r' < "$INFO_PATH" 2>/dev/null || true)

_needs_replace=0
if printf '%s' "$_info" | grep -qE '"revoked"[[:space:]]*:[[:space:]]*true|"expired"[[:space:]]*:[[:space:]]*true'; then
  _needs_replace=1
fi

if [ "$_needs_replace" != "1" ]; then
  if printf '%s' "$_info" | grep -qE '"cert_validity"[[:space:]]*:[[:space:]]*"valid"'; then
    log_d "KEYBOX_WATCH" "Keybox is healthy"
  else
    log_w "KEYBOX_WATCH" "Keybox certificate validity is unknown"
  fi
  exit 0
fi

if [ "$(cfg_get toggle_keybox_auto_replace 1)" != "1" ]; then
  log_w "KEYBOX_WATCH" "Keybox needs replacement but auto-replace is disabled"
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
