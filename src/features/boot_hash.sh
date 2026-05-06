#!/system/bin/sh
set -e
MODDIR=${0%/*}
. "$MODDIR/../lib/common.sh"
. "$MODDIR/../lib/paths.sh"

log "BOOT_HASH" "Start"

_boot_hash=""

if [ -f "/sdcard/Specter/boot_hash" ] 2>/dev/null; then
  _boot_hash=$(tr -cd '0-9a-fA-F' < "/sdcard/Specter/boot_hash" 2>/dev/null)
  log "BOOT_HASH" "User config: /sdcard/Specter/boot_hash"
elif [ -f "$BOOT_HASH_FILE" ] 2>/dev/null; then
  _boot_hash=$(tr -cd '0-9a-fA-F' < "$BOOT_HASH_FILE" 2>/dev/null)
  log "BOOT_HASH" "Stored hash: $BOOT_HASH_FILE"
else
  if command -v sha256sum >/dev/null 2>&1 && command -v blockdev >/dev/null 2>&1; then
    _vbmeta_out=$(read_vbmeta 2>/dev/null || echo "")
    if [ -n "$_vbmeta_out" ]; then
      _vbsize="${_vbmeta_out%% *}"
      _vbhash="${_vbmeta_out#* }"
      resetprop -n ro.boot.vbmeta.size "$_vbsize" 2>/dev/null
      resetprop -n ro.boot.vbmeta.hash_alg "sha256" 2>/dev/null
      resetprop -n ro.boot.vbmeta.avb_version "2.0" 2>/dev/null
      if [ -n "$_vbhash" ]; then
        _boot_hash="$_vbhash"
        log "BOOT_HASH" "Block device hash: $_vbhash"
      fi
      unset _vbsize _vbhash
    fi
    unset _vbmeta_out
  fi
fi

if [ -z "$_boot_hash" ] || [ "${#_boot_hash}" -ne 64 ]; then
  _boot_hash="0000000000000000000000000000000000000000000000000000000000000000"
  log "BOOT_HASH" "Fallback: all zeros"
fi

ensure_dir "$(dirname "$BOOT_HASH_FILE")"
echo "$_boot_hash" > "$BOOT_HASH_FILE" || die "Write failed: $BOOT_HASH_FILE"
chmod 644 "$BOOT_HASH_FILE" 2>/dev/null || true

resetprop -n ro.boot.vbmeta.digest "$_boot_hash" 2>/dev/null || log "BOOT_HASH" "Failed to set vbmeta.digest"
log "BOOT_HASH" "vbmeta.digest = $_boot_hash"

unset _boot_hash
log "BOOT_HASH" "Finish"
exit 0
