#!/system/bin/sh
set -e
MODDIR=${0%/*}
. "$MODDIR/../lib/common.sh"
. "$MODDIR/../lib/constants.sh"

detect_keystore_manager

_read_patch_prop() {
  _prop_name="$1"
  shift

  _val=$(getprop "$_prop_name" 2>/dev/null || echo "")
  if [ -n "$_val" ]; then
    printf '%s' "$_val"
    unset _prop_name _val
    return 0
  fi

  for _prop_file in "$@"; do
    [ -f "$_prop_file" ] || continue
    _val=$(grep "^${_prop_name}=" "$_prop_file" 2>/dev/null | head -1 | cut -d= -f2 | tr -d '[:space:]')
    if [ -n "$_val" ]; then
      printf '%s' "$_val"
      unset _prop_name _val
      return 0
    fi
  done

  unset _prop_name _val
  return 1
}

_validate_patch_date() {
  case "$1" in
    [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]) printf '%s' "$1"; return 0 ;;
    *) return 1 ;;
  esac
}

_read_system_build_prop_patch() {
  for _prop_file in ${SPECTER_SYSTEM_BUILD_PROP:-} /system/build.prop /system/system/build.prop; do
    [ -n "$_prop_file" ] || continue
    [ -f "$_prop_file" ] || continue
    _val=$(grep '^ro.build.version.security_patch=' "$_prop_file" 2>/dev/null |
      head -1 | cut -d= -f2 | tr -d '[:space:]') || _val=""
    if [ -n "$_val" ] && _validate_patch_date "$_val" >/dev/null; then
      printf '%s' "$_val"
      unset _prop_file _val
      return 0
    fi
  done
  unset _prop_file _val
  return 1
}

_fetch_pixel_patch() {
  _fp=$(download "https://source.android.com/docs/security/bulletin/pixel" 2>/dev/null |
    sed -n 's/.*<td>\([0-9]\{4\}-[0-9]\{2\}-[0-9]\{2\}\)<\/td>.*/\1/p' |
    head -n 1)
  if [ -n "$_fp" ] && _validate_patch_date "$_fp" >/dev/null; then
    printf '%s' "$_fp"
    unset _fp
    return 0
  fi
  unset _fp
  return 1
}

_compute_fallback_patch() {
  _year=$(date +%Y 2>/dev/null) || _year=$(getprop ro.build.version.release 2>/dev/null | cut -d. -f1) || _year="2026"
  _month=$(date +%m 2>/dev/null) || _month="01"
  printf '%s-%s-05' "$_year" "$_month"
  unset _year _month
}

case "${1:-}" in
  --fetch)
    # WebUI Fetch: bulletin, then synthetic. Action auto uses device props.
    _fetch_pixel_patch || _compute_fallback_patch
    exit 0
    ;;
  --device)
    _patch=$(_read_system_build_prop_patch) || _patch=""
    if [ -n "$_patch" ]; then
      printf '%s\n' "$_patch"
      unset _patch
      exit 0
    fi
    unset _patch
    exit 1
    ;;
  --get)
    ksm_get_security_patch || exit 1
    exit 0
    ;;
  --set)
    case "${2:-}" in
      [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]) ;;
      *) die "security_patch.sh --set requires a YYYY-MM-DD date" ;;
    esac
    ksm_available || die "No keystore manager (Tricky Store / OhMyKeymint) data directory found"
    ksm_set_security_patch "$2" || die "Failed to write $KSM_SECURITY"
    log_i "SECURITY_PATCH" "Security patch manually set to $2"
    exit 0
    ;;
esac

ksm_available || die "No keystore manager (Tricky Store / OhMyKeymint) data directory found"

_patch=$(_read_system_build_prop_patch) || _patch=""
_patch_source="device"

_sp_seed_only=0
[ "$SPECTER_FIRST_BOOT" = "1" ] && _sp_seed_only=1
[ "$SPECTER_HOT_INSTALL" = "1" ] && _sp_seed_only=1

if [ "$_sp_seed_only" = "1" ]; then
  _sp_ctx="First install"
  [ "$SPECTER_HOT_INSTALL" = "1" ] && _sp_ctx="Hot install"
  _existing=$(ksm_get_security_patch 2>/dev/null) || _existing=""
  if [ -n "$_existing" ] && _validate_patch_date "$_existing" >/dev/null; then
    log_i "SECURITY_PATCH" "$_sp_ctx: existing spoofed patch left unchanged ($_existing)"
    unset _existing _sp_ctx _sp_seed_only
    exit 0
  fi
  unset _existing
  if [ -z "$_patch" ]; then
    log_i "SECURITY_PATCH" "$_sp_ctx: no device patch, leaving existing value unchanged"
    unset _sp_ctx _sp_seed_only
    exit 0
  fi
  ksm_set_security_patch "$_patch" || die "Failed to write $KSM_SECURITY"
  log_i "SECURITY_PATCH" "Applied security patch from $_patch_source: $_patch"
  unset _sp_ctx _sp_seed_only
  exit 0
fi
unset _sp_seed_only

if [ -z "$_patch" ]; then
  _patch=$(_read_patch_prop "ro.vendor.build.security_patch" "/vendor/build.prop") || _patch=""
  if [ -n "$_patch" ] && _validate_patch_date "$_patch" >/dev/null; then
    _patch_source="other"
  else
    _patch=""
  fi
fi
if [ -z "$_patch" ]; then
  _patch=$(_fetch_pixel_patch) || _patch=""
  _patch_source="bulletin"
fi
if [ -z "$_patch" ]; then
  _patch=$(_compute_fallback_patch)
  _patch_source="other"
fi

ksm_set_security_patch "$_patch" || die "Failed to write $KSM_SECURITY"
log_i "SECURITY_PATCH" "Applied security patch from $_patch_source: $_patch"
exit 0
