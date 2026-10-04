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

assert_eq "hex_to_dec: issue serial" "3207438651777393527" "$(hex_to_dec 2c831c75c60ca377)"
download() { printf '%s' '{"entries":{"10":{"status":"REVOKED"},"3207438651777393527":{"status":"REVOKED"}}}'; }
check_google_revocation 2c831c75c60ca377
assert_eq "crl: issue serial is revoked" "0" "$?"
check_google_revocation a
assert_eq "crl: hex a is decimal 10" "0" "$?"
check_google_revocation 10
assert_eq "crl: hex 10 is not decimal 10" "1" "$?"

done_testing
