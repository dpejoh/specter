#!/system/bin/sh
set -e
MODDIR=${0%/*}
. "$MODDIR/../lib/common.sh"

OUTPUT_DIR="/sdcard/Download"
OUTPUT_FILE="$OUTPUT_DIR/specter_logs.txt"

log "EXPORT" "Starting log export"

mkdir -p "$OUTPUT_DIR" 2>/dev/null || true
: > "$OUTPUT_FILE" || { log "EXPORT" "ERROR: Cannot write to $OUTPUT_FILE"; exit 1; }

log "EXPORT" "Output: $OUTPUT_FILE"

_append_section() {
  _prefix="$1"
  _header="$2"
  _path="$3"
  echo "$_prefix $_header $_prefix" >> "$OUTPUT_FILE"
  cat "$_path" >> "$OUTPUT_FILE" 2>/dev/null || true
  echo "" >> "$OUTPUT_FILE"
}

log "EXPORT" "Collecting files from $SPECTER_DIR"

for _f in "$SPECTER_DIR"/*; do
  [ -f "$_f" ] || continue
  _basename=$(basename "$_f")
  log "EXPORT" "Adding $_basename"
  _append_section "---" "$_basename" "$_f"
done

for _f in "$SPECTER_DIR"/log/*; do
  [ -f "$_f" ] || continue
  _basename=$(basename "$_f")
  log "EXPORT" "Adding $_basename (log)"
  _append_section "===" "$_basename" "$_f"
done

log "EXPORT" "Export complete"
echo ""
echo "Logs exported to: $OUTPUT_FILE"
log "EXPORT" "Finish"
exit 0
