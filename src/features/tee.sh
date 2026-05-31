#!/system/bin/sh
set -e
MODDIR=${0%/*}
. "$MODDIR/../lib/common.sh"
. "$MODDIR/../lib/paths.sh"
. "$MODDIR/../lib/vbmeta.sh"

APK="$MODDIR/../apk/specter.apk"
PACKAGE="com.dpejoh.specter"
BOOT_HASH_FILE="/data/adb/boot_hash"

log "TEE" "Start"

[ ! -f "$APK" ] && { log "TEE" "APK not found: $APK"; exit 1; }

pm install -r "$APK" 2>/dev/null || { log "TEE" "APK install failed"; exit 1; }

for _i in 1 2 3 4 5; do
  _tee=$(content query --uri content://$PACKAGE/check 2>/dev/null \
    | grep -o 'status=[a-z]*' | cut -d= -f2) || true
  [ -n "$_tee" ] && break
  sleep 0.5
done
_hash=$(content query --uri content://$PACKAGE/hash 2>/dev/null \
  | grep -oE '[a-f0-9]{64}|unavailable') || true
# Reject all-zeros hash (TEE returns zeros when boot state is unverified/failed)
case "$_hash" in
  0000000000000000000000000000000000000000000000000000000000000000) _hash="unavailable" ;;
esac
unset _i

pm uninstall $PACKAGE 2>/dev/null || true

_partition_hash=$(vbmeta_digest "/dev/block/by-name/vbmeta" || true)

# --- Save to cache + set boot prop ---
_publish_hash() {
  # shellcheck disable=SC3043
  local _h="$1" _s="$2"
  echo "$_h" > "$TEE_HASH"
  echo "$_h" > "$VBMETA_DIGEST"
  log "TEE" "Hash: $_h ($_s)"
}

ensure_dir "$SPECTER_DIR"

case "$_tee" in
  normal) echo "tee_broken=false" > "$TEE_STATUS"; log "TEE" "Status: normal" ;;
  broken) echo "tee_broken=true"  > "$TEE_STATUS"; log "TEE" "Status: broken" ;;
  *)      log "TEE" "Status: unavailable ($_tee)" ;;
esac

if [ "$_hash" != "unavailable" ] && [ -n "$_hash" ]; then
  # TEE hash available, authoritative
  _publish_hash "$_hash" "tee"
  if [ "$_partition_hash" = "$_hash" ]; then
    log "TEE" "Digest OK: partition matches TEE attestation"
  elif [ -n "$_partition_hash" ]; then
    log "WARN" "Digest MISMATCH: partition=$_partition_hash TEE=$_hash"
  fi
elif [ -n "$_partition_hash" ]; then
  # Fallback: TEE hash unavailable, use partition hash
  _publish_hash "$_partition_hash" "fallback"
  echo "tee_fallback=true" >> "$TEE_STATUS"
  log "TEE" "Status: fallback (TEE unavailable, using partition hash)"
else
  log "TEE" "Hash: unavailable (TEE and partition both failed)"
fi

rm -f "$APK"

log "TEE" "Done"
