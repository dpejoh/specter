. "$(dirname "$0")/helpers.sh"

plan "rom_fingerprint.sh — ROM fingerprint hexpatch + prefix stripping"

# ---- scenario: hexpatch deletion + prefix stripping both on ----
bootstrap
source_libs
set_cfg "toggle_rom_fingerprint" "1"
set_cfg "rom_fingerprint_hexpatch" "1"
set_cfg "rom_fingerprint_prefix" "1"
set_prop "ro.build.display.id" "lineage_beryllium-userdebug 10 QQ3A.200605.001"
set_prop "ro.build.fingerprint" "lineage/beryllium/beryllium:10/QQ3A.200605.001/1234:userdebug/release-keys"
set_prop "ro.build.version.incremental" "eng.20200605.123456"
set_prop "persist.sys.xposed" "1"
set_prop "ro.build.description" "aosp_beryllium-userdebug 10 QQ3A.200605.001"

_rf_hexpatch=$(cfg_get rom_fingerprint_hexpatch 1)
_rf_prefix=$(cfg_get rom_fingerprint_prefix 1)

if [ "$_rf_hexpatch" != "0" ]; then
  for _rf_pattern in lineage; do
    _rf_props=$(resetprop 2>/dev/null | grep -i "$_rf_pattern" | cut -d'[' -f2 | cut -d']' -f1 || true)
    for _rf_prop in $_rf_props; do
      [ -z "$_rf_prop" ] && continue
      hexpatch_deleteprop "$_rf_prop"
    done
  done
fi

# Prop containing "lineage" should be deleted
assert_prop_not_set "hexpatch: ro.build.display.id with lineage deleted" "ro.build.display.id"
assert_prop_not_set "hexpatch: ro.build.fingerprint with lineage deleted" "ro.build.fingerprint"
# Prop NOT containing "lineage" should survive
assert_prop_set "hexpatch: persist.sys.xposed untouched" "persist.sys.xposed"

# Re-set props for prefix test (hexpatch already deleted them)
bootstrap
source_libs
set_cfg "toggle_rom_fingerprint" "1"
set_cfg "rom_fingerprint_hexpatch" "0"
set_cfg "rom_fingerprint_prefix" "1"
set_prop "ro.build.display.id" "aosp_beryllium-userdebug 10 QQ3A.200605.001"
set_prop "ro.build.fingerprint" "lineage_beryllium-userdebug 10 QQ3A.200605.001"
set_prop "ro.build.description" "stock desc"
set_prop "ro.build.version.incremental" "QQ3A.200605.001"

_rf_hexpatch=$(cfg_get rom_fingerprint_hexpatch 1)
_rf_prefix=$(cfg_get rom_fingerprint_prefix 1)

if [ "$_rf_prefix" != "0" ]; then
  for _rf_build_prop in ro.build.fingerprint ro.build.display.id ro.build.description ro.build.version.incremental; do
    _rf_val=$(resetprop "$_rf_build_prop" 2>/dev/null || echo "")
    [ -z "$_rf_val" ] && continue
    _rf_new_val="$_rf_val"
    for _rf_pref in aosp_ lineage_; do
      case "$_rf_new_val" in
        "$_rf_pref"*) _rf_new_val="${_rf_new_val#$_rf_pref}" ;;
      esac
    done
    [ "$_rf_new_val" != "$_rf_val" ] && resetprop -n "$_rf_build_prop" "$_rf_new_val"
  done
fi

assert_prop_eq "prefix: ro.build.display.id stripped aosp_" "ro.build.display.id" "beryllium-userdebug 10 QQ3A.200605.001"
assert_prop_eq "prefix: ro.build.fingerprint stripped lineage_" "ro.build.fingerprint" "beryllium-userdebug 10 QQ3A.200605.001"
assert_prop_eq "prefix: ro.build.description unchanged" "ro.build.description" "stock desc"
assert_prop_eq "prefix: ro.build.version.incremental unchanged" "ro.build.version.incremental" "QQ3A.200605.001"

