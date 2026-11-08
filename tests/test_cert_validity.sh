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
# Minified keybox XML: PEM markers share lines with tags and each other.
{ printf '%s' '<AndroidAttestation><Keybox><Key algorithm="ecdsa"><CertificateChain><Certificate format="pem">-----BEGIN CERTIFICATE-----'; sed '1d;$d' "$TEST_ROOT/cert.pem" | tr -d '\n'; printf '%s' '-----END CERTIFICATE-----</Certificate></CertificateChain></Key></Keybox></AndroidAttestation>'; } > "$TEST_ROOT/minified.xml"
assert_eq "certificate: minified xml layout" "valid" "$(keybox_cert_validity "$TEST_ROOT/minified.xml")"
# An expired self-signed root must not condemn a chain whose leaf is valid.
openssl req -x509 -newkey rsa:2048 -nodes -keyout "$TEST_ROOT/ca.key" -out "$TEST_ROOT/ca.pem" -days 1 -subj '/CN=root' >/dev/null 2>&1
openssl req -newkey rsa:2048 -nodes -keyout "$TEST_ROOT/leaf.key" -out "$TEST_ROOT/leaf.csr" -subj '/CN=leaf' >/dev/null 2>&1
openssl x509 -req -in "$TEST_ROOT/leaf.csr" -CA "$TEST_ROOT/ca.pem" -CAkey "$TEST_ROOT/ca.key" -CAcreateserial -out "$TEST_ROOT/leaf.pem" -days 3650 >/dev/null 2>&1
cat "$TEST_ROOT/leaf.pem" "$TEST_ROOT/ca.pem" > "$TEST_ROOT/rootchain.pem"
assert_eq "certificate: expired root, valid leaf" "valid" "$(keybox_cert_validity "$TEST_ROOT/rootchain.pem" "$(date -u -d '+2 days' +%Y%m%d%H%M%S)")"
# But an expired leaf under a still-valid root is expired.
openssl req -x509 -newkey rsa:2048 -nodes -keyout "$TEST_ROOT/ca2.key" -out "$TEST_ROOT/ca2.pem" -days 12000 -subj '/CN=root2' >/dev/null 2>&1
openssl x509 -req -in "$TEST_ROOT/leaf.csr" -CA "$TEST_ROOT/ca2.pem" -CAkey "$TEST_ROOT/ca2.key" -CAcreateserial -out "$TEST_ROOT/leaf2.pem" -days 3650 >/dev/null 2>&1
cat "$TEST_ROOT/leaf2.pem" "$TEST_ROOT/ca2.pem" > "$TEST_ROOT/leafchain.pem"
assert_eq "certificate: expired leaf, valid root" "expired" "$(keybox_cert_validity "$TEST_ROOT/leafchain.pem" "$(date -u -d '+20 years' +%Y%m%d%H%M%S)")"
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
