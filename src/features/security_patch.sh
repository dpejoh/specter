#!/system/bin/sh
set -e
MODDIR=${0%/*}
. "$MODDIR/../lib/common.sh"
. "$MODDIR/../lib/paths.sh"
. "$MODDIR/../lib/config_env.sh"

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

log "SECURITY_PATCH" "Start"

# Try to fetch the real security patch date from source.android.com first.
# Network may not be available yet at boot, so fall back to date computation.
_patch=$(sh "$0" --fetch 2>/dev/null) || true

if [ -z "$_patch" ]; then
  current_year=$(date +%Y 2>/dev/null) || current_year=$(getprop ro.build.version.release 2>/dev/null | cut -d. -f1) || current_year="2026"
  current_month=$(date +%m 2>/dev/null) || current_month="01"

  # Use last day of previous month as security patch
  if [ "$current_month" -eq 1 ]; then
    target_month=12
    target_year=$((current_year - 1))
  else
    target_month=$(( ${current_month#0} - 1 ))
    target_year=$current_year
  fi

  formatted_month=$(printf "%02d" "$target_month")
  # Last day of month: for most months it's 28/30/31
  # Use 05 as a common convention
  patch_date="${target_year}-${formatted_month}-05"
  log "SECURITY_PATCH" "Network unavailable, using computed date: $patch_date"
else
  patch_date="$_patch"
  log "SECURITY_PATCH" "Fetched security patch date: $patch_date"
fi
unset _patch

log "SECURITY_PATCH" "Writing $patch_date to $SECURITY_PATCH_FILE"

cat > "$SECURITY_PATCH_FILE" <<EOF || die "Failed to write $SECURITY_PATCH_FILE"
system=prop
boot=$patch_date
vendor=$patch_date
EOF
log "SECURITY_PATCH" "Patch date written to $SECURITY_PATCH_FILE"
log "SECURITY_PATCH" "Finish"
exit 0
