plan "boot_hash.sh — TEE attestation and boot hash resolution"

_setup_boot_hash_env() {
  bootstrap
  source_libs
  rm -f "$BIN_DIR/od"
  ln -s /usr/bin/od "$BIN_DIR/od"
  cat > "$BIN_DIR/app_process" << 'MOCK'
#!/bin/sh
if [ -n "$MOCK_TEE_HASH" ]; then
  echo "$MOCK_TEE_HASH"
  exit 0
else
  exit 1
fi
MOCK
  chmod +x "$BIN_DIR/app_process"
  export SPECTER_DEX="$TEST_ROOT/deps/classes.dex"
}

# ---- Test 1: Cache hit (Priority 1) ----
_setup_boot_hash_env
_cached_val="1122334455667788990011223344556677889900112233445566778899001122"
printf '%s' "$_cached_val" > "$SPECTER_DIR/boot_hash"
export MOCK_TEE_HASH="9999999999999999999999999999999999999999999999999999999999999999"

run_feature "boot_hash.sh" >/dev/null

assert_prop_eq "boot_hash: cache takes priority on normal boot" "ro.boot.vbmeta.digest" "$_cached_val"
assert_file_eq "boot_hash: cached value preserved" "$SPECTER_DIR/boot_hash" "$_cached_val"

# ---- Test 2: TEE attestation when cache is missing (Priority 2) ----
_setup_boot_hash_env
mkdir -p "$TEST_ROOT/deps"
touch "$TEST_ROOT/deps/classes.dex"
rm -f "$SPECTER_DIR/boot_hash"
export MOCK_TEE_HASH="0d3cbbb6ea69c34ffcba2b1c36e4f66cdd34823383bd9f67d9f1b469e21785ab"

run_feature "boot_hash.sh" >/dev/null

assert_prop_eq "boot_hash: TEE hash applied when cache missing" "ro.boot.vbmeta.digest" "$MOCK_TEE_HASH"
assert_file_eq "boot_hash: TEE hash cached to specter/boot_hash" "$SPECTER_DIR/boot_hash" "$MOCK_TEE_HASH"

# ---- Test 3: --refresh flag bypasses cache and re-probes TEE ----
_setup_boot_hash_env
mkdir -p "$TEST_ROOT/deps"
touch "$TEST_ROOT/deps/classes.dex"
printf '%s' "old_stale_hash_value_111111111111111111111111111111111111111111111111" > "$SPECTER_DIR/boot_hash"
export MOCK_TEE_HASH="0d3cbbb6ea69c34ffcba2b1c36e4f66cdd34823383bd9f67d9f1b469e21785ab"

run_feature "boot_hash.sh" "--refresh" >/dev/null

assert_prop_eq "boot_hash: --refresh bypasses cache and sets TEE hash" "ro.boot.vbmeta.digest" "$MOCK_TEE_HASH"
assert_file_eq "boot_hash: cache updated with new TEE hash" "$SPECTER_DIR/boot_hash" "$MOCK_TEE_HASH"

# ---- Test 4: Existing prop fallback when TEE returns zeros (Priority 3) ----
_setup_boot_hash_env
mkdir -p "$TEST_ROOT/deps"
touch "$TEST_ROOT/deps/classes.dex"
rm -f "$SPECTER_DIR/boot_hash"
export MOCK_TEE_HASH="0000000000000000000000000000000000000000000000000000000000000000"
_prop_val="aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899"
set_prop "ro.boot.vbmeta.digest" "$_prop_val"

run_feature "boot_hash.sh" >/dev/null

assert_prop_eq "boot_hash: existing prop kept when TEE returns zero" "ro.boot.vbmeta.digest" "$_prop_val"
assert_file_eq "boot_hash: prop cached to specter/boot_hash" "$SPECTER_DIR/boot_hash" "$_prop_val"

# ---- Test 5: Fallback random generation when nothing exists (Priority 4) ----
_setup_boot_hash_env
unset MOCK_TEE_HASH
rm -f "$TEST_ROOT/deps/classes.dex"
rm -f "$SPECTER_DIR/boot_hash"

run_feature "boot_hash.sh" >/dev/null

_gen_prop=$(prop_value "ro.boot.vbmeta.digest")
assert_eq "boot_hash: generated hash length is 64" "64" "${#_gen_prop}"
assert_file_eq "boot_hash: generated hash cached" "$SPECTER_DIR/boot_hash" "$_gen_prop"

done_testing
