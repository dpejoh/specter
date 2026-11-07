plan "modules state snapshot"

bootstrap
mkdir -p "$TEST_ROOT/webroot/json"
cp "$REPO_ROOT/src/config/conflicts.txt" "$CONFIG_DIR/conflicts.txt"
mk_module playintegrityfix "Play Integrity Fix"
mk_module hma_oss "HMA-OSS"
mk_module teesim "TEESimulator"
export SPECTER_MODULES_STATE="$TEST_ROOT/webroot/json/modules_state.json"

run_feature modules_state.sh

OUT="$TEST_ROOT/webroot/json/modules_state.json"
_snapshot=$(cat "$OUT" 2>/dev/null || true)

assert_file_exists "snapshot file written" "$OUT"
assert_contains "installed module listed" "$_snapshot" '"playintegrityfix":true'
assert_contains "second installed module listed" "$_snapshot" '"hma_oss":true'
assert_contains "passive conflict listed" "$_snapshot" '"key":"teesim"'
assert_contains "conflict ownership included" "$_snapshot" '"prioritySpecter":true'
assert_not_contains "absent module omitted" "$_snapshot" '"zygisksu":true'
assert_contains "snapshot timestamp included" "$_snapshot" '"checked_at"'

# The combined state.json must carry the module snapshot too.
( MODDIR='' MODULE_ROOT="$REPO_ROOT/src" . "$REPO_ROOT/src/lib/common.sh"; MODULE_ROOT="$TEST_ROOT"; write_webui_state )
_state=$(cat "$TEST_ROOT/webroot/json/state.json" 2>/dev/null || true)
assert_contains "state.json carries modules" "$_state" '"modules":'
assert_contains "state.json carries installed module" "$_state" '"playintegrityfix":true'

done_testing
