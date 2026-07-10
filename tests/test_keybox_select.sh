plan "keybox selection prefers active over softbanned"

bootstrap
source_libs

_CATALOG='{"entries":[{"source":"droidwin","version":"1","text":"v1","serial":"12345","revoked":false,"softbanned":false},{"source":"droidwin","version":"2","text":"v2","serial":"67890","revoked":false,"softbanned":true},{"source":"yuri","version":"8","text":"v8","serial":"11111","revoked":false,"softbanned":true}],"working":{"source":"droidwin","version":"1"},"workingEntries":[{"source":"droidwin","version":"1","text":"v1"},{"source":"droidwin","version":"2","text":"v2"},{"source":"yuri","version":"8","text":"v8"}]}'

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

# --- keybox_latest_for_provider: skips softbanned latest ---
_ver=$(keybox_latest_for_provider "$_CATALOG" "droidwin")
assert_eq "latest_for_provider: prefers active over newer softbanned" "1" "$_ver"

# --- keybox_latest_for_provider: softbanned-only provider ---
_ver_yuri=$(keybox_latest_for_provider "$_CATALOG" "yuri")
assert_eq "latest_for_provider: softbanned when no active" "8" "$_ver_yuri"

done_testing
