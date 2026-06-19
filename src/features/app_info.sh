#!/system/bin/sh
MODDIR=${0%/*}
_root="${MODDIR%/*}"
. "$_root/lib/log.sh"

SPECTER_DIR="${SPECTER_DIR:-/data/adb/specter}"
OUTPUT="$SPECTER_DIR/app_labels.json"
TMP="$SPECTER_DIR/.app_labels.tmp"

mkdir -p "$SPECTER_DIR"

log "APP_INFO" "Resolving app labels for all user packages"

printf "{" > "$TMP"
sep=""
for pkg in $(pm list packages -3 2>/dev/null | cut -d: -f2); do
  [ -z "$pkg" ] && continue
  label=$(dumpsys package "$pkg" 2>/dev/null \
    | grep -m1 'applicationInfo=' \
    | sed 's/.*label=//' \
    | sed 's/ [a-zA-Z0-9_.-]*=.*//' \
    | head -1)
  [ -z "$label" ] && label="$pkg"
  label=$(printf '%s' "$label" | sed 's/"/\\"/g')
  printf '%s"%s":"%s"' "$sep" "$pkg" "$label" >> "$TMP"
  sep=","
done
printf "}" >> "$TMP"

mv "$TMP" "$OUTPUT"
log "APP_INFO" "Wrote $(wc -c < "$OUTPUT") bytes to $OUTPUT"
