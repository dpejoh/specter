#!/system/bin/sh
set -e
MODDIR=${0%/*}
. "$MODDIR/../lib/common.sh"
. "$MODDIR/../lib/constants.sh"
WDIR="/data/local/tmp"
_attestation_raw="$WDIR/attestation_raw.$$"
_attestation_file="$WDIR/attestation.$$"
trap 'rm -f "$_attestation_raw" "$_attestation_file" 2>/dev/null' EXIT

log_i "WIDEVINE" "Starting Widevine attestation injection"

  check_network || { log_e "WIDEVINE" "No internet connection"; exit 1; }

log_i "WIDEVINE" "Downloading attestation key..."
download "$ATTESTATION_URL" > "$_attestation_raw" 2>/dev/null || {
  log_e "WIDEVINE" "Failed to download attestation key"
  exit 1
}
log_i "WIDEVINE" "Attestation key downloaded successfully"

log_i "WIDEVINE" "Decoding attestation keybox..."
decode_substitution "$_attestation_raw" "$_attestation_file" 2>/dev/null || {
  log_e "WIDEVINE" "Failed to decode attestation key"
  exit 1
}
rm -f "$_attestation_raw"

chmod 644 "$_attestation_file" 2>/dev/null || log_w "WIDEVINE" "Failed to set permissions on attestation"

_abi=$(getprop ro.product.cpu.abi 2>/dev/null) || log_w "WIDEVINE" "Failed to read CPU ABI"
case "$_abi" in
  arm64|x86_64) _lib="/vendor/lib64/hw" ;;
  *)            _lib="/vendor/lib/hw" ;;
esac

log_i "WIDEVINE" "Searching for KmInstallKeybox vendor binary..."
KM_BIN=$(find_kmInstallKeybox)

if [ -n "$KM_BIN" ]; then
  log_i "WIDEVINE" "Found KmInstallKeybox at $KM_BIN"
  log_i "WIDEVINE" "Running KmInstallKeybox with attestation key..."
  LD_LIBRARY_PATH="$_lib" "$KM_BIN" "$_attestation_file" attestation true 2>/dev/null || {
    log_e "WIDEVINE" "KmInstallKeybox exited with non-zero status"
    exit 1
  }
  log_i "WIDEVINE" "KmInstallKeybox completed successfully"
else
  log_w "WIDEVINE" "KmInstallKeybox not found (non-Qualcomm device?)"
  exit 1
fi
unset KM_BIN
unset _abi _lib

log_i "WIDEVINE" "Widevine attestation injection complete"
exit 0
