plan "keybox_watch.sh detects revocation and guards auto-replacement"

bootstrap
source_libs
ensure_dir "$SPECTER_DIR/cache"

cat > "$TEST_ROOT/fake_info.sh" <<'EOF'
#!/bin/sh
if [ -f "$SPECTER_DIR/replaced" ]; then
  printf '%s' '{"installed":true,"revoked":false,"expired":false}' > "$SPECTER_KEYBOX_INFO"
else
  printf '%s' '{"installed":true,"revoked":true,"expired":false}' > "$SPECTER_KEYBOX_INFO"
fi
EOF

cat > "$TEST_ROOT/fake_keybox.sh" <<'EOF'
#!/bin/sh
printf '%s' 'replaced' > "$SPECTER_DIR/replaced"
EOF

export SPECTER_KEYBOX_INFO="$TEST_ROOT/keybox_info.json"
export SPECTER_KEYBOX_INFO_SCRIPT="$TEST_ROOT/fake_info.sh"
export SPECTER_KEYBOX_SCRIPT="$TEST_ROOT/fake_keybox.sh"

# Healthy keybox: no replacement.
printf '%s' '{"installed":true,"revoked":false,"expired":false}' > "$SPECTER_KEYBOX_INFO"
_out=$(run_feature keybox_watch.sh 2>&1)
assert_not_contains "healthy: no replacement" "$_out" "attempting automatic replacement"
assert_file_not_exists "healthy: guard not written" "$SPECTER_DIR/cache/keybox_watch_last_replace"

# Revoked, Auto Keybox off: only a warning.
rm -f "$SPECTER_DIR/replaced" "$SPECTER_DIR/cache/keybox_watch_last_replace"
set_cfg toggle_autokeybox 0
_out=$(run_feature keybox_watch.sh 2>&1)
assert_contains "auto off: warns" "$_out" "Auto Keybox is off"
assert_file_not_exists "auto off: guard not written" "$SPECTER_DIR/cache/keybox_watch_last_replace"

# Revoked, Auto Keybox on, recent guard: no second attempt.
rm -f "$SPECTER_DIR/replaced"
set_cfg toggle_autokeybox 1
printf '%s' "$(date +%s)" > "$SPECTER_DIR/cache/keybox_watch_last_replace"
_out=$(run_feature keybox_watch.sh 2>&1)
assert_contains "guard: waits" "$_out" "already attempted recently"
assert_file_not_exists "guard: replacement skipped" "$SPECTER_DIR/replaced"

# Revoked, Auto Keybox on, stale guard: one replacement, then a fresh snapshot.
rm -f "$SPECTER_DIR/replaced"
printf '%s' "1" > "$SPECTER_DIR/cache/keybox_watch_last_replace"
_out=$(run_feature keybox_watch.sh 2>&1)
assert_contains "replace: runs" "$_out" "Replacement installed"
assert_file_exists "replace: marker written" "$SPECTER_DIR/replaced"
assert_contains "replace: snapshot refreshed" "$(cat "$SPECTER_KEYBOX_INFO")" '"revoked":false'

done_testing
