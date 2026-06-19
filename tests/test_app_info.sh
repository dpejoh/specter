. "$(dirname "$0")/helpers.sh"

plan "app_info.sh — native app label resolution"

# Mock dumpsys for known packages
_dumpsys() {
  case "$2" in
    com.android.vending)
      echo "  applicationInfo=label=Play Store flags=..."
      ;;
    com.google.android.gms)
      echo "  applicationInfo=label=Google Play Services flags=..."
      ;;
    com.dpejoh.specter)
      echo "  applicationInfo=label=Specter flags=..."
      ;;
  esac
}

# Test that app_info.sh produces correct JSON output by running
# the core logic with mock commands
test_json_output() {
  bootstrap

  # Create a mock dumpsys in PATH
  cat > "$BIN_DIR/dumpsys" << 'MOCK'
#!/bin/sh
echo "  applicationInfo=label=Mock App flags=..."
MOCK
  chmod +x "$BIN_DIR/dumpsys"

  # Create a temp output dir
  _out_dir="$TEST_ROOT/output"
  mkdir -p "$_out_dir"

  # Run the script logic directly with overridden variables
  PATH="$BIN_DIR:/usr/bin:/bin" \
  MODDIR="$REPO_ROOT/src" \
  SPECTER_DIR="$_out_dir" \
  sh "$REPO_ROOT/src/features/app_info.sh" 2>/dev/null; _rc=$?

  assert_exit_code "script exits 0" 0 "$_rc"
  assert_file_exists "output file created" "$_out_dir/app_labels.json"

  _json=$(cat "$_out_dir/app_labels.json" 2>/dev/null)
  assert_contains "JSON starts with {" "$_json" "{"
  assert_contains "JSON ends with }" "$_json" "}"
  assert_contains "contains package" "$_json" "com.android.vending"
  assert_contains "contains label" "$_json" "Mock"

  _opens=$(printf '%s' "$_json" | tr -cd '{' | wc -c)
  _closes=$(printf '%s' "$_json" | tr -cd '}' | wc -c)
  assert_eq "JSON braces balanced" "$_opens" "$_closes"
}

# Test fallback when dumpsys is unavailable (labels = package names)
test_dumpsys_fallback() {
  bootstrap

  _out_dir="$TEST_ROOT/output"
  mkdir -p "$_out_dir"

  PATH="$BIN_DIR:/usr/bin:/bin" \
  MODDIR="$REPO_ROOT/src" \
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
