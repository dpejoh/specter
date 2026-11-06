plan "setup_info.sh produces a redacted, valid setup snapshot"

bootstrap
source_libs

mk_module tricky_store "Tricky Store"
printf 'name=Tricky Store\nversion=1.2.3\n' > "$MODULES_BASE/tricky_store/module.prop"
printf 'com.example.one\ncom.example.two\n' > "$TRICKY_DIR/target.txt"
printf '2026-10-05\n' > "$TRICKY_DIR/security_patch.txt"

mk_module playintegrityfix "Play Integrity Fix"
printf 'name=Play Integrity Fix\nversion=2.0.0\n' > "$MODULES_BASE/playintegrityfix/module.prop"
printf 'MODEL=Pixel 8 Pro\nMANUFACTURER=Google\nFINGERPRINT=google/husky/husky:17/CP1A/123:user/release-keys\n' > "$PIF_DIR/custom.pif.prop"

mk_module zygisksu "Zygisk Next"
printf 'name=Zygisk Next\nversion=1.0.0\n' > "$MODULES_BASE/zygisksu/module.prop"

export HMAOSS_BASE="$TEST_ROOT/misc"
mkdir -p "$HMAOSS_BASE/hide_my_applist_test"
printf '%s' '{"templates":{"Hide List":{"isWhitelist":false,"appList":["com.example.hidden"]}}}' > "$HMAOSS_BASE/hide_my_applist_test/config.json"

set_prop ro.build.version.release 17
set_prop ro.build.version.security_patch 2026-10-05
export SPECTER_SETUP_INFO="$TEST_ROOT/setup_info.json"

run_feature setup_info.sh >/dev/null 2>&1
assert_file_exists "setup JSON written" "$SPECTER_SETUP_INFO"

_py_ok=0
python3 - "$SPECTER_SETUP_INFO" <<'PY'
import json, sys
p = sys.argv[1]
data = json.load(open(p))
assert data['device']['android'] == '17', data['device']
assert '/data/adb/' not in json.dumps(data), 'paths leaked into setup snapshot'
assert any(m['id'] == 'keystore' and m['version'] == '1.2.3' for m in data['modules'])
pif = next(m for m in data['modules'] if m['id'] == 'pif')
assert any(r['label'] == 'Spoofed device' for r in pif['rows']), pif
assert not any(r['label'] in ('Model', 'Manufacturer') for r in pif['rows']), pif
assert 'spoofed_device' not in data['device'], data['device']
assert any(m['id'] == 'hma' for m in data['modules'])
assert any('Auto Target' in f['label'] for f in data['features'])
assert any('Auto PIF' in f['label'] for f in data['features'])
assert any('Auto HMA' in f['label'] for f in data['features'])
PY
_py_ok=$?
assert_eq "setup JSON shape and values" "0" "$_py_ok"

# Missing optional modules are omitted, matching the Tools page.
rm -rf "$MODULES_BASE/playintegrityfix" "$HMAOSS_BASE/hide_my_applist_test"
run_feature setup_info.sh >/dev/null 2>&1
_py_hidden=0
python3 - "$SPECTER_SETUP_INFO" <<'PY'
import json, sys
data = json.load(open(sys.argv[1]))
ids = {m['id'] for m in data['modules']}
assert 'pif' not in ids, ids
assert 'hma' not in ids, ids
labels = {f['label'] for f in data['features']}
assert 'Auto PIF' not in labels, labels
assert 'Auto HMA config' not in labels, labels
PY
_py_hidden=$?
assert_eq "missing optional modules hidden" "0" "$_py_hidden"

# The snapshot must never contain keybox or module secret material.
mkdir -p "$SPECTER_DIR"
printf '%s' '<Keybox><PrivateKey>SECRET_KEYBOX_MARKER</PrivateKey></Keybox>' > "$TRICKY_DIR/keybox.xml"
run_feature setup_info.sh >/dev/null 2>&1
if grep -q 'SECRET_KEYBOX_MARKER' "$SPECTER_SETUP_INFO"; then
  fail "setup JSON redacts keybox material"
else
  ok "setup JSON redacts keybox material"
fi

# OMK crypto values must never be emitted either.
bootstrap
source_libs
mk_module oh_my_keymint "OhMyKeymint"
printf 'name=OhMyKeymint\nversion=3.0.0\n' > "$MODULES_BASE/oh_my_keymint/module.prop"
mkdir -p "$OMK_DIR"
printf '%s\n' 'version = 3' '[main]' 'log_level = "info"' '[crypto]' 'root_kek_seed = "SECRET_OMK_MARKER"' '[trust]' 'os_version = 17' 'security_patch = "2026-10-05"' > "$OMK_CONFIG"
printf '%s\n' 'scoop = [' '  "com.example.one",' ']' > "$OMK_INJECTOR"
printf '%s' '<Keybox/>' > "$OMK_KEYBOX"
export SPECTER_SETUP_INFO="$TEST_ROOT/setup_info_omk.json"
run_feature setup_info.sh >/dev/null 2>&1
if grep -q 'SECRET_OMK_MARKER' "$SPECTER_SETUP_INFO"; then
  fail "setup JSON redacts OMK crypto"
else
  ok "setup JSON redacts OMK crypto"
fi

done_testing
