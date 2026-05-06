#!/system/bin/sh
set -e
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

if [ -f "$KEYBOX_FILE" ]; then
  _installed=true

  _is_private=$(cat "$CONFIG_DIR/kb_private.val" 2>/dev/null || echo "false")
  if [ "$_is_private" = "true" ]; then
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

    # Check A: Google revocation (independent of catalog)
    if check_google_revocation "$_serial"; then
      _revoked=true
      log "KEYBOX_INFO" "Revoked by Google"
    fi

    # Check B: Catalog identity (source/version/text/up_to_date)
    if check_network; then
      _history_json=$(download "$CATALOG_URL" 2>/dev/null)
      log "KEYBOX_INFO" "History response length: ${#_history_json}"

      if [ -n "$_history_json" ]; then
        _provider=$(cat "$CONFIG_DIR/kb_provider.val" 2>/dev/null || echo "auto")
        if [ "$_provider" = "auto" ]; then
          _provider=$(echo "$_history_json" | grep -o '"working":{[^}]*"source":"[^"]*"' | sed 's/.*"source":"\([^"]*\)".*/\1/')
        fi

        if [ -n "$_provider" ]; then
          _entry=$(echo "$_history_json" | grep -o '{[^}]*"source":"'"$_provider"'"[^}]*"serial":"'"$_serial"'"[^}]*}')
        fi
        if [ -z "$_entry" ]; then
          _entry=$(echo "$_history_json" | grep -o '{[^}]*"serial":"'"$_serial"'"[^}]*}')
        fi

        if [ -n "$_entry" ]; then
          _source=$(echo "$_entry" | grep -o '"source":"[^"]*"' | head -1 | sed 's/"source":"//;s/"//')
          _source_version=$(echo "$_entry" | grep -o '"version":"[^"]*"' | head -1 | sed 's/"version":"//;s/"//')
          _text=$(echo "$_entry" | grep -o '"text":"[^"]*"' | head -1 | sed 's/"text":"//;s/"//')
          [ -z "$_source" ] && _source="unknown"
          [ -z "$_source_version" ] && _source_version="?"
          [ -z "$_text" ] && _text=""
          log "KEYBOX_INFO" "Found: source=$_source version=$_source_version text=$_text"

          _latest_for_source=$(echo "$_history_json" | grep -o '"'"$_source"'":"[^"]*"' | sed 's/.*":"//;s/"//')
          if [ -n "$_source_version" ] && [ "$_source_version" = "$_latest_for_source" ]; then
            _up_to_date=true
          fi
        else
          log "KEYBOX_INFO" "Not found in catalog"
        fi
      fi
    else
      log "KEYBOX_INFO" "Network check failed, skipping catalog"
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
  "revoked": $_revoked
}
EOF

unset _installed _source _source_version _text _up_to_date _revoked _serial _history_json _entry _provider _latest_for_source
log "KEYBOX_INFO" "Finish"
exit 0
