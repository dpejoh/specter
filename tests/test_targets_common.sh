plan "webroot/common/targets.sh — WebUI target list via the keystore abstraction"

# ---------- Tricky Store: txt backend ----------
bootstrap
source_libs
mk_module tricky_store "Tricky Store"
detect_keystore_manager
cat > "$KSM_TARGETS" << 'EOF'
[a section]
android
com.existing.app!
com.pinned.app?
EOF

_tc_out=$(run_common targets.sh get)
assert_contains "txt get: bare entry" "$_tc_out" "android"
assert_contains "txt get: force suffix kept" "$_tc_out" "com.existing.app!"
assert_contains "txt get: conditional suffix kept" "$_tc_out" "com.pinned.app?"
assert_not_contains "txt get: section dropped" "$_tc_out" "[a section]"

_tc_staging="$TEST_ROOT/staging_txt.txt"
printf 'android\ncom.new.app\n' > "$_tc_staging"
run_common targets.sh set "$_tc_staging" >/dev/null
assert_contains "txt set: committed" "$(cat "$KSM_TARGETS")" "com.new.app"
assert_file_not_exists "txt set: staging consumed" "$_tc_staging"
assert_file_exists "txt set: backup" "${KSM_TARGETS}.bak"

# ---------- OhMyKeymint: toml backend ----------
bootstrap
source_libs
mk_module oh_my_keymint "OhMyKeymint"
mkdir -p "$OMK_DIR"
cat > "$OMK_INJECTOR" << 'EOF'
[main]
enable = true

scoop = [
  "android",
  "com.google.android.gms",
]
EOF
detect_keystore_manager

_tc_out2=$(run_common targets.sh get)
assert_contains "toml get: reads scoop" "$_tc_out2" "com.google.android.gms"
assert_not_contains "toml get: not target.txt" "$_tc_out2" "com.existing.app"

_tc_staging2="$TEST_ROOT/staging_toml.txt"
printf 'android\ncom.google.android.gms\ncom.new.app?\n' > "$_tc_staging2"
run_common targets.sh set "$_tc_staging2" >/dev/null
assert_contains "toml set: entry added" "$(cat "$OMK_INJECTOR")" "com.new.app"
assert_not_contains "toml set: suffix stripped" "$(cat "$OMK_INJECTOR")" "com.new.app?"
assert_contains "toml set: siblings kept" "$(cat "$OMK_INJECTOR")" "[main]"
assert_file_not_exists "toml set: target.txt untouched" "$TARGET_TXT"

# ---------- argument handling ----------
bootstrap
source_libs
mk_module tricky_store "Tricky Store"
detect_keystore_manager
run_common targets.sh set "$TEST_ROOT/does_not_exist" >/dev/null 2>&1
assert_exit_code "set: missing staging file fails" 1 "$?"
run_common targets.sh bogus >/dev/null 2>&1
assert_exit_code "unknown command fails" 1 "$?"

done_testing
