plan "target.sh --list-raw / --set — WebUI path + FIXED_TARGETS"

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

_tc_out=$(run_feature target.sh --list-raw)
assert_contains "txt list-raw: bare entry" "$_tc_out" "android"
assert_contains "txt list-raw: force suffix kept" "$_tc_out" "com.existing.app!"
assert_contains "txt list-raw: conditional suffix kept" "$_tc_out" "com.pinned.app?"
assert_not_contains "txt list-raw: section dropped" "$_tc_out" "[a section]"

_tc_staging="$TEST_ROOT/staging_txt.txt"
printf 'com.new.app\n' > "$_tc_staging"
run_feature target.sh --set "$_tc_staging" >/dev/null
_tc_txt=$(cat "$KSM_TARGETS")
assert_contains "txt set: user entry" "$_tc_txt" "com.new.app"
assert_contains "txt set: FIXED android" "$_tc_txt" "android"
assert_contains "txt set: FIXED gms" "$_tc_txt" "com.google.android.gms"
assert_contains "txt set: FIXED vending" "$_tc_txt" "com.android.vending"
assert_file_not_exists "txt set: staging consumed" "$_tc_staging"
assert_file_exists "txt set: backup" "${KSM_TARGETS}.bak"

# pinned suffix kept; no bare duplicate of gms
_tc_staging="$TEST_ROOT/staging_pin.txt"
printf 'com.google.android.gms?\ncom.other.app\n' > "$_tc_staging"
run_feature target.sh --set "$_tc_staging" >/dev/null
_tc_pin=$(cat "$KSM_TARGETS")
assert_contains "txt set: gms? kept" "$_tc_pin" "com.google.android.gms?"
_tc_bare_gms=$(grep -cx 'com.google.android.gms' "$KSM_TARGETS" || true)
assert_eq "txt set: no bare gms dup" "0" "$_tc_bare_gms"
assert_contains "txt set: android filled" "$_tc_pin" "android"

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

_tc_out2=$(run_feature target.sh --list-raw)
assert_contains "toml list-raw: reads scoop" "$_tc_out2" "com.google.android.gms"
assert_not_contains "toml list-raw: not target.txt" "$_tc_out2" "com.existing.app"

_tc_staging2="$TEST_ROOT/staging_toml.txt"
printf 'com.new.app?\n' > "$_tc_staging2"
run_feature target.sh --set "$_tc_staging2" >/dev/null
_tc_toml=$(cat "$OMK_INJECTOR")
assert_contains "toml set: entry added" "$_tc_toml" "com.new.app"
assert_not_contains "toml set: suffix stripped" "$_tc_toml" "com.new.app?"
assert_contains "toml set: FIXED gms" "$_tc_toml" "com.google.android.gms"
assert_contains "toml set: siblings kept" "$_tc_toml" "[main]"
assert_file_not_exists "toml set: target.txt untouched" "$TARGET_TXT"

# ---------- argument handling ----------
bootstrap
source_libs
mk_module tricky_store "Tricky Store"
detect_keystore_manager
run_feature target.sh --set "$TEST_ROOT/does_not_exist" >/dev/null 2>&1
assert_exit_code "set: missing staging file fails" 1 "$?"

done_testing
