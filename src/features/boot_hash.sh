#!/system/bin/sh
set -e
MODDIR=${0%/*}
. "$MODDIR/../lib/common.sh"
. "$MODDIR/../lib/config_env.sh"

log "BOOT_HASH" "Start"

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
    log "BOOT_HASH" "Wrote $_sh to BRENE config"
  }
  apply_vbmeta_props() { :; }
else
  _set_hash() {
    resetprop -n ro.boot.vbmeta.digest "$1"
    ensure_dir "$SPECTER_DIR"
    echo "$1" > "$VBMETA_DIGEST"
    log "BOOT_HASH" "Set: $1"
  }
fi

_is_zero() {
  case "$1" in
    0000000000000000000000000000000000000000000000000000000000000000|0*0|"") return 0 ;;
    *) return 1 ;;
  esac
}

# Priority 1: TEESimulator-RS boot_hash.bin (if present)
_ts_bin="/data/adb/tricky_store/boot_hash.bin"
if [ -f "$_ts_bin" ] && [ "$(stat -c%s "$_ts_bin" 2>/dev/null)" = "32" ]; then
  _h=$(xxd -p "$_ts_bin" 2>/dev/null | tr -d ' \n' || echo "")
  if [ -n "$_h" ] && ! _is_zero "$_h" && [ "${#_h}" -eq 64 ]; then
    _set_hash "$_h"
    log "BOOT_HASH" "Source: TEESimulator-RS"
    apply_vbmeta_props
    log "BOOT_HASH" "Done"
    exit 0
  fi
fi
unset _ts_bin

# Priority 2: TEE attestation hash (cached by tee.sh)
_h=""
[ -f "$TEE_HASH" ] && _h=$(tr -d ' \n' < "$TEE_HASH" 2>/dev/null || echo "")
if [ -n "$_h" ] && ! _is_zero "$_h" && [ "${#_h}" -eq 64 ]; then
  _set_hash "$_h"
  log "BOOT_HASH" "Source: TEE attestation"
  apply_vbmeta_props
  log "BOOT_HASH" "Done"
  exit 0
fi

# Priority 3: Current system prop (may be from bootloader or vbmeta.sh cache)
_h=$(getprop ro.boot.vbmeta.digest 2>/dev/null || echo "")
if [ -n "$_h" ] && ! _is_zero "$_h" && [ "${#_h}" -eq 64 ]; then
  [ ! -f "$VBMETA_DIGEST" ] && { ensure_dir "$SPECTER_DIR"; echo "$_h" > "$VBMETA_DIGEST"; }
  log "BOOT_HASH" "Source: existing prop"
  apply_vbmeta_props
  log "BOOT_HASH" "Done"
  exit 0
fi

# Priority 4: Compute from vbmeta partition
. "$MODDIR/../lib/vbmeta.sh"
_vbmeta_slot=$(getprop ro.boot.slot_suffix 2>/dev/null || echo "")
_vbmeta_dev="/dev/block/by-name/vbmeta${_vbmeta_slot}"
[ -b "$_vbmeta_dev" ] || _vbmeta_dev="/dev/block/by-name/vbmeta"
_h=$(vbmeta_digest "$_vbmeta_dev" 2>/dev/null || true)
if [ -n "$_h" ] && [ "${#_h}" -eq 64 ]; then
  _set_hash "$_h"
  log "BOOT_HASH" "Source: partition"
  apply_vbmeta_props
  log "BOOT_HASH" "Done"
  exit 0
fi

log "BOOT_HASH" "Failed to obtain boot hash"
exit 1
