plan "download transport security and HTTP errors"
bootstrap
source_libs
cat > "$BIN_DIR/busybox" <<'MOCK'
#!/bin/sh
printf 'busybox called\n' >> "$TEST_ROOT/transport.log"
exit 1
MOCK
cat > "$BIN_DIR/curl" <<'MOCK'
#!/bin/sh
[ "$1" = "--version" ] && exit 0
printf '%s\n' "$*" >> "$TEST_ROOT/transport.log"
case "$*" in *-fLs*--proto-redir*=https*) ;; *) exit 2 ;; esac
while [ "$#" -gt 0 ]; do
  if [ "$1" = -o ]; then shift; out=$1; fi
  shift
done
if [ "${MOCK_HTTP_ERROR:-0}" = 1 ]; then printf '404 error' > "$out"; exit 22; fi
printf 'verified content' > "$out"
MOCK
printf '#!/bin/sh\nexit 0\n' > "$BIN_DIR/sleep"
chmod +x "$BIN_DIR/busybox" "$BIN_DIR/curl" "$BIN_DIR/sleep"
MOCK_HTTP_ERROR=0; export MOCK_HTTP_ERROR
download 'https://example.com/keybox' "$TEST_ROOT/result" ''
assert_eq "HTTPS: verified curl content" 'verified content' "$(cat "$TEST_ROOT/result")"
assert_not_contains "HTTPS: never uses busybox wget" "$(cat "$TEST_ROOT/transport.log")" 'busybox called'
assert_eq "HTTPS: temp files under SPECTER_DIR" "yes" "$([ -d "$SPECTER_DIR/tmp" ] && echo yes)"
MOCK_HTTP_ERROR=1; export MOCK_HTTP_ERROR
download 'https://example.com/missing' "$TEST_ROOT/result" ''
assert_exit_code "HTTP error: reports failure" 1 "$?"
# Android images do not ship curl: BusyBox wget is the HTTPS fallback.
rm -f "$BIN_DIR/curl"
cat > "$BIN_DIR/busybox" <<'MOCK'
#!/bin/sh
printf '%s\n' "$*" >> "$TEST_ROOT/transport.log"
while [ "$#" -gt 0 ]; do
  case "$1" in -O|-qO) shift; out=$1 ;; esac
  shift
done
printf 'busybox content' > "$out"
MOCK
chmod +x "$BIN_DIR/busybox"
download 'https://example.com/keybox' "$TEST_ROOT/result" ''
assert_eq "HTTPS without curl: busybox fallback content" 'busybox content' "$(cat "$TEST_ROOT/result")"
assert_not_contains "HTTPS without curl: certificate validation not bypassed" "$(tail -1 "$TEST_ROOT/transport.log")" '--no-check-certificate'
done_testing
