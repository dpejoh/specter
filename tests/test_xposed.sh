plan "xposed_scan.sh — Xposed module scan + cache"

bootstrap
source_libs

printf 'fake dex\n' > "$TEST_ROOT/fake.dex"
export SPECTER_DEX="$TEST_ROOT/fake.dex"

cat > "$BIN_DIR/app_process" << 'MOCK'
#!/bin/sh
LOGS_DIR="${MOCK_DIR}/logs"; mkdir -p "$LOGS_DIR"
echo "RUN" >> "$LOGS_DIR/app_process.log"
printf 'com.example.module\txposedmodule\n'
printf 'com.other.module\txposedmodule,xposedscope\n'
printf 'com.libxposed.module\tlibxposed\n'
MOCK
chmod +x "$BIN_DIR/app_process"

_out=$(run_feature xposed_scan.sh)
assert_contains "scan: first module" "$_out" "com.example.module"
assert_contains "scan: metadata keys" "$_out" "xposedmodule,xposedscope"
assert_contains "scan: libxposed module" "$_out" "com.libxposed.module"
assert_file_exists "scan: cache written" "$SPECTER_DIR/cache/xposed_modules"
assert_eq "scan: app_process ran once" "1" "$(grep -c RUN "$LOGS_DIR/app_process.log")"

_out2=$(run_feature xposed_scan.sh)
assert_contains "scan: cache hit output" "$_out2" "com.example.module"
assert_eq "scan: cache avoided app_process" "1" "$(grep -c RUN "$LOGS_DIR/app_process.log")"

run_feature xposed_scan.sh --refresh >/dev/null
assert_eq "scan: refresh reran app_process" "2" "$(grep -c RUN "$LOGS_DIR/app_process.log")"

cat > "$BIN_DIR/pm" << 'MOCK'
#!/bin/sh
printf 'package:com.example.module\n'
MOCK
chmod +x "$BIN_DIR/pm"
run_feature xposed_scan.sh >/dev/null
assert_eq "scan: package change reran app_process" "3" "$(grep -c RUN "$LOGS_DIR/app_process.log")"

printf 'updated dex\n' > "$TEST_ROOT/fake.dex"
run_feature xposed_scan.sh >/dev/null
assert_eq "scan: dex change reran app_process" "4" "$(grep -c RUN "$LOGS_DIR/app_process.log")"

done_testing
