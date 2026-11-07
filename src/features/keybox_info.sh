#!/system/bin/sh
# shellcheck shell=ksh
set -e
MODDIR=${0%/*}
. "$MODDIR/../lib/common.sh"
. "$MODDIR/../lib/constants.sh"

for _ki_arg in "$@"; do
  [ "$_ki_arg" = "--fresh" ] && export KEYBOX_CATALOG_TTL=0 GOOGLE_REVOCATION_TTL=0
done
unset _ki_arg

log_i "KEYBOX_INFO" "Starting keybox info check"

detect_keystore_manager
KEYBOX_FILE="$KSM_KEYBOX"
INFO_PATH="${SPECTER_KEYBOX_INFO:-$MODDIR/../webroot/json/keybox_info.json}"

# --if-needed is used by the action button: reuse fresh info for the keybox
# that is already installed instead of re-parsing the catalog and revocation.
if [ "${1:-}" = "--if-needed" ] &&
   [ -f "$INFO_PATH" ] && [ -f "$KEYBOX_FILE" ] && [ "$INFO_PATH" -nt "$KEYBOX_FILE" ] &&
   grep -q '"installed": true' "$INFO_PATH" &&
   ! grep -q '"revoked": true' "$INFO_PATH" &&
   ! grep -q '"expired": true' "$INFO_PATH" &&
   [ "$(keybox_cert_validity "$KEYBOX_FILE")" = "valid" ] &&
   ! keybox_rkp_expired "$(tr -d '\n' < "$INFO_PATH" 2>/dev/null || true)"; then
  log_i "KEYBOX_INFO" "Keybox info is current, skipping refresh"
  write_webui_state
  exit 0
fi

ensure_dir "$(dirname "$INFO_PATH")"

_installed=false
_source=""
_source_version=""
_text=""
_up_to_date=false
_revoked=false
_softbanned=false
_rkp=false
_expires_at=""
_expired=false
_cert_validity="unknown"
_serial=""
_is_private_val="false"
_checked_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || echo "")
_latest_version=""
_revocation_status=""
_revocation_reason=""
_revocation_source=""
_revocation_checked_at=""
_file_path=""
_file_size="0"
_file_modified=""

_apply_google_revocation() {
  _agr_info=$(google_revocation_info "$1" 2>/dev/null || true)
  [ -n "$_agr_info" ] || return 0
  _agr_status="${_agr_info%%|*}"
  _agr_reason="${_agr_info#*|}"
  [ "$_agr_reason" = "$_agr_info" ] && _agr_reason=""
  _revocation_status="$_agr_status"
  _revocation_reason="$_agr_reason"
  _revocation_source="Google"
  _revocation_checked_at="$_checked_at"
  case "$_agr_status" in
    REVOKED) _revoked=true ;;
    SUSPENDED) _softbanned=true ;;
  esac
  unset _agr_info _agr_status _agr_reason
}

if [ -f "$KEYBOX_FILE" ]; then
  _installed=true
  _cert_validity=$(keybox_cert_validity "$KEYBOX_FILE")
  case "$_cert_validity" in expired|not_yet_valid) _expired=true ;; esac
  _file_path="$KEYBOX_FILE"
  _file_size=$(wc -c < "$KEYBOX_FILE" 2>/dev/null | tr -d ' ' || echo 0)
  _file_modified=$(date -u -r "$KEYBOX_FILE" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || echo "")

  _is_private_val=$(cat "$CONFIG_DIR/val/keybox_private.val" 2>/dev/null || echo "false")
  [ -z "$_is_private_val" ] && _is_private_val="false"
  if [ "$_is_private_val" = "true" ]; then
    _source="Private"
    _text="Keybox"
    _up_to_date=true
    log_d "KEYBOX_INFO" "Private keybox flagged by user"
    if _serial=$(decode_keybox_serial "$KEYBOX_FILE"); then
      _apply_google_revocation "$_serial"
      if [ "$_revoked" = "true" ] || [ "$_softbanned" = "true" ]; then
        log_w "KEYBOX_INFO" "Revocation status: ${_revocation_status:-unknown}"
      fi
    fi
  elif _serial=$(decode_keybox_serial "$KEYBOX_FILE"); then
    log_d "KEYBOX_INFO" "Serial: $_serial"

    _serial_dec=$(printf '%u' "0x$_serial" 2>/dev/null || echo "")

    _apply_google_revocation "$_serial"
    if [ "$_revoked" = "true" ] || [ "$_softbanned" = "true" ]; then
      log_w "KEYBOX_INFO" "Revocation status: ${_revocation_status:-unknown}"
    fi

    if [ "$KSM" = "omk" ] && cmp -s "$OMK_MODULE/keybox.xml" "$KEYBOX_FILE"; then
      _source="OhMyKeymint"
      _text="Default keybox"
    elif keybox_catalog_fresh || check_network; then
      _history_json=$(keybox_catalog 2>/dev/null || true)
      if [ -n "$_history_json" ]; then
        log_d "KEYBOX_INFO" "Catalog response length: ${#_history_json}"
        _provider=$(cat "$CONFIG_DIR/val/keybox_provider.val" 2>/dev/null || echo "auto")
        if [ "$_provider" = "auto" ]; then
          _provider=$(echo "$_history_json" | grep -o '"working":{[^}]*"source":"[^"]*"' | sed 's/.*"source":"\([^"]*\)".*/\1/' || true)
        fi

        for _s in "$_serial" "$_serial_dec"; do
          [ -z "$_s" ] && continue
          if [ -n "$_provider" ]; then
            _entry=$(echo "$_history_json" | grep -o '{[^}]*"source":"'"$_provider"'"[^}]*"serial":"'"$_s"'"[^}]*}' || true)
          fi
          if [ -z "$_entry" ]; then
            _entry=$(echo "$_history_json" | grep -o '{[^}]*"serial":"'"$_s"'"[^}]*}' || true)
          fi
          [ -n "$_entry" ] && break
        done
        unset _s

        if [ -n "$_entry" ]; then
          _source=$(echo "$_entry" | grep -o '"source":"[^"]*"' | head -1 | sed 's/"source":"//;s/"//' || true)
          _source_version=$(echo "$_entry" | grep -o '"version":"[^"]*"' | head -1 | sed 's/"version":"//;s/"//' || true)
          _text=$(echo "$_entry" | grep -o '"text":"[^"]*"' | head -1 | sed 's/"text":"//;s/"//' || true)
          [ -z "$_source" ] && _source="unknown"
          [ -z "$_source_version" ] && _source_version="?"
          [ -z "$_text" ] && _text="$_source_version"

          _softbanned=false
          echo "$_entry" | grep -q '"softbanned":true' 2>/dev/null && _softbanned=true || true
          echo "$_entry" | grep -q '"revoked":true' 2>/dev/null && _revoked=true || true

          _cat_rev_status=$(printf '%s' "$_entry" | sed -n 's/.*"revocation_status"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' || true)
          if [ -n "$_cat_rev_status" ]; then
            _revocation_status="$_cat_rev_status"
            _revocation_reason=$(printf '%s' "$_entry" | sed -n 's/.*"revocation_reason"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' || true)
            _revocation_checked_at=$(printf '%s' "$_entry" | sed -n 's/.*"revocation_checked_at"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' || true)
            _revocation_source="Specter catalog"
            [ "$_cat_rev_status" = "REVOKED" ] && _revoked=true
            [ "$_cat_rev_status" = "SUSPENDED" ] && _softbanned=true
          elif [ "$_revoked" = "true" ] && [ -z "$_revocation_source" ]; then
            _revocation_source="Specter catalog"
          fi
          unset _cat_rev_status

          _rkp=false
          echo "$_entry" | grep -Eq '"rkp"[[:space:]]*:[[:space:]]*true' 2>/dev/null && _rkp=true || true
          _expires_at=$(echo "$_entry" | sed -n 's/.*"expires_at"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' || true)
          if [ "$_rkp" = "true" ] && keybox_rkp_expired "$_entry"; then
            _expired=true
          fi

          _latest_for_source=$(echo "$_history_json" | grep -o '"'"$_source"'":"[^"]*"' | sed 's/.*":"//;s/"//' || true)
          _latest_version="$_latest_for_source"
          if [ -n "$_source_version" ] && [ "$_source_version" = "$_latest_for_source" ]; then
            _up_to_date=true
          fi
        else
          log_d "KEYBOX_INFO" "Not found in catalog"
        fi
      else
        log_w "KEYBOX_INFO" "No network, skipping catalog"
      fi
    fi
  fi
fi

# Escape only once per field; command substitution would fork a shell per
# value and dominates the runtime on-device.
_esc_source=$_source; _esc_source=${_esc_source//\\/\\\\}; _esc_source=${_esc_source//\"/\\\"}
_esc_source_version=$_source_version; _esc_source_version=${_esc_source_version//\\/\\\\}; _esc_source_version=${_esc_source_version//\"/\\\"}
_esc_text=$_text; _esc_text=${_esc_text//\\/\\\\}; _esc_text=${_esc_text//\"/\\\"}
_esc_latest=$_latest_version; _esc_latest=${_esc_latest//\\/\\\\}; _esc_latest=${_esc_latest//\"/\\\"}
_esc_serial=$_serial; _esc_serial=${_esc_serial//\\/\\\\}; _esc_serial=${_esc_serial//\"/\\\"}
_esc_checked=$_checked_at; _esc_checked=${_esc_checked//\\/\\\\}; _esc_checked=${_esc_checked//\"/\\\"}
_esc_rev_status=$_revocation_status; _esc_rev_status=${_esc_rev_status//\\/\\\\}; _esc_rev_status=${_esc_rev_status//\"/\\\"}
_esc_rev_reason=$_revocation_reason; _esc_rev_reason=${_esc_rev_reason//\\/\\\\}; _esc_rev_reason=${_esc_rev_reason//\"/\\\"}
_esc_rev_source=$_revocation_source; _esc_rev_source=${_esc_rev_source//\\/\\\\}; _esc_rev_source=${_esc_rev_source//\"/\\\"}
_esc_rev_checked=$_revocation_checked_at; _esc_rev_checked=${_esc_rev_checked//\\/\\\\}; _esc_rev_checked=${_esc_rev_checked//\"/\\\"}
_esc_file_path=$_file_path; _esc_file_path=${_esc_file_path//\\/\\\\}; _esc_file_path=${_esc_file_path//\"/\\\"}
_esc_file_modified=$_file_modified; _esc_file_modified=${_esc_file_modified//\\/\\\\}; _esc_file_modified=${_esc_file_modified//\"/\\\"}

_expires_json="null"
[ -n "$_expires_at" ] && {
  _esc_expires=$_expires_at; _esc_expires=${_esc_expires//\\/\\\\}; _esc_expires=${_esc_expires//\"/\\\"}
  _expires_json="\"$_esc_expires\""
}

cat <<EOF > "$INFO_PATH"
{
  "installed": $_installed,
  "source": "$_esc_source",
  "source_version": "$_esc_source_version",
  "text": "$_esc_text",
  "up_to_date": $_up_to_date,
  "latest_version": "$_esc_latest",
  "revoked": $_revoked,
  "softbanned": $_softbanned,
  "rkp": $_rkp,
  "expires_at": $_expires_json,
  "expired": $_expired,
  "cert_validity": "$_cert_validity",
  "serial": "$_esc_serial",
  "is_private": $_is_private_val,
  "checked_at": "$_esc_checked",
  "revocation_status": "$_esc_rev_status",
  "revocation_reason": "$_esc_rev_reason",
  "revocation_source": "$_esc_rev_source",
  "revocation_checked_at": "$_esc_rev_checked",
  "file_path": "$_esc_file_path",
  "file_size": ${_file_size:-0},
  "file_modified": "$_esc_file_modified"
}
EOF

if [ "$_installed" = "true" ]; then
  if [ "$_revoked" = "true" ]; then
    log_w "KEYBOX_INFO" "Keybox is revoked (${_revocation_source:-unknown}${_revocation_reason:+: $_revocation_reason})"
  elif [ "$_expired" = "true" ]; then
    log_w "KEYBOX_INFO" "Keybox is expired (${_expires_at:-no X.509 expiry date})"
  elif [ "$_up_to_date" = "true" ]; then
    log_i "KEYBOX_INFO" "Keybox from $_source is valid and up to date"
  elif [ -n "$_source" ]; then
    log_i "KEYBOX_INFO" "Keybox from $_source: version $_source_version"
  else
    log_i "KEYBOX_INFO" "Keybox is installed"
  fi
fi
unset _installed _source _source_version _text _up_to_date _latest_version _revoked _softbanned _rkp _expires_at _expires_json _expired _serial _serial_dec _history_json _entry _provider _latest_for_source _is_private_val _checked_at _revocation_status _revocation_reason _revocation_source _revocation_checked_at _file_path _file_size _file_modified _cat_rev_status _esc_source _esc_source_version _esc_text _esc_latest _esc_serial _esc_checked _esc_rev_status _esc_rev_reason _esc_rev_source _esc_rev_checked _esc_file_path _esc_file_modified _esc_expires
log_i "KEYBOX_INFO" "Keybox info check complete"
write_webui_state
exit 0
