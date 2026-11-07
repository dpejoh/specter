#!/system/bin/sh
# shellcheck shell=ksh
set -e
MODDIR=${0%/*}
. "$MODDIR/../lib/common.sh"
. "$MODDIR/../lib/constants.sh"

log_d "KEYBOX" "Starting keybox fetch/install"

# --if-needed is used by the action button: keep a healthy installed keybox
# instead of rotating it on every run. Manual installs run without the flag.
_if_needed=0
case "${1:-}" in --if-needed) _if_needed=1 ;; esac

detect_keystore_manager
ksm_available || die "No keystore manager (Tricky Store / TEESimulator / OhMyKeymint) data directory found"

DECODE_FILE="/data/local/tmp/keybox_decode.$$"
TEMP_FILE="/data/local/tmp/keybox.tmp.$$"
trap 'rm -f "$DECODE_FILE" "$TEMP_FILE" 2>/dev/null' EXIT


_custom_type=$(cat "$CONFIG_DIR/val/keybox_custom_type.val" 2>/dev/null || echo "")
_custom_value=$(cat "$CONFIG_DIR/val/keybox_custom_value.val" 2>/dev/null || echo "")
_select_source=$(cat "$CONFIG_DIR/val/keybox_select_source.val" 2>/dev/null || echo "")
_select_version=$(cat "$CONFIG_DIR/val/keybox_select_version.val" 2>/dev/null || echo "")

_clear_custom() {
  printf '%s' "" > "$CONFIG_DIR/val/keybox_custom_type.val" 2>/dev/null || true
  printf '%s' "" > "$CONFIG_DIR/val/keybox_custom_value.val" 2>/dev/null || true
}

_clear_selection() {
  printf '%s' "" > "$CONFIG_DIR/val/keybox_select_source.val" 2>/dev/null || true
  printf '%s' "" > "$CONFIG_DIR/val/keybox_select_version.val" 2>/dev/null || true
}

# An explicit selection always wins over the action button's healthy-keybox skip.
if [ -n "$_select_source" ] && [ -n "$_select_version" ]; then
  _if_needed=0
fi

if [ -n "$_custom_type" ] && [ -n "$_custom_value" ]; then
  log_i "KEYBOX" "Using custom keybox: $_custom_type ($_custom_value)"
  case "$_custom_type" in
    file|path)
      if [ -f "$_custom_value" ]; then
        ksm_install_keybox "$_custom_value" copy || die "Failed to copy custom keybox"
        log_i "KEYBOX" "Custom keybox installed from $_custom_value"
        _clear_custom
        exit 0
      fi
      log_e "KEYBOX" "Custom keybox file not found: $_custom_value"
      _clear_custom
      exit 1
      ;;
    url)
      check_network || { log_e "KEYBOX" "No internet connection"; _clear_custom; exit 1; }
      log_i "KEYBOX" "Downloading custom keybox from URL..."
download "$_custom_value" "$TEMP_FILE" || {
  log_e "KEYBOX" "Custom URL download failed"
  _clear_custom
  exit 1
}
if decode_keybox_blob "$TEMP_FILE" "$DECODE_FILE" 2>/dev/null && [ -s "$DECODE_FILE" ]; then
        ksm_install_keybox "$DECODE_FILE" || die "Failed to move decoded keybox"
        log_i "KEYBOX" "Custom keybox installed from URL"
        _clear_custom
        exit 0
      fi
      log_e "KEYBOX" "Custom keybox decode failed, not a valid base64 blob"
      _clear_custom
      exit 1
      ;;
  esac
fi

if [ "$_if_needed" = "1" ]; then
  _ki_info="${SPECTER_KEYBOX_INFO:-$MODDIR/../webroot/json/keybox_info.json}"
  _ki_json=""
  [ -f "$_ki_info" ] && _ki_json=$(tr -d '\n' < "$_ki_info" 2>/dev/null || true)
  if [ -f "$KSM_KEYBOX" ] && [ -f "$_ki_info" ] && [ "$_ki_info" -nt "$KSM_KEYBOX" ] &&
     grep -q '"installed": true' "$_ki_info" &&
     ! grep -q '"revoked": true' "$_ki_info" &&
     ! grep -q '"softbanned": true' "$_ki_info" &&
     ! grep -q '"expired": true' "$_ki_info" &&
     [ "$(keybox_cert_validity "$KSM_KEYBOX")" = "valid" ] &&
     ! keybox_rkp_expired "$_ki_json"; then
    log_i "KEYBOX" "Current keybox is healthy, skipping refresh"
    exit 0
  fi
  unset _ki_info _ki_json
fi

_try_keybox_url() {
  _kt_url=$1
  _kt_fallback=${2:-}
  rm -f "$TEMP_FILE" "$DECODE_FILE"
  log_i "KEYBOX" "Downloading keybox..."
  if ! download "$_kt_url" "$TEMP_FILE"; then
    if [ -n "$_kt_fallback" ] && [ "$_kt_fallback" != "$_kt_url" ]; then
      log_w "KEYBOX" "Primary download failed, trying fallback..."
      download "$_kt_fallback" "$TEMP_FILE" || { log_e "KEYBOX" "Download failed"; return 1; }
    else
      log_e "KEYBOX" "Download failed"
      return 1
    fi
  fi
  log_d "KEYBOX" "Downloaded $(wc -c < "$TEMP_FILE" 2>/dev/null || echo "?") bytes"
  if ! decode_keybox_blob "$TEMP_FILE" "$DECODE_FILE" 2>/dev/null; then
    log_e "KEYBOX" "Base64 decode failed"
    return 1
  fi
  _dk_size=$(wc -c < "$DECODE_FILE" 2>/dev/null || echo "0")
  log_d "KEYBOX" "Decoded $_dk_size bytes"
  [ "$_dk_size" -gt 0 ] || { log_e "KEYBOX" "Decoded keybox is empty"; return 1; }
  unset _dk_size

  _has_ecdsa=$(sed -n '/<Key algorithm="ecdsa">/,/<\/Key>/p' "$DECODE_FILE" 2>/dev/null)
  _has_rsa=$(sed -n '/<Key algorithm="rsa">/,/<\/Key>/p' "$DECODE_FILE" 2>/dev/null)
  _has_id=$(( $(grep -c '<serial>' "$DECODE_FILE" 2>/dev/null || true) + $(grep -c 'DeviceID' "$DECODE_FILE" 2>/dev/null || true) ))

  if [ -z "$_has_ecdsa" ] && [ -z "$_has_rsa" ]; then
    log_w "KEYBOX" "No ECDSA key, no RSA key in decoded file"
    log_d "KEYBOX" "First 100 bytes: $(head -c 100 "$DECODE_FILE" 2>/dev/null | tr '\n' ' ' | tr '\0' '.')"
    log_e "KEYBOX" "No valid attestation keys found in downloaded keybox"
    return 1
  fi
  [ "$_has_id" -eq 0 ] && { log_e "KEYBOX" "No identifier field found (serial/DeviceID)"; return 1; }
  [ -n "$_has_ecdsa" ] || log_w "KEYBOX" "Missing ECDSA key block"
  [ -n "$_has_rsa" ] || log_w "KEYBOX" "Missing RSA key block"

  _cert_validity=$(keybox_cert_validity "$DECODE_FILE")
  if [ "$_cert_validity" != "valid" ]; then
    log_w "KEYBOX" "Keybox certificate validity: $_cert_validity; skipping"
    return 1
  fi

  _serial=$(decode_keybox_serial "$DECODE_FILE" 2>/dev/null || echo "")
  if [ -n "$_serial" ]; then
    log_i "KEYBOX" "Checking Google revocation for serial $_serial"
    if check_google_revocation "$_serial"; then
      log_w "KEYBOX" "Keybox is revoked by Google"
      return 1
    fi
    log_i "KEYBOX" "Keybox is not revoked"
  else
    log_w "KEYBOX" "Could not extract serial for revocation check"
  fi

  ksm_install_keybox "$DECODE_FILE" || die "Failed to move decoded keybox to $KSM_KEYBOX"
  printf '%s' "" > "$CONFIG_DIR/val/keybox_private.val" 2>/dev/null || true
  log_i "KEYBOX" "Keybox installed successfully"
  log_i "KEYBOX" "Keybox install complete"
  exit 0
}

check_network || { log_e "KEYBOX" "No internet connection"; exit 1; }

_provider=$(cat "$CONFIG_DIR/val/keybox_provider.val" 2>/dev/null || echo "auto")

log_i "KEYBOX" "Fetching available keyboxes..."
_history=$(keybox_catalog || true)

if [ -z "$_history" ]; then
  if [ -n "$_select_source" ] && [ -n "$_select_version" ]; then
    _clear_selection
    die "Selected keybox catalog unavailable"
  fi
  log_w "KEYBOX" "Catalog fetch failed, trying fallback keyboxes..."
  for _pair in $FALLBACK_KEYBOXES; do
    log_i "KEYBOX" "Fallback selected: $_pair"
    _try_keybox_url "${KEYBOX_URL}/${_pair}" "${KEYBOX_URL_FALLBACK}/${_pair}" || true
  done
  die "No working keybox available (all revoked/expired?)"
fi

if [ -n "$_select_source" ] && [ -n "$_select_version" ]; then
  _sel_entry=$(keybox_select_entry "$_history" "$_select_source" "$_select_version")
  if [ -z "$_sel_entry" ]; then
    _clear_selection
    die "Selected keybox is no longer active"
  fi
  _sel_text=$(printf '%s' "$_sel_entry" | sed -n 's/.*"text":"\([^"]*\)".*/\1/p')
  [ -n "$_sel_text" ] || _sel_text=$_select_version
  log_i "KEYBOX" "Installing selected keybox: $_select_source $_sel_text"
  _clear_selection
  _try_keybox_url "${KEYBOX_URL}/${_select_source}/${_select_version}" "${KEYBOX_URL_FALLBACK}/${_select_source}/${_select_version}" || die "Failed to install selected keybox"
  exit 0
fi

if [ "$_provider" = "auto" ]; then
  _objs=$(printf '%s' "$_history" | grep -o '"entries":\[[^]]*\]' | grep -o '{[^}]*}' | grep -v '"revoked":true' || true)
else
  _objs=$(printf '%s' "$_history" | grep -o '"entries":\[[^]]*\]' | grep -o '{[^}]*"source":"'"$_provider"'"[^}]*}' | grep -v '"revoked":true' || true)
fi
_objs=$(printf '%s\n' "$_objs" | keybox_filter_expired_rkp | keybox_dedupe_rkp_freshest)
_pool=$(printf '%s\n' "$_objs" | keybox_prefer_active "$_history")
if [ "$_provider" != "auto" ]; then
  _sorted=""
  while IFS= read -r _line || [ -n "$_line" ]; do
    [ -n "$_line" ] || continue
    _ver=$(printf '%s' "$_line" | sed -n 's/.*"version":"\([^"]*\)".*/\1/p')
    _sorted="${_sorted}${_ver} ${_line}
"
  done <<EOF
$_pool
EOF
  _pool=$(printf '%s\n' "$_sorted" | sort -rn | sed 's/^[^ ]* //')
fi
_count=$(printf '%s\n' "$_pool" | grep -c '"source":' || true)
[ "${_count:-0}" -gt 0 ] || die "No working keybox available (all revoked/expired?)"

_start=0
if [ "$_provider" = "auto" ] && [ "$_count" -gt 1 ]; then
  _rand_hex=$(hexdump -n 4 -e '4/4 "%08X"' /dev/urandom 2>/dev/null) && _start=$(( 0x${_rand_hex} % _count )) || _start=$(( $$ % _count ))
fi

_n=0
while [ "$_n" -lt "$_count" ]; do
  _pos=$(( (_start + _n) % _count + 1 ))
  _entry=$(printf '%s\n' "$_pool" | sed -n "${_pos}p")
  _src=$(printf '%s' "$_entry" | sed -n 's/.*"source":"\([^"]*\)".*/\1/p')
  _ver=$(printf '%s' "$_entry" | sed -n 's/.*"version":"\([^"]*\)".*/\1/p')
  _text=$(printf '%s' "$_entry" | sed -n 's/.*"text":"\([^"]*\)".*/\1/p')
  [ -n "$_text" ] || _text=$_ver
  if [ "$_n" -eq 0 ] && [ "$_provider" != "auto" ]; then
    log_i "KEYBOX" "Selected provider: $_src $_text"
  elif [ "$_n" -eq 0 ]; then
    log_i "KEYBOX" "Randomly selected: $_src $_text (entry $_pos of $_count)"
  else
    log_i "KEYBOX" "Trying next: $_src $_text (entry $_pos of $_count)"
  fi
  _try_keybox_url "${KEYBOX_URL}/${_src}/${_ver}" "${KEYBOX_URL_FALLBACK}/${_src}/${_ver}" || true
  _n=$((_n + 1))
done

die "No working keybox available (all revoked?)"
