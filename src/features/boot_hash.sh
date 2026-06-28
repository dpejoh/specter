#!/system/bin/sh
set -e
MODDIR=${0%/*}
. "$MODDIR/../lib/common.sh"
. "$MODDIR/../lib/constants.sh"

log_i "BOOT_HASH" "Starting boot hash resolution"

# BRENE cooperation: if BRENE is installed and has priority,
# compute boot hash and write it to BRENE's config instead of setting the prop directly
if [ -d "/data/adb/modules/brene" ] && [ "$(cfg_get conflict_brene priority_module)" = "priority_module" ]; then
  _set_hash() {
    _sh="$1"
    ensure_dir "$SPECTER_DIR"
    echo "$_sh" > "$VBMETA_DIGEST"
    if [ -f "/data/adb/brene/config.sh" ]; then
      sed -i "s/^config_verified_boot_hash=.*/config_verified_boot_hash='$_sh'/" /data/adb/brene/config.sh
    fi
    log_d "BOOT_HASH" "Wrote $_sh to BRENE config"
  }
  apply_vbmeta_props() { :; }
else
  _set_hash() {
    resetprop -n ro.boot.vbmeta.digest "$1"
    ensure_dir "$SPECTER_DIR"
    echo "$1" > "$VBMETA_DIGEST"
    log_d "BOOT_HASH" "Set: $1"
  }
fi

_is_zero() {
  case "$1" in
    0000000000000000000000000000000000000000000000000000000000000000|0*0|"") return 0 ;;
    *) return 1 ;;
  esac
}

# Step 1: Cache all candidate values

_tee_bhash_file="$TEE_BHASH"
TEE_BHASH=""
[ -f "$_tee_bhash_file" ] && TEE_BHASH=$(tr -d ' \n' < "$_tee_bhash_file" 2>/dev/null || echo "")

PROP_BHASH=$(getprop ro.boot.vbmeta.digest 2>/dev/null || echo "")

# Step 2: Resolve winner via priority chain

_winner=""
_winner_src=""

# Priority 0: Custom boot hash (user-configured override)
CUSTOM_BHASH=$(cfg_get custom_boot_hash "")
if [ -z "$_winner" ] && [ -n "$CUSTOM_BHASH" ] && [ "${#CUSTOM_BHASH}" -eq 64 ]; then
  _winner="$CUSTOM_BHASH"
  _winner_src="custom"
fi

# Priority 1: TEE attestation hash
if [ -z "$_winner" ] && [ -n "$TEE_BHASH" ] && ! _is_zero "$TEE_BHASH" && [ "${#TEE_BHASH}" -eq 64 ]; then
  _winner="$TEE_BHASH"
  _winner_src="TEE attestation"
fi

# Priority 2: Existing prop value (set by bootloader)
if [ -z "$_winner" ] && [ -n "$PROP_BHASH" ] && ! _is_zero "$PROP_BHASH" && [ "${#PROP_BHASH}" -eq 64 ]; then
  _winner="$PROP_BHASH"
  _winner_src="prop"
fi

# Priority 3: Compute from vbmeta partition
if [ -z "$_winner" ]; then
  . "$MODDIR/../lib/vbmeta.sh"
  _vbmeta_slot=$(getprop ro.boot.slot_suffix 2>/dev/null || echo "")
  _vbmeta_dev="/dev/block/by-name/vbmeta${_vbmeta_slot}"
  [ -b "$_vbmeta_dev" ] || _vbmeta_dev="/dev/block/by-name/vbmeta"
  CALC_BHASH=$(vbmeta_digest "$_vbmeta_dev" 2>/dev/null || true)
  if [ -n "$CALC_BHASH" ] && [ "${#CALC_BHASH}" -eq 64 ]; then
    _winner="$CALC_BHASH"
    _winner_src="partition"
  fi
fi

# Step 3: Apply winner
if [ -n "$_winner" ]; then
  case "$_winner_src" in
    "custom")
      log_i "BOOT_HASH" "Custom boot hash override"
      _set_hash "$_winner"
      ;;
    "TEE attestation"|"partition")
      _set_hash "$_winner"
      ;;
    "prop")
      if [ -d "/data/adb/modules/brene" ] && [ "$(cfg_get conflict_brene priority_module)" = "priority_module" ]; then
        _set_hash "$_winner"
      else
        ensure_dir "$SPECTER_DIR"
        echo "$_winner" > "$VBMETA_DIGEST"
        log_d "BOOT_HASH" "Boot hash already valid, keeping bootloader value"
      fi
      ;;
  esac
  apply_vbmeta_props
  echo "$_winner" > "$_tee_bhash_file"
  log_i "BOOT_HASH" "Source: $_winner_src"
  log_i "BOOT_HASH" "Boot hash resolved"
  exit 0
fi

log_e "BOOT_HASH" "Failed to obtain boot hash"
exit 1
