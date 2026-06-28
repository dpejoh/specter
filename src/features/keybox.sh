#!/system/bin/sh
set -e
MODDIR=${0%/*}
. "$MODDIR/../lib/common.sh"
. "$MODDIR/../lib/constants.sh"

log_d "KEYBOX" "Starting keybox fetch/install"

check_network || { log_e "KEYBOX" "No internet connection"; exit 1; }

[ -d "$TRICKY_DIR" ] || die "Tricky Store data directory not found"

DECODE_FILE="/data/local/tmp/keybox_decode.$$"
TEMP_FILE="/data/local/tmp/keybox.tmp.$$"
trap 'rm -f "$DECODE_FILE" "$TEMP_FILE" 2>/dev/null' EXIT


_custom_type=$(cat "$CONFIG_DIR/kb_custom_type.val" 2>/dev/null || echo "")
_custom_value=$(cat "$CONFIG_DIR/kb_custom_value.val" 2>/dev/null || echo "")

_clear_custom() {
  printf '%s' "" > "$CONFIG_DIR/kb_custom_type.val" 2>/dev/null || true
  printf '%s' "" > "$CONFIG_DIR/kb_custom_value.val" 2>/dev/null || true
}

if [ -n "$_custom_type" ] && [ -n "$_custom_value" ]; then
  log_i "KEYBOX" "Using custom keybox: $_custom_type ($_custom_value)"
  case "$_custom_type" in
    file|path)
      if [ -f "$_custom_value" ]; then
        cp "$_custom_value" "$TARGET_FILE" || die "Failed to copy custom keybox"
        log_i "KEYBOX" "Custom keybox installed from $_custom_value"
        _clear_custom
        exit 0
      fi
      log_e "KEYBOX" "Custom keybox file not found: $_custom_value"
      _clear_custom
      exit 1
      ;;
    url)
      log_i "KEYBOX" "Downloading custom keybox from URL..."
download "$_custom_value" "$TEMP_FILE" || {
  log_e "KEYBOX" "Custom URL download failed"
  _clear_custom
  exit 1
}
if decode_keybox_blob "$TEMP_FILE" "$DECODE_FILE" 2>/dev/null && [ -s "$DECODE_FILE" ]; then
        mv "$DECODE_FILE" "$TARGET_FILE" || die "Failed to move decoded keybox"
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

_provider=$(cat "$CONFIG_DIR/kb_provider.val" 2>/dev/null || echo "auto")

log_i "KEYBOX" "Fetching available keyboxes..."
_history=$(download "$CATALOG_URL")

if [ -z "$_history" ]; then
  log_w "KEYBOX" "Catalog fetch failed, trying fallback keyboxes..."
  for _pair in $FALLBACK_KEYBOXES; do
    _url="${KEYBOX_URL}/${_pair}"
    _tmp="/data/local/tmp/kb_fb_$$_$(echo "$_pair" | tr '/' '_')"
    if download "$_url" "$_tmp" && [ -s "$_tmp" ]; then
      mv "$_tmp" "$TEMP_FILE"
      _DL_SOURCE="fallback"
      _DL_VER="$_pair"
      log_i "KEYBOX" "Fallback selected: $_pair"
      break
    fi
    rm -f "$_tmp"
  done
  if [ -z "$_DL_SOURCE" ]; then
    log_e "KEYBOX" "No fallback keybox found"
    exit 1
  fi
else
  if [ "$_provider" = "auto" ]; then
    _wk_raw=$(echo "$_history" | grep -o '"workingEntries":\[[^]]*\]' | sed 's/"workingEntries":\[//' | sed 's/\]$//')
    if [ -n "$_wk_raw" ]; then
      _wk_count=$(echo "$_wk_raw" | grep -o '{"source":"[^"]*","version":"[^"]*","text":"[^"]*"}' | wc -l)
      if [ "$_wk_count" -gt 0 ]; then
        _rand_hex=$(hexdump -n 4 -e '4/4 "%08X"' /dev/urandom 2>/dev/null) && _random_index=$(( 0x${_rand_hex} % _wk_count )) || _random_index=$(( $$ % _wk_count ))
        _wk_entry=$(echo "$_wk_raw" | grep -o '{"source":"[^"]*","version":"[^"]*","text":"[^"]*"}' | sed -n "$((_random_index + 1))p")
        _DL_SOURCE=$(echo "$_wk_entry" | sed 's/.*"source":"\([^"]*\)".*/\1/')
        _DL_VER=$(echo "$_wk_entry" | sed 's/.*"version":"\([^"]*\)".*/\1/')
        _DL_TEXT=$(echo "$_wk_entry" | sed 's/.*"text":"\([^"]*\)".*/\1/')
        [ -z "$_DL_TEXT" ] && _DL_TEXT="$_DL_VER"
        log_i "KEYBOX" "Randomly selected: $_DL_SOURCE $_DL_TEXT (entry $_random_index of $_wk_count)"
      else
        _working_source=$(echo "$_history" | grep -o '"working":{[^}]*"source":"[^"]*"' | sed 's/.*"source":"\([^"]*\)".*/\1/')
        _working_version=$(echo "$_history" | grep -o '"working":{[^}]*"version":"[^"]*"' | sed 's/.*"version":"\([^"]*\)".*/\1/')
        [ -n "$_working_source" ] && [ -n "$_working_version" ] || die "No working keybox available (all revoked?)"
        _DL_SOURCE="$_working_source"
        _DL_VER="$_working_version"
        _DL_TEXT=$(echo "$_history" | grep -o '"source":"'"$_DL_SOURCE"'"[^}]*"version":"'"$_DL_VER"'"[^}]*"text":"[^"]*"' | sed 's/.*"text":"\([^"]*\)".*/\1/')
        [ -z "$_DL_TEXT" ] && _DL_TEXT="$_DL_VER"
        log_i "KEYBOX" "Auto-selected: $_DL_SOURCE $_DL_TEXT"
      fi
    else
      _working_source=$(echo "$_history" | grep -o '"working":{[^}]*"source":"[^"]*"' | sed 's/.*"source":"\([^"]*\)".*/\1/')
      _working_version=$(echo "$_history" | grep -o '"working":{[^}]*"version":"[^"]*"' | sed 's/.*"version":"\([^"]*\)".*/\1/')
      [ -n "$_working_source" ] && [ -n "$_working_version" ] || die "No working keybox available (all revoked?)"
      _DL_SOURCE="$_working_source"
      _DL_VER="$_working_version"
      _DL_TEXT=$(echo "$_history" | grep -o '"source":"'"$_DL_SOURCE"'"[^}]*"version":"'"$_DL_VER"'"[^}]*"text":"[^"]*"' | sed 's/.*"text":"\([^"]*\)".*/\1/')
      [ -z "$_DL_TEXT" ] && _DL_TEXT="$_DL_VER"
      log_i "KEYBOX" "Auto-selected: $_DL_SOURCE $_DL_TEXT"
    fi
  else
    _DL_SOURCE="$_provider"
    _DL_VER=$(echo "$_history" | grep -o '"source":"'"$_provider"'"[^}]*"version":"[^"]*"' | sed 's/.*"version":"\([^"]*\)".*/\1/' | sort -rn | head -1)
    [ -n "$_DL_VER" ] || die "No versions found for provider '$_provider'"
    _DL_TEXT=$(echo "$_history" | grep -o '"source":"'"$_DL_SOURCE"'"[^}]*"version":"'"$_DL_VER"'"[^}]*"text":"[^"]*"' | sed 's/.*"text":"\([^"]*\)".*/\1/')
    [ -z "$_DL_TEXT" ] && _DL_TEXT="$_DL_VER"
    log_i "KEYBOX" "Selected provider: $_DL_SOURCE $_DL_TEXT"
  fi
fi

_DL_URL="${KEYBOX_URL}/${_DL_SOURCE}/${_DL_VER}"
[ "$_DL_SOURCE" = "fallback" ] && _DL_URL="${KEYBOX_URL}/${_DL_VER}"

log_i "KEYBOX" "Downloading keybox..."
download "$_DL_URL" "$TEMP_FILE" || {
  log_e "KEYBOX" "Download failed"
  exit 1
}

log_d "KEYBOX" "Downloaded $(wc -c < "$TEMP_FILE" 2>/dev/null || echo "?") bytes"

if ! decode_keybox_blob "$TEMP_FILE" "$DECODE_FILE" 2>/dev/null; then
  log_e "KEYBOX" "Base64 decode failed"
  exit 1
fi

_dk_size=$(wc -c < "$DECODE_FILE" 2>/dev/null || echo "0")
log_d "KEYBOX" "Decoded $_dk_size bytes"
[ "$_dk_size" -gt 0 ] || { log_e "KEYBOX" "Decoded keybox is empty"; exit 1; }
unset _dk_size

_has_ecdsa=$(sed -n '/<Key algorithm="ecdsa">/,/<\/Key>/p' "$DECODE_FILE" 2>/dev/null)
_has_rsa=$(sed -n '/<Key algorithm="rsa">/,/<\/Key>/p' "$DECODE_FILE" 2>/dev/null)
_has_id=$(( $(grep -c '<serial>' "$DECODE_FILE" 2>/dev/null || true) + $(grep -c 'DeviceID' "$DECODE_FILE" 2>/dev/null || true) ))

if [ -z "$_has_ecdsa" ] && [ -z "$_has_rsa" ]; then
  log_w "KEYBOX" "No ECDSA key, no RSA key in decoded file"
  log_d "KEYBOX" "First 100 bytes: $(head -c 100 "$DECODE_FILE" 2>/dev/null | tr '\n' ' ' | tr '\0' '.')"
  log_e "KEYBOX" "No valid attestation keys found in downloaded keybox"
  exit 1
fi
[ "$_has_id" -eq 0 ] && { log_e "KEYBOX" "No identifier field found (serial/DeviceID)"; exit 1; }
[ -n "$_has_ecdsa" ] || log_w "KEYBOX" "Missing ECDSA key block"
[ -n "$_has_rsa" ] || log_w "KEYBOX" "Missing RSA key block"

_serial=$(decode_keybox_serial "$DECODE_FILE" 2>/dev/null || echo "")
if [ -n "$_serial" ]; then
  log_i "KEYBOX" "Checking Google revocation for serial $_serial"
  if check_google_revocation "$_serial"; then
    log_w "KEYBOX" "Keybox is revoked by Google (installing anyway)"
  fi
  log_i "KEYBOX" "Keybox is not revoked"
else
  log_w "KEYBOX" "Could not extract serial for revocation check"
fi

_install_teesimulator() {
  log_d "KEYBOX" "TEE Simulator detected, generating locked.xml format"

  _serial=$(decode_keybox_serial "$DECODE_FILE" 2>/dev/null || echo "unknown")
  _random=$(hexdump -n 4 -e '4/4 "%08X"' /dev/urandom 2>/dev/null || echo "$$")
  _ecdsa_block=$(sed -n '/<Key algorithm="ecdsa">/,/<\/Key>/p' "$DECODE_FILE" 2>/dev/null)
  _rsa_block=$(sed -n '/<Key algorithm="rsa">/,/<\/Key>/p' "$DECODE_FILE" 2>/dev/null)

  # Handle backup of existing locked.xml
  if [ -f "$LOCKED_FILE" ] && [ ! -f "$LOCKED_BACKUP" ]; then
    cp "$LOCKED_FILE" "$LOCKED_BACKUP"
    log_i "KEYBOX" "Created backup of existing locked.xml"
  fi

  if [ -z "$_ecdsa_block" ]; then
    log_d "KEYBOX" "No ECDSA key — writing placeholder locked.xml"
    {
      echo '<?xml version="1.0" encoding="UTF-8"?>'
      echo '<AndroidAttestation>'
      echo '<NumberOfKeyboxes>1</NumberOfKeyboxes>'
      echo '<Keybox>'
      echo '</Keybox>'
      echo '</AndroidAttestation>'
    } > "$LOCKED_FILE"
    return
  fi

  {
    echo '<?xml version="1.0" encoding="UTF-8"?>'
    echo '<AndroidAttestation>'
    echo '<NumberOfKeyboxes>1</NumberOfKeyboxes>'
    echo "<Keybox DeviceID=\"$_serial\">"
    printf '%s\n' "$_ecdsa_block"
    echo "  <serial>${_serial}_${_random}</serial>"
    [ -n "$_rsa_block" ] && printf '%s\n' "$_rsa_block"
    echo '</Keybox>'
    echo '</AndroidAttestation>'
  } > "$LOCKED_FILE"
  log_d "KEYBOX" "Locked XML written to $LOCKED_FILE"

  unset _serial _random _ecdsa_block _rsa_block
}

_clear_keybox_id() {
  printf '%s' "" > "$CONFIG_DIR/kb_private.val" 2>/dev/null || true
}

if _is_teesimulator; then
    _install_teesimulator
    _clear_keybox_id
    cp "$DECODE_FILE" "$TARGET_FILE" 2>/dev/null || true
    log_i "KEYBOX" "Keybox install complete"
    exit 0
fi

mv "$DECODE_FILE" "$TARGET_FILE" || die "Failed to move decoded keybox to $TARGET_FILE"
_clear_keybox_id
log_i "KEYBOX" "Keybox installed successfully"
log_i "KEYBOX" "Keybox install complete"
exit 0
