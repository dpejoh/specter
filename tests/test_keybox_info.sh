plan "keybox_info.sh writes the detail snapshot"

bootstrap
source_libs
mk_module tricky_store "Tricky Store"
detect_keystore_manager
printf '<keybox/>\n' > "$KSM_KEYBOX"
export SPECTER_KEYBOX_INFO="$TEST_ROOT/keybox_info.json"

# Keep the network checks deterministic and offline.
check_network() { return 1; }
download() { return 1; }

run_feature keybox_info.sh >/dev/null 2>&1
assert_file_exists "keybox info written" "$SPECTER_KEYBOX_INFO"
_json=$(tr -d '\n\r' < "$SPECTER_KEYBOX_INFO")
assert_contains "keybox info: installed" "$_json" '"installed": true'
assert_contains "keybox info: checked_at" "$_json" '"checked_at":'
assert_contains "keybox info: file path" "$_json" '"file_path":'
assert_contains "keybox info: file size" "$_json" '"file_size":'
assert_contains "keybox info: revocation status" "$_json" '"revocation_status":'

# google_revocation_info returns status and reason, not just a yes/no.
ensure_dir "$SPECTER_DIR/cache"
printf '%s' '{"entries":{"10":{"status":"REVOKED","reason":"KEY_COMPROMISE"}}}' > "$SPECTER_DIR/cache/google_revocation.json"
_info=$(google_revocation_info a)
assert_eq "crl info: status and reason" "REVOKED|KEY_COMPROMISE" "$_info"

done_testing
