plan "keybox selection prefers active over softbanned"

bootstrap
source_libs

_CATALOG='{"entries":[{"source":"droidwin","version":"1","text":"v1","serial":"12345","revoked":false,"softbanned":false},{"source":"droidwin","version":"2","text":"v2","serial":"67890","revoked":false,"softbanned":true},{"source":"droidwin","version":"3","text":"v3","serial":"99999","revoked":true,"softbanned":false},{"source":"yuri","version":"8","text":"v8","serial":"11111","revoked":false,"softbanned":true},{"source":"badprov","version":"1","text":"v1","serial":"00000","revoked":true,"softbanned":false}],"working":{"source":"droidwin","version":"1"},"workingEntries":[{"source":"droidwin","version":"1","text":"v1"},{"source":"droidwin","version":"2","text":"v2"},{"source":"yuri","version":"8","text":"v8"}]}'

# --- keybox_is_softbanned ---
keybox_is_softbanned "$_CATALOG" "droidwin" "2"
_rc=$?
assert_eq "is_softbanned: droidwin/2" "0" "$_rc"

keybox_is_softbanned "$_CATALOG" "droidwin" "1"
_rc=$?
assert_eq "is_softbanned: droidwin/1 active" "1" "$_rc"

# --- keybox_prefer_active: mix of active + softbanned -> only active ---
_wk='{"source":"droidwin","version":"1","text":"v1"}
{"source":"droidwin","version":"2","text":"v2"}
{"source":"yuri","version":"8","text":"v8"}'
_pool=$(printf '%s\n' "$_wk" | keybox_prefer_active "$_CATALOG")
assert_contains "prefer_active: keeps active" "$_pool" '"version":"1"'
assert_not_contains "prefer_active: drops softbanned droidwin/2" "$_pool" '"version":"2"'
assert_not_contains "prefer_active: drops softbanned yuri/8" "$_pool" '"version":"8"'

# --- keybox_prefer_active: only softbanned -> softbanned ok ---
_wk_soft='{"source":"droidwin","version":"2","text":"v2"}
{"source":"yuri","version":"8","text":"v8"}'
_pool_soft=$(printf '%s\n' "$_wk_soft" | keybox_prefer_active "$_CATALOG")
assert_contains "prefer_active fallback: softbanned kept" "$_pool_soft" '"version":"2"'
assert_contains "prefer_active fallback: both softbanned kept" "$_pool_soft" '"version":"8"'

# --- keybox_latest_for_provider: skips softbanned and revoked latest ---
_ver=$(keybox_latest_for_provider "$_CATALOG" "droidwin")
assert_eq "latest_for_provider: prefers active over newer softbanned and revoked" "1" "$_ver"

# --- keybox_latest_for_provider: softbanned-only provider ---
_ver_yuri=$(keybox_latest_for_provider "$_CATALOG" "yuri")
assert_eq "latest_for_provider: softbanned when no active" "8" "$_ver_yuri"

# --- keybox_latest_for_provider: all revoked provider returns empty ---
_ver_bad=$(keybox_latest_for_provider "$_CATALOG" "badprov")
assert_eq "latest_for_provider: empty when all revoked" "" "$_ver_bad"

_entries='{"source":"first","version":"1"}
{"source":"second","version":"2"}
{"source":"third","version":"3"}'
assert_eq "entry selection: first" '{"source":"first","version":"1"}' "$(keybox_select_entry "$_entries" 1)"
assert_eq "entry selection: third" '{"source":"third","version":"3"}' "$(keybox_select_entry "$_entries" 3)"
assert_eq "entry selection: out of bounds" "" "$(keybox_select_entry "$_entries" 4)"
keybox_select_entry "$_entries" nope >/dev/null
assert_eq "entry selection: rejects invalid index" 1 "$?"

cat > "$BIN_DIR/busybox" << 'EOF'
#!/bin/sh
exit 1
EOF
cat > "$BIN_DIR/curl" << 'EOF'
#!/bin/sh
if [ "$1" = "--version" ]; then
  echo "curl 8"
  exit 0
fi
_out="" _prev="" _saw_f=0
for _a in "$@"; do
  [ "$_prev" = "-o" ] && _out=$_a
  case "$_a" in
    -fLs|-fsSL) _saw_f=1 ;;
  esac
  _prev=$_a
done
if [ "$_saw_f" -ne 1 ]; then
  echo "curl invoked without -f" >&2
  exit 2
fi
if [ "${CURL_FAIL:-}" = 1 ]; then
  printf '%s\n' "error-body" > "$_out"
  printf '%s' "404"
  exit 22
fi
printf '%s' "catalog-ok" > "$_out"
printf '%s' "200"
exit 0
EOF
chmod +x "$BIN_DIR/busybox" "$BIN_DIR/curl"
_dl_body=$(download "http://example.test/catalog")
assert_eq "download: success returns body" "catalog-ok" "$_dl_body"

assert_eq "hex_to_dec: issue serial" "3207438651777393527" "$(hex_to_dec 2c831c75c60ca377)"
download() { printf '%s' '{"entries":{"10":{"status":"REVOKED"},"3207438651777393527":{"status":"REVOKED"}}}'; }
check_google_revocation 2c831c75c60ca377
assert_eq "crl: issue serial is revoked" "0" "$?"
check_google_revocation a
assert_eq "crl: hex a is decimal 10" "0" "$?"
check_google_revocation 10
assert_eq "crl: hex 10 is not decimal 10" "1" "$?"

printf '%s\n' '#!/bin/sh' 'exit 0' > "$BIN_DIR/ping"
chmod +x "$BIN_DIR/ping"
export CURL_FAIL=1
mk_module tricky_store "Tricky Store"
mkdir -p "$TRICKY_DIR"
printf '%s\n' android > "$TRICKY_DIR/target.txt"
_kb_out=$(run_feature keybox.sh || true)
assert_contains "download: http failure reports curl status" "$_kb_out" "curl_rc=22"
assert_contains "download: http failure reports http status" "$_kb_out" "http=404"
assert_contains "download: catalog failure still falls back" "$_kb_out" "Catalog fetch failed"
assert_not_contains "download: http body is not the catalog" "$_kb_out" "error-body"
unset CURL_FAIL

done_testing
