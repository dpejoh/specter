plan "app_info.sh — native app label resolution"

# Mock dumpsys that returns app labels
_mock_dumpsys() {
  cat > "$BIN_DIR/dumpsys" << 'MOCK'
#!/bin/sh
case "$2" in
  com.android.vending) echo "  applicationInfo=label=Play Store flags=..." ;;
  com.google.android.gms) echo "  applicationInfo=label=Google Play Services flags=..." ;;
  com.dpejoh.specter) echo "  applicationInfo=label=Specter flags=..." ;;
  *) echo "  applicationInfo=label=$(echo "$2" | tr '.' ' ') flags=..." ;;
esac
MOCK
  chmod +x "$BIN_DIR/dumpsys"
}

# Mock pm that returns third-party packages
_mock_pm() {
  cat > "$BIN_DIR/pm" << 'MOCK'
#!/bin/sh
echo "package:com.android.vending"
echo "package:com.google.android.gms"
echo "package:com.dpejoh.specter"
MOCK
  chmod +x "$BIN_DIR/pm"
}

# Test that app_info.sh produces correct JSON output
test_json_output() {
  bootstrap
  _mock_dumpsys
  _mock_pm

  _out_dir="$TEST_ROOT/output"
  mkdir -p "$_out_dir"

  PATH="$BIN_DIR:/usr/bin:/bin" \
  SPECTER_DIR="$_out_dir" \
  sh "$REPO_ROOT/src/features/app_info.sh" 2>/dev/null; _rc=$?

  assert_exit_code "script exits 0" 0 "$_rc"
  assert_file_exists "output file created" "$_out_dir/app_labels.json"

  _json=$(cat "$_out_dir/app_labels.json" 2>/dev/null)
  assert_contains "JSON starts with {" "$_json" "{"
  assert_contains "JSON ends with }" "$_json" "}"
  assert_contains "contains vending" "$_json" "com.android.vending"
  assert_contains "contains specter" "$_json" "com.dpejoh.specter"
  assert_contains "label includes Play Store" "$_json" "Play Store"

  _opens=$(printf '%s' "$_json" | tr -cd '{' | wc -c)
  _closes=$(printf '%s' "$_json" | tr -cd '}' | wc -c)
  assert_eq "JSON braces balanced" "$_opens" "$_closes"
}

# Test fallback when dumpsys fails (labels = package names)
test_dumpsys_fallback() {
  bootstrap

  _out_dir="$TEST_ROOT/output"
  mkdir -p "$_out_dir"

  # No dumpsys in PATH — script should fall back to package names
  PATH="$BIN_DIR:/usr/bin:/bin" \
  SPECTER_DIR="$_out_dir" \
  sh "$REPO_ROOT/src/features/app_info.sh" 2>/dev/null; _rc=$?

  assert_exit_code "script exits 0 without dumpsys" 0 "$_rc"
  assert_file_exists "output file exists" "$_out_dir/app_labels.json"

  _json=$(cat "$_out_dir/app_labels.json" 2>/dev/null)
  assert_contains "falls back to package name" "$_json" "com.android.vending"
}

test_json_output
test_dumpsys_fallback

done_testing
