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

# --- RKP expiry ---
_RKP_PAST='{"source":"rkp","version":"1","text":"r1","rkp":true,"expires_at":"2000-01-01T00:00:00Z"}'
_RKP_LIVE='{"source":"rkp","version":"2","text":"r2","rkp":true,"expires_at":"2999-01-01T00:00:00Z"}'
_RKP_NO_DATE='{"source":"rkp","version":"3","text":"r3","rkp":true,"expires_at":null}'
_NON_RKP='{"source":"classic","version":"1","text":"c1","rkp":false}'

keybox_rkp_expired "$_RKP_PAST" "2026-01-01T00:00:00Z"
assert_eq "rkp_expired: past date" "0" "$?"
keybox_rkp_expired "$_RKP_LIVE" "2026-01-01T00:00:00Z"
assert_eq "rkp_expired: future date" "1" "$?"
keybox_rkp_expired "$_RKP_NO_DATE" "2026-01-01T00:00:00Z"
assert_eq "rkp_expired: missing date fails closed" "0" "$?"
keybox_rkp_expired "$_NON_RKP" "2026-01-01T00:00:00Z"
assert_eq "rkp_expired: non-RKP never expires" "1" "$?"

_RKP_POOL="$_RKP_PAST
$_RKP_LIVE
$_NON_RKP"
_FILTERED=$(printf '%s\n' "$_RKP_POOL" | keybox_filter_expired_rkp)
assert_contains "filter_expired: keeps live RKP" "$_FILTERED" '"version":"2"'
assert_contains "filter_expired: keeps non-RKP" "$_FILTERED" '"source":"classic"'
assert_not_contains "filter_expired: drops expired RKP" "$_FILTERED" '"expires_at":"2000-01-01T00:00:00Z"'

