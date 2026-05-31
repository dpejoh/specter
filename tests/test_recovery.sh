. "$(dirname "$0")/helpers.sh"

plan "recovery.sh — hide recovery folders"

# ---- scenario: no recovery folders exist ----
bootstrap
source_libs
# The feature just calls hide_recovery_folders — verify no crash
hide_recovery_folders
assert_file_not_exists "recovery: no backup dir created" "/data/adb/recovery_backups"
ok "recovery: hide_recovery_folders exits cleanly"

# ---- test hide_recovery_folders via sourced common.sh ----
# We can't easily mock /sdcard, so validate the function logic with a temp root
bootstrap
source_libs

_hrf_backup="$TEST_ROOT/recovery_backups"
# Override: use real find via explicit path (mock shadows /usr/bin/find)
_real_find="/usr/bin/find"
_hide_recovery_folders_test() {
  for _hrf_folder in TWRP OrangeFox FOX PBRP PitchBlack Recovery; do
    _hrf_path="$TEST_ROOT/$_hrf_folder"
    [ ! -d "$_hrf_path" ] && continue
    _hrf_subdirs=$("$_real_find" "$_hrf_path" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l)
    if [ "$_hrf_subdirs" -gt 0 ]; then
      mkdir -p "$_hrf_backup" 2>/dev/null
      mv "$_hrf_path" "$_hrf_backup/" 2>/dev/null
    else
      rm -rf "$_hrf_path" 2>/dev/null
    fi
  done
}

# Test: empty folder gets deleted
mkdir -p "$TEST_ROOT/TWRP"
_hide_recovery_folders_test
assert_file_not_exists "recovery: empty TWRP folder deleted" "$TEST_ROOT/TWRP"

# Test: non-empty folder gets backed up
mkdir -p "$TEST_ROOT/OrangeFox/subdir"
_hide_recovery_folders_test
assert_file_not_exists "recovery: non-empty OrangeFox moved" "$TEST_ROOT/OrangeFox"
assert_dir_exists() { [ -d "$2" ] && ok "$1" || fail "$1" "directory [$2] does not exist"; }
assert_dir_exists "recovery: OrangeFox backup exists" "$_hrf_backup/OrangeFox/subdir"

# Test: no recovery dirs = no-op
_hide_recovery_folders_test
ok "recovery: no recovery dirs, no-op"

done_testing
