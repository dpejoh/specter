#!/system/bin/sh
set -e
MODDIR=${0%/*}
. "$MODDIR/../lib/common.sh"

OUTPUT_DIR="/sdcard/Download"
OUTPUT_FILE="$OUTPUT_DIR/specter_logs.txt"
SANITIZE="${1:-no}"

log_i "EXPORT" "Starting log export (sanitize=$SANITIZE)"

mkdir -p "$OUTPUT_DIR" 2>/dev/null || true
: > "$OUTPUT_FILE" || { log_e "EXPORT" "Cannot write to $OUTPUT_FILE"; exit 1; }

log_i "EXPORT" "Output: $OUTPUT_FILE"

_sanitize_stream() {
  if [ "$SANITIZE" = "sanitize" ]; then
    sed -e 's/[0-9a-fA-F]\{32,\}/[REDACTED_HEX]/g' \
        -e 's/[0-9a-fA-F]\{16,\}/[REDACTED_HEX]/g'
  else
    cat
  fi
}

_append_section() {
  _prefix="$1"
  _header="$2"
  _path="$3"
  echo "$_prefix $_header $_prefix" >> "$OUTPUT_FILE"
  cat "$_path" 2>/dev/null | _sanitize_stream >> "$OUTPUT_FILE" || true
  echo "" >> "$OUTPUT_FILE"
}

log_i "EXPORT" "Collecting files from $SPECTER_DIR"

for _f in "$SPECTER_DIR"/*; do
  [ -f "$_f" ] || continue
  _basename=$(basename "$_f")
  log_d "EXPORT" "Adding $_basename"
  _append_section "---" "$_basename" "$_f"
done

for _f in "$SPECTER_DIR"/log/*; do
  [ -f "$_f" ] || continue
  _basename=$(basename "$_f")
  log_d "EXPORT" "Adding $_basename (log)"
  _append_section "===" "$_basename" "$_f"
done

# Add logcat dump
log_i "EXPORT" "Adding logcat dump"
echo "=== LOGCAT ===" >> "$OUTPUT_FILE"
if command -v logcat >/dev/null 2>&1; then
  logcat -d -s Specter 2>/dev/null | _sanitize_stream >> "$OUTPUT_FILE" || true
fi
echo "" >> "$OUTPUT_FILE"

# Add module config summary
log_i "EXPORT" "Adding config summary"
echo "=== SPECTER CONFIG ===" >> "$OUTPUT_FILE"
for _cfg_file in "$SPECTER_DIR"/config/*.val; do
  [ -f "$_cfg_file" ] || continue
  _cfg_name=$(basename "$_cfg_file" .val)
  _cfg_val=$(cat "$_cfg_file" 2>/dev/null || echo "")
  echo "$_cfg_name=$_cfg_val" >> "$OUTPUT_FILE"
done 2>/dev/null || true
echo "" >> "$OUTPUT_FILE"

log_i "EXPORT" "Export complete"
echo ""
echo "Logs exported to: $OUTPUT_FILE"
log_i "EXPORT" "Log export complete"
exit 0
