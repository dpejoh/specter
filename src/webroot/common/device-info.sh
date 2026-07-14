#!/system/bin/sh
set -e
MODULE_ROOT="${0%/*}"
MODULE_ROOT="${MODULE_ROOT%/webroot/common}"
. "$MODULE_ROOT/lib/common.sh"
. "$MODULE_ROOT/lib/constants.sh"

INFO_PATH="$MODULE_ROOT/webroot/json/info.json"

_android_ver=$(_escape_json "$(getprop ro.build.version.release)")
_kernel_ver=$(_escape_json "$(uname -r)")
_version=$(_escape_json "$(grep '^version=' "$MODULE_ROOT/module.prop" | cut -d'=' -f2)")

# Root Implementation
# Strategy: kernel-level root providers first, then userspace
# Most-specific variant checks before generic catch-alls
{ detect_root_solution; } >&2
_root_type="$ROOT_TYPE"

# Security patch date, real system value + optional spoofed value
detect_keystore_manager
_build_patch=$(getprop ro.build.version.security_patch 2>/dev/null || echo "")
case "$KSM_FORMAT" in
  toml) _patch_date=$(grep -E '^[ ]*security_patch[ ]*=' "$KSM_SECURITY" 2>/dev/null | head -1 | sed 's/.*=[ ]*"\([^"]*\)".*/\1/') ;;
  *) _patch_date=$(grep -E '^(boot|all)=' "$KSM_SECURITY" 2>/dev/null | cut -d= -f2) ;;
esac
[ -z "$_patch_date" ] && _patch_date="$_build_patch"

# Flags
_twrp="false"; [ -f "$SPECTER_DIR/twrp" ] && _twrp="true"
_blacklist="false"; [ -f "$SPECTER_DIR/blacklist_enabled" ] && _blacklist="true"
# TEE status, read cached result from Specter dir
_tee_status="unknown"
_tee_tier=""
if [ -f "$TEE_STATUS" ]; then
  _tee_val=$(grep -E '^tee(broken|_broken)=' "$TEE_STATUS" | cut -d= -f2 2>/dev/null || echo "")
  case "$_tee_val" in
    true)  _tee_status="broken" ;;
    false) _tee_status="normal" ;;
  esac
  unset _tee_val
fi
if [ -f "$TEE_TIER" ]; then
  _tee_tier=$(cat "$TEE_TIER" | tr -d ' \n')
  [ -z "$_tee_tier" ] && _tee_tier="null"
else
  _tee_tier="null"
fi

# PIF spoofed device, read from PIF config (support both .prop and .json)
_pif_model=""
for _pif_path in \
  "/data/adb/pif.prop" \
  "$MODULES_BASE/playintegrityfix/custom.pif.prop" \
  "/data/adb/pif.json" \
  "$MODULES_BASE/playintegrityfix/pif.json" \
  "$MODULES_BASE/playintegrityfix/autopif.json" \
  "$MODULES_BASE/playintegrityfix/custom.pif.json"
do
  [ -f "$_pif_path" ] || continue
  case "$_pif_path" in
    *.prop)
      _pif_manu=$(grep '^MANUFACTURER=' "$_pif_path" 2>/dev/null | cut -d= -f2)
      _pif_modl=$(grep '^MODEL=' "$_pif_path" 2>/dev/null | cut -d= -f2)
      ;;
    *.json)
      _pif_manu=$(grep -o '"MANUFACTURER"[[:space:]]*:[[:space:]]*"[^"]*"' "$_pif_path" 2>/dev/null | sed 's/.*"MANUFACTURER"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
      _pif_modl=$(grep -o '"MODEL"[[:space:]]*:[[:space:]]*"[^"]*"' "$_pif_path" 2>/dev/null | sed 's/.*"MODEL"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
      ;;
  esac
  if [ -n "$_pif_manu" ] || [ -n "$_pif_modl" ]; then break; fi
done
unset _pif_path
if [ -n "$_pif_manu" ] && [ -n "$_pif_modl" ]; then
  _pif_model="${_pif_manu} ${_pif_modl}"
elif [ -n "$_pif_modl" ]; then
  _pif_model="$_pif_modl"
fi
unset _pif_manu _pif_modl

# Output JSON
cat <<EOF > "$INFO_PATH"
{
  "android": "$_android_ver",
  "kernel": "$_kernel_ver",
  "root": "$_root_type",
  "root_sol": "$ROOT_SOL",
  "version": "$_version",
  "tee_status": "$_tee_status",
  "tee_tier": $_tee_tier,
  "security_patch": "$_patch_date",
  "build_patch": "$_build_patch",
  "pif_model": "$(_escape_json "$_pif_model")",
  "flags": {
    "twrp": $_twrp,
    "blacklist": $_blacklist
  }
}
EOF
unset _android_ver _kernel_ver _root_type _version _tee_status _tee_tier _build_patch _patch_date _pif_model _twrp _blacklist