_RKP_FRESH='{"source":"rkp","version":"4","text":"r4","rkp":true,"expires_at":"2999-06-01T00:00:00Z"}'
_DEDUPED=$(printf '%s\n' "$_RKP_LIVE
$_RKP_FRESH
$_NON_RKP" | keybox_dedupe_rkp_freshest)
assert_contains "dedupe_rkp: keeps freshest RKP" "$_DEDUPED" '"version":"4"'
assert_not_contains "dedupe_rkp: drops older RKP" "$_DEDUPED" '"version":"2"'
assert_contains "dedupe_rkp: keeps non-RKP" "$_DEDUPED" '"source":"classic"'

_CAT_RKP='{"entries":[{"source":"rkp","version":"1","text":"r1","serial":"1","revoked":false,"softbanned":false,"rkp":true,"expires_at":"2999-01-01T00:00:00Z"},{"source":"rkp","version":"3","text":"r3","serial":"3","revoked":false,"softbanned":false,"rkp":true,"expires_at":"2998-01-01T00:00:00Z"},{"source":"rkp","version":"2","text":"r2","serial":"2","revoked":false,"softbanned":false,"rkp":true,"expires_at":"2000-01-01T00:00:00Z"}]}'
_ver_rkp=$(keybox_latest_for_provider "$_CAT_RKP" "rkp")
assert_eq "latest_for_provider: skips expired RKP and picks latest expiry" "1" "$_ver_rkp"

assert_eq "hex_to_dec: issue serial" "3207438651777393527" "$(hex_to_dec 2c831c75c60ca377)"
assert_eq "hex_to_dec: 128-bit serial" "313574063671127819551733845561321004702" "$(hex_to_dec ebe82afb8b019ca17bed42839ba51e9e)"

_dl_count="$TEST_ROOT/downloads"
: > "$_dl_count"
download() { echo x >> "$_dl_count"; printf '%s' "$_CATALOG"; }
_cat1=$(keybox_catalog)
_cat2=$(keybox_catalog)
assert_contains "catalog cache: content" "$_cat2" '"droidwin"'
assert_eq "catalog cache: one download" "1" "$(grep -c x "$_dl_count")"

# --- catalog: an error body must never poison the last-known-good cache ---
ensure_dir "$SPECTER_DIR/cache"
printf '%s' '{"entries":[{"source":"cached","version":"1","text":"v1"}]}' > "$SPECTER_DIR/cache/keybox_catalog.json"
touch -d '1 hour ago' "$SPECTER_DIR/cache/keybox_catalog.json"
download() { printf '%s' '{"error":"D1 limit exceeded"}'; }
_cat_stale=$(keybox_catalog)
assert_contains "catalog cache: error keeps last-known-good" "$_cat_stale" '"source":"cached"'
assert_contains "catalog cache: cache not overwritten by error" "$(cat "$SPECTER_DIR/cache/keybox_catalog.json")" '"source":"cached"'

: > "$_dl_count"
download() { echo x >> "$_dl_count"; printf '%s' '{"entries":{"10":{"status":"REVOKED"},"3207438651777393527":{"status":"REVOKED"},"806b52bbc8ddb62a5f43742401412562":{"status":"REVOKED"}}}'; }
check_google_revocation 2c831c75c60ca377
assert_eq "crl: issue serial is revoked" "0" "$?"
check_google_revocation a
assert_eq "crl: hex a is decimal 10" "0" "$?"
check_google_revocation 806b52bbc8ddb62a5f43742401412562
assert_eq "crl: hex string serial is revoked" "0" "$?"
check_google_revocation ff
assert_eq "crl: unlisted serial is not revoked" "1" "$?"
assert_eq "crl cache: one download" "1" "$(grep -c x "$_dl_count")"

# --- keybox.sh --if-needed skips a healthy installed keybox ---
bootstrap
source_libs
ln -sf /usr/bin/od "$BIN_DIR/od"
mk_module tricky_store "Tricky Store"
detect_keystore_manager
openssl req -x509 -newkey rsa:2048 -nodes -keyout "$TEST_ROOT/key.pem" -out "$KSM_KEYBOX" -days 2 -subj '/CN=test' >/dev/null 2>&1
_ki_info="$TEST_ROOT/keybox_info.json"
printf '{\n  "installed": true,\n  "source": "TAKR",\n  "source_version": "32",\n  "revoked": false,\n  "softbanned": false\n}\n' > "$_ki_info"
sleep 1
touch "$_ki_info"
export SPECTER_KEYBOX_INFO="$_ki_info"
_out=$(run_feature keybox.sh --if-needed)
assert_contains "if-needed: healthy keybox skipped" "$_out" "Current keybox is healthy, skipping refresh"
_out_info=$(run_feature keybox_info.sh --if-needed)
assert_contains "if-needed: current info skipped" "$_out_info" "Keybox info is current, skipping refresh"
unset SPECTER_KEYBOX_INFO

# --- expired RKP info must not be treated as healthy ---
bootstrap
source_libs
ln -sf /usr/bin/od "$BIN_DIR/od"
mk_module tricky_store "Tricky Store"
detect_keystore_manager
openssl req -x509 -newkey rsa:2048 -nodes -keyout "$TEST_ROOT/key.pem" -out "$KSM_KEYBOX" -days 2 -subj '/CN=test' >/dev/null 2>&1
_ki_expired="$TEST_ROOT/keybox_info_expired.json"
printf '{\n  "installed": true,\n  "source": "TAKR",\n  "source_version": "36",\n  "rkp": true,\n  "expires_at": "2000-01-01T00:00:00Z",\n  "expired": true\n}\n' > "$_ki_expired"
sleep 1
touch "$_ki_expired"
export SPECTER_KEYBOX_INFO="$_ki_expired"
_out_expired=$(run_feature keybox_info.sh --if-needed)
assert_not_contains "if-needed: expired RKP info is refreshed" "$_out_expired" "Keybox info is current, skipping refresh"
unset SPECTER_KEYBOX_INFO

_ki_live="$TEST_ROOT/keybox_info_live.json"
printf '{\n  "installed": true,\n  "source": "TAKR",\n  "source_version": "36",\n  "rkp": true,\n  "expires_at": "2999-01-01T00:00:00Z",\n  "expired": false\n}\n' > "$_ki_live"
sleep 1
touch "$_ki_live"
export SPECTER_KEYBOX_INFO="$_ki_live"
_out_live=$(run_feature keybox_info.sh --if-needed)
assert_contains "if-needed: live RKP info is current" "$_out_live" "Keybox info is current, skipping refresh"
unset SPECTER_KEYBOX_INFO

# --- keybox_select_entry: only active entries are selectable ---
_SEL_CAT='{"entries":[{"source":"droidwin","version":"1","text":"v1","revoked":false,"softbanned":false},{"source":"droidwin","version":"2","text":"v2","revoked":false,"softbanned":true},{"source":"droidwin","version":"3","text":"v3","revoked":true,"softbanned":false},{"source":"rkp","version":"4","text":"r4","revoked":false,"softbanned":false,"rkp":true,"expires_at":"2000-01-01T00:00:00Z"},{"source":"rkp","version":"5","text":"r5","revoked":false,"softbanned":false,"rkp":true,"expires_at":"2999-01-01T00:00:00Z"}]}'
_sel_active=$(keybox_select_entry "$_SEL_CAT" droidwin 1)
assert_contains "select_entry: active entry" "$_sel_active" '"version":"1"'
_sel_revoked=$(keybox_select_entry "$_SEL_CAT" droidwin 3)
assert_eq "select_entry: revoked entry rejected" "" "$_sel_revoked"
_sel_soft=$(keybox_select_entry "$_SEL_CAT" droidwin 2)
assert_eq "select_entry: softbanned entry rejected" "" "$_sel_soft"
_sel_expired=$(keybox_select_entry "$_SEL_CAT" rkp 4)
assert_eq "select_entry: expired RKP rejected" "" "$_sel_expired"
_sel_rkp=$(keybox_select_entry "$_SEL_CAT" rkp 5)
assert_contains "select_entry: live RKP accepted" "$_sel_rkp" '"version":"5"'

done_testing
