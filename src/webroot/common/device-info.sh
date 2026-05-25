#!/system/bin/sh
set -e
MODULE_ROOT="${0%/*}"
MODULE_ROOT="${MODULE_ROOT%/webroot/common}"
. "$MODULE_ROOT/lib/common.sh"
. "$MODULE_ROOT/lib/paths.sh"

INFO_PATH="$MODULE_ROOT/webroot/json/info.json"

_android_ver=$(_escape_json "$(getprop ro.build.version.release)")
_kernel_ver=$(_escape_json "$(uname -r)")
_version=$(_escape_json "$(grep '^version=' "$MODULE_ROOT/module.prop" | cut -d'=' -f2)")

# Root Implementation
# Strategy: kernel-level root providers first, then userspace
# Most-specific variant checks before generic catch-alls
detect_root_solution
_root_type="$ROOT_TYPE"

# Security patch date — real system value + optional spoofed value
_build_patch=$(getprop ro.build.version.security_patch 2>/dev/null || echo "")
_patch_date=$(grep '^boot=' /data/adb/tricky_store/security_patch.txt 2>/dev/null | cut -d= -f2 || echo "")

# Flags
_twrp="false"; [ -f "$SPECTER_DIR/twrp" ] && _twrp="true"
_blacklist="false"; [ -f "$SPECTER_DIR/blacklist_enabled" ] && _blacklist="true"
_recovery_detected="false"
for _rd in TWRP OrangeFox FOX PBRP PitchBlack Recovery; do
  [ -d "/sdcard/$_rd" ] && { _recovery_detected="true"; break; }
done

# TEE status — read cached result from Specter dir
_tee_status="unknown"
if [ -f "$TEE_STATUS" ]; then
  _tee_val=$(grep -E '^tee(broken|_broken)=' "$TEE_STATUS" | cut -d= -f2 2>/dev/null || echo "")
  case "$_tee_val" in
    true)  _tee_status="broken" ;;
    false) _tee_status="normal" ;;
  esac
  unset _tee_val
fi

# Output JSON
cat <<EOF > "$INFO_PATH"
{
  "android": "$_android_ver",
  "kernel": "$_kernel_ver",
  "root": "$_root_type",
  "root_sol": "$ROOT_SOL",
  "version": "$_version",
  "tee_status": "$_tee_status",
  "security_patch": "$_patch_date",
  "build_patch": "$_build_patch",
  "flags": {
    "twrp": $_twrp,
    "blacklist": $_blacklist,
    "recovery_detected": $_recovery_detected
  }
}
EOF
unset _android_ver _kernel_ver _root_type _version _tee_status _build_patch _patch_date _twrp _blacklist _recovery_detected _rd
