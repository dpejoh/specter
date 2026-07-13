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

_resolve_device_patch() {
  _patch=$(_read_patch_prop "ro.build.version.security_patch" "/system/build.prop" "/system/system/build.prop") || _patch=""
  if [ -n "$_patch" ] && _validate_patch_date "$_patch" >/dev/null; then
    printf '%s' "$_patch"
    unset _patch
    return 0
  fi

  _patch=$(_read_patch_prop "ro.vendor.build.security_patch" "/vendor/build.prop") || _patch=""
  if [ -n "$_patch" ] && _validate_patch_date "$_patch" >/dev/null; then
    printf '%s' "$_patch"
    unset _patch
    return 0
  fi

  unset _patch
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
  --get)
    [ -f "$KSM_SECURITY" ] || exit 1
    case "$KSM_FORMAT" in
      toml) grep -E '^[ ]*security_patch[ ]*=' "$KSM_SECURITY" 2>/dev/null | head -1 | sed 's/.*=[ ]*"\([^"]*\)".*/\1/' ;;
      *) grep -E '^(boot|all)=' "$KSM_SECURITY" 2>/dev/null | head -1 | cut -d= -f2 ;;
    esac
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

_patch=$(_resolve_device_patch) || _patch=""
_patch_source="device"
if [ -z "$_patch" ]; then
  _patch=$(_fetch_pixel_patch) || _patch=""
  _patch_source="pixel"
fi
if [ -z "$_patch" ]; then
  _patch=$(_compute_fallback_patch)
  _patch_source="fallback"
fi

_vendor_patch=$(_read_patch_prop "ro.vendor.build.security_patch" "/vendor/build.prop") || _vendor_patch="$_patch"
[ -n "$_vendor_patch" ] || _vendor_patch="$_patch"
_yyyymm=$(echo "$_patch" | cut -d'-' -f1-2 | tr -d '-')

case "$KSM_FORMAT" in
  toml)
    ksm_set_security_patch "$_patch" || die "Failed to write $KSM_SECURITY"
    ;;
  *)
    printf 'system=%s\nboot=%s\nvendor=%s\n' "$_yyyymm" "$_patch" "$_vendor_patch" > "$KSM_SECURITY" || die "Failed to write $KSM_SECURITY"
    ;;
esac

log_i "SECURITY_PATCH" "Applied security patch (source: $_patch_source): system=$_yyyymm, boot=$_patch, vendor=$_vendor_patch"
exit 0
