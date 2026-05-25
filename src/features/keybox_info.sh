#!/system/bin/sh
MODDIR=${0%/*}
. "$MODDIR/../lib/common.sh"
. "$MODDIR/../lib/paths.sh"
. "$MODDIR/../lib/urls.sh"

log "KEYBOX_INFO" "Start"

KEYBOX_FILE="/data/adb/tricky_store/keybox.xml"
INFO_PATH="$MODDIR/../webroot/json/keybox_info.json"

ensure_dir "$(dirname "$INFO_PATH")"

_installed=false
_source=""
_source_version=""
_text=""
_up_to_date=false
_revoked=false
_softbanned=false
_serial=""
_is_private_val="false"

if [ -f "$KEYBOX_FILE" ]; then
  _installed=true

  _is_private_val=$(cat "$CONFIG_DIR/kb_private.val" 2>/dev/null || echo "false")
  if [ "$_is_private_val" = "true" ]; then
    _source="Private"
    _text="Keybox"
    _up_to_date=true
    log "KEYBOX_INFO" "Private keybox flagged by user"
    if _serial=$(decode_keybox_serial "$KEYBOX_FILE"); then
      if check_google_revocation "$_serial"; then
        _revoked=true
        log "KEYBOX_INFO" "Revoked by Google"
      fi
    fi
  elif _serial=$(decode_keybox_serial "$KEYBOX_FILE"); then
    log "KEYBOX_INFO" "Serial: $_serial"

    _serial_dec=$(printf '%u' "0x$_serial" 2>/dev/null || echo "")

    if check_google_revocation "$_serial"; then
      _revoked=true
      log "KEYBOX_INFO" "Revoked by Google"
    fi

    if check_network; then
      _history_json=$(download "$CATALOG_URL" 2>/dev/null)
      if [ -n "$_history_json" ]; then
        log "KEYBOX_INFO" "Catalog response length: ${#_history_json}"
        _provider=$(cat "$CONFIG_DIR/kb_provider.val" 2>/dev/null || echo "auto")
        if [ "$_provider" = "auto" ]; then
          _provider=$(echo "$_history_json" | grep -o '"working":{[^}]*"source":"[^"]*"' | sed 's/.*"source":"\([^"]*\)".*/\1/')
        fi

        for _s in "$_serial" "$_serial_dec"; do
          [ -z "$_s" ] && continue
          if [ -n "$_provider" ]; then
            _entry=$(echo "$_history_json" | grep -o '{[^}]*"source":"'"$_provider"'"[^}]*"serial":"'"$_s"'"[^}]*}')
          fi
          [ -z "$_entry" ] && _entry=$(echo "$_history_json" | grep -o '{[^}]*"serial":"'"$_s"'"[^}]*}')
          [ -n "$_entry" ] && break
        done
        unset _s

        if [ -n "$_entry" ]; then
          _source=$(echo "$_entry" | grep -o '"source":"[^"]*"' | head -1 | sed 's/"source":"//;s/"//')
          _source_version=$(echo "$_entry" | grep -o '"version":"[^"]*"' | head -1 | sed 's/"version":"//;s/"//')
          _text=$(echo "$_entry" | grep -o '"text":"[^"]*"' | head -1 | sed 's/"text":"//;s/"//')
          [ -z "$_source" ] && _source="unknown"
          [ -z "$_source_version" ] && _source_version="?"
          [ -z "$_text" ] && _text=""

          _softbanned=$(echo "$_entry" | grep -o '"softbanned":true' || echo "false")

          _latest_for_source=$(echo "$_history_json" | grep -o '"'"$_source"'":"[^"]*"' | sed 's/.*":"//;s/"//')
          if [ -n "$_source_version" ] && [ "$_source_version" = "$_latest_for_source" ]; then
            _up_to_date=true
          fi
        else
          log "KEYBOX_INFO" "Not found in catalog"
        fi
      else
        log "KEYBOX_INFO" "No network, skipping catalog"
      fi
    fi
  fi
fi

cat <<EOF > "$INFO_PATH"
{
  "installed": $_installed,
  "source": "$(_escape_json "$_source")",
  "source_version": "$(_escape_json "$_source_version")",
  "text": "$(_escape_json "$_text")",
  "up_to_date": $_up_to_date,
  "revoked": $_revoked,
  "softbanned": $_softbanned,
  "serial": "$(_escape_json "$_serial")",
  "is_private": $_is_private_val
}
EOF

unset _installed _source _source_version _text _up_to_date _revoked _softbanned _serial _serial_dec _history_json _entry _provider _latest_for_source _is_private_val
log "KEYBOX_INFO" "Finish"
exit 0
