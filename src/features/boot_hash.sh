#!/system/bin/sh
set -e
MODDIR=${0%/*}
. "$MODDIR/../lib/common.sh"
. "$MODDIR/../lib/constants.sh"

_is_valid_hash() {
  case "$1" in *[!0]*) ;; *) return 1 ;; esac
  case "$1" in *[!0-9a-fA-F]*) return 1 ;; esac
  [ "${#1}" -eq 64 ] || return 1
  return 0
}

_hash_file="$SPECTER_DIR/boot_hash"
_dex="${SPECTER_DEX:-$MODDIR/../deps/classes.dex}"

case "${1:-}" in
  --get)
    _prop=$(resetprop ro.boot.vbmeta.digest 2>/dev/null || true)
    _prop=$(printf '%s' "$_prop" | tr -d ' \r\n' | tr '[:upper:]' '[:lower:]')
    if _is_valid_hash "$_prop"; then
      printf '%s\n' "$_prop"
      exit 0
    fi
    if [ -f "$_hash_file" ]; then
      _cached=$(cat "$_hash_file" 2>/dev/null | tr -d ' \r\n' | tr '[:upper:]' '[:lower:]')
      if _is_valid_hash "$_cached"; then
        printf '%s\n' "$_cached"
        exit 0
      fi
    fi
    exit 1
    ;;
  --get-cache)
    if [ -f "$_hash_file" ]; then
      _cached=$(cat "$_hash_file" 2>/dev/null | tr -d ' \r\n' | tr '[:upper:]' '[:lower:]')
      if _is_valid_hash "$_cached"; then
        printf '%s\n' "$_cached"
        exit 0
      fi
    fi
    exit 1
    ;;
  --clear-cache)
    rm -f "$_hash_file"
    log_i "BOOT_HASH" "Boot hash cache removed"
    exit 0
    ;;
  --set)
    _val=$(printf '%s' "${2:-}" | tr -d ' \r\n' | tr '[:upper:]' '[:lower:]')
    if [ -n "$_val" ]; then
      _is_valid_hash "$_val" || die "Invalid boot hash (must be 64 hex characters)"
      cfg_set "custom_boot_hash" "$_val"
      sp_force "ro.boot.vbmeta.digest" "$_val"
      log_i "BOOT_HASH" "Custom boot hash set: $_val"
    else
      cfg_set "custom_boot_hash" ""
      log_i "BOOT_HASH" "Custom boot hash cleared"
    fi
    exit 0
    ;;
esac

if [ "$(cfg_get toggle_boot_hash 1)" = "0" ]; then
  log_i "BOOT_HASH" "Boot hash resolution disabled by toggle, skipping"
  exit 0
fi

log_i "BOOT_HASH" "Starting boot hash resolution"

_force_refresh=0
case "${1:-}" in --refresh|-f) _force_refresh=1 ;; esac

_winner=""
_source=""

# Priority 0: Custom boot hash override
_custom=$(cfg_get custom_boot_hash "")
_custom=$(printf '%s' "$_custom" | tr -d ' \r\n' | tr '[:upper:]' '[:lower:]')
if _is_valid_hash "$_custom"; then
  _winner="$_custom"
  _source="custom"
fi

# Priority 1: Specter persistent cache (0ms fast path for boot)
if [ -z "$_winner" ] && [ "$_force_refresh" = "0" ] && [ -f "$_hash_file" ]; then
  _cached=$(cat "$_hash_file" 2>/dev/null | tr -d ' \r\n' | tr '[:upper:]' '[:lower:]')
  if _is_valid_hash "$_cached"; then
    _winner="$_cached"
    _source="cache"
  fi
fi

# Priority 2: Direct TEE attestation probe (KeyStore RootOfTrust)
if [ -z "$_winner" ] && [ -f "$_dex" ]; then
  _out=$(CLASSPATH="$_dex" app_process / com.dpejoh.specter.Main 2>/dev/null || true)
  _out=$(printf '%s' "$_out" | tr -d ' \r\n' | tr '[:upper:]' '[:lower:]')
  if _is_valid_hash "$_out"; then
    _winner="$_out"
    _source="TEE attestation"
  fi
fi

# Priority 3: Existing bootloader / system property
if [ -z "$_winner" ]; then
  _cur_prop=$(resetprop ro.boot.vbmeta.digest 2>/dev/null || true)
  _cur_prop=$(printf '%s' "$_cur_prop" | tr -d ' \r\n' | tr '[:upper:]' '[:lower:]')
  if _is_valid_hash "$_cur_prop"; then
    _winner="$_cur_prop"
    _source="ro.boot.vbmeta.digest"
  fi
fi

# Priority 4: Fallback random generation
if [ -z "$_winner" ]; then
  _rnd=$(od -v -An -tx1 -N32 /dev/urandom 2>/dev/null | tr -d ' \r\n' | tr '[:upper:]' '[:lower:]')
  if _is_valid_hash "$_rnd"; then
    _winner="$_rnd"
    _source="generated"
  fi
fi

if [ -n "$_winner" ]; then
  ensure_dir "$SPECTER_DIR"
  [ "$_source" != "cache" ] && [ "$_source" != "custom" ] && printf '%s' "$_winner" > "$_hash_file"
  sp_force "ro.boot.vbmeta.digest" "$_winner"
  log_i "BOOT_HASH" "Set ro.boot.vbmeta.digest: $_winner (source: $_source)"
  exit 0
else
  log_e "BOOT_HASH" "Failed to obtain boot hash"
  exit 1
fi
