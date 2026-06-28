#!/system/bin/sh
set -e
MODDIR=${0%/*}
. "$MODDIR/../lib/common.sh"
. "$MODDIR/../lib/constants.sh"

case "${1:-}" in
  --fetch)
    _sp=$(download "https://source.android.com/docs/security/bulletin/pixel" 2>/dev/null |
      sed -n 's/.*<td>\([0-9]\{4\}-[0-9]\{2\}-[0-9]\{2\}\)<\/td>.*/\1/p' |
      head -n 1)
    if [ -n "$_sp" ]; then
      echo "$_sp"
      exit 0
    fi
    exit 1
    ;;
esac

# Try to fetch the real security patch date from source.android.com first.
# Network may not be available yet at boot, so fall back to date computation.
_patch=$(sh "$0" --fetch 2>/dev/null) || true

if [ -z "$_patch" ]; then
  current_year=$(date +%Y 2>/dev/null) || current_year=$(getprop ro.build.version.release 2>/dev/null | cut -d. -f1) || current_year="2026"
  current_month=$(date +%m 2>/dev/null) || current_month="01"

  patch_date="${current_year}-${current_month}-05"
  log_w "SECURITY_PATCH" "Network unavailable, using computed date: $patch_date"
else
  patch_date="$_patch"
  log_i "SECURITY_PATCH" "Fetched security patch date: $patch_date"
fi
unset _patch

{
  echo "all=${patch_date}"
} > "$SECURITY_PATCH_FILE" || die "Failed to write $SECURITY_PATCH_FILE"
log_i "SECURITY_PATCH" "The security patch is written"
exit 0
