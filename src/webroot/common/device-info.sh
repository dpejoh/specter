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
_patch_date=$(ksm_get_security_patch 2>/dev/null) || _patch_date=""
[ -z "$_patch_date" ] && _patch_date="$_build_patch"

# Flags
_twrp="false"; [ -f "$SPECTER_DIR/twrp" ] && _twrp="true"
_blacklist="false"; [ -f "$SPECTER_DIR/blacklist_enabled" ] && _blacklist="true"

_pif_model=""
if _pif_prop >/dev/null 2>&1; then
  for _pif_path in \
    "/data/adb/pif.prop" \
    "$PIF_DIR/custom.pif.prop" \
    "/data/adb/pif.json" \
    "$PIF_DIR/pif.json" \
    "$PIF_DIR/autopif.json" \
    "$PIF_DIR/custom.pif.json"
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
fi

# Output JSON
cat <<EOF > "$INFO_PATH"
{
  "android": "$_android_ver",
  "kernel": "$_kernel_ver",
  "root": "$_root_type",
  "root_sol": "$ROOT_SOL",
  "version": "$_version",
  "security_patch": "$_patch_date",
  "build_patch": "$_build_patch",
  "pif_model": "$(_escape_json "$_pif_model")",
  "flags": {
    "twrp": $_twrp,
    "blacklist": $_blacklist
  }
}
EOF
write_webui_state
unset _android_ver _kernel_ver _root_type _version _build_patch _patch_date _pif_model _twrp _blacklist
