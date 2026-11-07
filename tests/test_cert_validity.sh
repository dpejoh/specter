plan "keybox certificate validity"
bootstrap
source_libs
ln -sf /usr/bin/od "$BIN_DIR/od"
openssl req -x509 -newkey rsa:2048 -nodes -keyout "$TEST_ROOT/key.pem" -out "$TEST_ROOT/cert.pem" -days 2 -subj '/CN=test' >/dev/null 2>&1
assert_eq "certificate: valid today" "valid" "$(keybox_cert_validity "$TEST_ROOT/cert.pem")"
assert_eq "certificate: not yet valid" "not_yet_valid" "$(keybox_cert_validity "$TEST_ROOT/cert.pem" 20000101000000)"
assert_eq "certificate: expired" "expired" "$(keybox_cert_validity "$TEST_ROOT/cert.pem" 20990101000000)"
printf '%s\n' '-----BEGIN CERTIFICATE-----' 'broken' '-----END CERTIFICATE-----' > "$TEST_ROOT/broken.pem"
assert_eq "certificate: malformed rejected" "unknown" "$(keybox_cert_validity "$TEST_ROOT/broken.pem")"
cat "$TEST_ROOT/cert.pem" "$TEST_ROOT/broken.pem" > "$TEST_ROOT/chain.pem"
assert_eq "certificate: malformed chain rejected" "unknown" "$(keybox_cert_validity "$TEST_ROOT/chain.pem")"
mk_module tricky_store "Tricky Store"
detect_keystore_manager
cp "$TEST_ROOT/cert.pem" "$KSM_KEYBOX"
export SPECTER_KEYBOX_INFO="$TEST_ROOT/info.json"
run_feature keybox_info.sh >/dev/null 2>&1
assert_contains "installed certificate validity reported" "$(cat "$SPECTER_KEYBOX_INFO")" '"cert_validity": "valid"'
cat > "$BIN_DIR/date" <<'MOCK'
#!/bin/sh
if [ "$*" = '-u +%Y%m%d%H%M%S' ]; then echo 20990101000000; else exec /bin/date "$@"; fi
MOCK
chmod +x "$BIN_DIR/date"
run_feature keybox_info.sh >/dev/null 2>&1
assert_contains "expired installed certificate reported" "$(cat "$SPECTER_KEYBOX_INFO")" '"expired": true'
assert_contains "expired certificate status reported" "$(cat "$SPECTER_KEYBOX_INFO")" '"cert_validity": "expired"'
rm -f "$BIN_DIR/date"
cp "$TEST_ROOT/broken.pem" "$KSM_KEYBOX"
run_feature keybox_info.sh >/dev/null 2>&1
assert_contains "invalid installed certificate is unknown" "$(cat "$SPECTER_KEYBOX_INFO")" '"cert_validity": "unknown"'
done_testing
