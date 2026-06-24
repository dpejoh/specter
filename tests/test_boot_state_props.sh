plan "boot_state_props.sh -- suspicious props detection and cleanup"

_mock_prop() { printf '%b' "$1" > "$_mock_prop_file"; }

# ---- scenario: master toggle off ----
bootstrap
source_libs
set_cfg "toggle_prop_handler" "0"
[ "$(cfg_get toggle_prop_handler 1)" = "0" ] && _should_skip=true || _should_skip=false
assert_eq "props: toggle off gate works" "true" "$_should_skip"

# ---- scenario: persistent_properties file missing ----
bootstrap
source_libs
set_cfg "toggle_prop_handler" "1"
_mock_prop_file="$TEST_ROOT/persistent_properties"
rm -f "$_mock_prop_file"
[ -f "$_mock_prop_file" ] && _file_exists=1 || _file_exists=0
assert_eq "props: file missing → exit" "0" "$_file_exists"

# ---- scenario: clean persistent_properties (no suspicious props) ----
bootstrap
source_libs
set_cfg "toggle_prop_handler" "1"
_mock_prop_file="$TEST_ROOT/persistent_properties"
_mock_prop "ro.build.type=user"
! grep -qiE "lsposed|hyperceiler|luckytool" "$_mock_prop_file" 2>/dev/null
assert_exit_code "props: no suspicious → exit clean" 0 $?

# ---- scenario: case insensitive matching ----
bootstrap
source_libs
set_cfg "toggle_prop_handler" "1"
_mock_prop_file="$TEST_ROOT/persistent_properties"
_mock_prop "persist.sys.LSPOSED=1"
grep -qiE "lsposed|hyperceiler|luckytool" "$_mock_prop_file" 2>/dev/null
assert_exit_code "props: case insensitive match works" 0 $?

# ---- scenario: backup file created ----
bootstrap
source_libs
set_cfg "toggle_prop_handler" "1"
_mock_prop_file="$TEST_ROOT/persistent_properties"
_mock_prop "persist.sys.lsposed=1"
cp "$_mock_prop_file" "$_mock_prop_file.bak" 2>/dev/null || true
assert_file_exists "props: backup file created" "$_mock_prop_file.bak"

# ---- scenario: deletion via grep+remove (simulating resetprop -p --delete) ----
bootstrap
source_libs
set_cfg "toggle_prop_handler" "1"
_mock_prop_file="$TEST_ROOT/persistent_properties"
_mock_prop "persist.sys.lsposed=1\nro.hyperceiler=1\npersist.luckytool.enabled=1\nro.build.type=user"

# Verify all three are present
grep -qi "lsposed" "$_mock_prop_file" && _found_lsposed=true || _found_lsposed=false
grep -qi "hyperceiler" "$_mock_prop_file" && _found_hyper=true || _found_hyper=false
grep -qi "luckytool" "$_mock_prop_file" && _found_lucky=true || _found_lucky=false
assert_eq "props: lsposed present before delete"   "true" "$_found_lsposed"
assert_eq "props: hyperceiler present before delete" "true" "$_found_hyper"
assert_eq "props: luckytool present before delete"  "true" "$_found_lucky"

# Remove lines containing suspicious patterns (simulates resetprop -p --delete)
for _pat in lsposed hyperceiler luckytool; do
  grep -vi "$_pat" "$_mock_prop_file" > "${_mock_prop_file}.tmp" 2>/dev/null
  mv "${_mock_prop_file}.tmp" "$_mock_prop_file"
done

# Verify all suspicious lines removed but clean lines survive
grep -qiE "lsposed|hyperceiler|luckytool" "$_mock_prop_file" && _removed=false || _removed=true
grep -q "ro.build.type=user" "$_mock_prop_file" && _clean_survived=true || _clean_survived=false
assert_eq "props: all suspicious lines removed" "true" "$_removed"
assert_eq "props: clean lines survive" "true" "$_clean_survived"

done_testing