# ---- scenario: master toggle off ----
bootstrap
source_libs
set_cfg "toggle_rom_fingerprint" "0"
set_cfg "rom_fingerprint_hexpatch" "1"
set_cfg "rom_fingerprint_prefix" "1"
set_prop "ro.build.display.id" "lineage_rom"

[ "$(cfg_get toggle_rom_fingerprint 1)" = "0" ] && {
  assert_prop_eq "master-off: ro.build.display.id untouched" "ro.build.display.id" "lineage_rom"
}

# ---- scenario: hexpatch off, prefix on ----
bootstrap
source_libs
set_cfg "toggle_rom_fingerprint" "1"
set_cfg "rom_fingerprint_hexpatch" "0"
set_cfg "rom_fingerprint_prefix" "1"
set_prop "ro.build.display.id" "lineage_beryllium-userdebug"
set_prop "persist.sys.xposed" "1"

_rf_hexpatch=$(cfg_get rom_fingerprint_hexpatch 1)
_rf_prefix=$(cfg_get rom_fingerprint_prefix 1)

if [ "$_rf_prefix" != "0" ]; then
  for _rf_build_prop in ro.build.display.id; do
    _rf_val=$(resetprop "$_rf_build_prop" 2>/dev/null || echo "")
    [ -z "$_rf_val" ] && continue
    _rf_new_val="$_rf_val"
    for _rf_pref in aosp_ lineage_; do
      case "$_rf_new_val" in
        "$_rf_pref"*) _rf_new_val="${_rf_new_val#$_rf_pref}" ;;
      esac
    done
    [ "$_rf_new_val" != "$_rf_val" ] && resetprop -n "$_rf_build_prop" "$_rf_new_val"
  done
fi

assert_prop_set "hexpatch-off-but-prefix-on: xposed still set" "persist.sys.xposed"
assert_prop_eq "hexpatch-off-but-prefix-on: display.id stripped" "ro.build.display.id" "beryllium-userdebug"

# ---- scenario: prefix off, hexpatch on ----
bootstrap
source_libs
set_cfg "toggle_rom_fingerprint" "1"
set_cfg "rom_fingerprint_hexpatch" "1"
set_cfg "rom_fingerprint_prefix" "0"
set_prop "ro.build.display.id" "aosp_beryllium-userdebug"
set_prop "persist.sys.xposed" "1"

_rf_hexpatch=$(cfg_get rom_fingerprint_hexpatch 1)
_rf_prefix=$(cfg_get rom_fingerprint_prefix 1)

if [ "$_rf_hexpatch" != "0" ]; then
  for _rf_pattern in aosp; do
    _rf_props=$(resetprop 2>/dev/null | grep -i "$_rf_pattern" | cut -d'[' -f2 | cut -d']' -f1 || true)
    for _rf_prop in $_rf_props; do
      [ -z "$_rf_prop" ] && continue
      hexpatch_deleteprop "$_rf_prop"
    done
  done
fi

assert_prop_not_set "prefix-off-hexpatch-on: aosp prop deleted" "ro.build.display.id"
assert_prop_set "prefix-off-hexpatch-on: xposed untouched" "persist.sys.xposed"

# ---- scenario: both sub-toggles off ----
bootstrap
source_libs
set_cfg "toggle_rom_fingerprint" "1"
set_cfg "rom_fingerprint_hexpatch" "0"
set_cfg "rom_fingerprint_prefix" "0"
set_prop "ro.build.display.id" "lineage_rom"

_rf_hexpatch=$(cfg_get rom_fingerprint_hexpatch 1)
_rf_prefix=$(cfg_get rom_fingerprint_prefix 1)

[ "$_rf_hexpatch$_rf_prefix" = "00" ] && {
  assert_prop_eq "all-off: lineage prefix untouched" "ro.build.display.id" "lineage_rom"
}

done_testing
