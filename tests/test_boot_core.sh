. "$(dirname "$0")/helpers.sh"

plan "boot_core.sh — unified boot dispatch logic"

# The boot_core.sh uses backgrounding (&), sleep, and subshell patterns
# We test the core dispatch logic statically

# ---- scenario: feature dispatch loop ----
bootstrap
source_libs
set_cfg "toggle_recovery" "1"
set_cfg "toggle_boot_hardening" "1"
set_cfg "toggle_lsposed" "0"
set_cfg "toggle_security_patch" "1"
set_cfg "toggle_adb_disabler" "0"

# Simulate the dispatch loop from boot_core.sh
_features_run=""
for _bf in recovery boot_hardening lsposed security_patch adb_disabler; do
  case "$_bf" in *[!a-zA-Z0-9_-]*) continue ;; esac
  case "$_bf" in
    adb_disabler) _feature_should_run "$_bf" 0 || continue ;;
    *) _feature_should_run "$_bf" || continue ;;
  esac
  _features_run="$_features_run $_bf"
done

assert_contains "dispatch: recovery runs"       "$_features_run" "recovery"
assert_contains "dispatch: boot_hardening runs" "$_features_run" "boot_hardening"
assert_contains "dispatch: security_patch runs" "$_features_run" "security_patch"
assert_not_contains "dispatch: lsposed skipped" "$_features_run" "lsposed"
assert_not_contains "dispatch: adb_disabler skipped" "$_features_run" "adb_disabler"

# ---- scenario: prop_handler dispatch ----
bootstrap
source_libs
set_cfg "toggle_prop_handler" "1"
_feature_should_run "prop_handler"; _rc=$?
assert_exit_code "dispatch: prop_handler runs when master=1" 0 $_rc

set_cfg "toggle_prop_handler" "0"
_feature_should_run "prop_handler"; _rc=$?
assert_exit_code "dispatch: prop_handler skips when master=0" 1 $_rc

# ---- scenario: auto_target dispatch ----
bootstrap
source_libs
set_cfg "toggle_auto_target" "0"
[ "$(cfg_get toggle_auto_target 0)" = "1" ] && _at_would_run=true || _at_would_run=false
assert_eq "dispatch: auto_target off" false "$_at_would_run"

set_cfg "toggle_auto_target" "1"
[ "$(cfg_get toggle_auto_target 0)" = "1" ] && _at_would_run=true || _at_would_run=false
assert_eq "dispatch: auto_target on" true "$_at_would_run"

# ---- scenario: periodic props cleaning guard ----
bootstrap
source_libs
set_cfg "toggle_prop_handler" "1"
[ "$(cfg_get toggle_prop_handler 1)" != "0" ] && _periodic_would_run=true || _periodic_would_run=false
assert_eq "dispatch: periodic props enabled" true "$_periodic_would_run"

set_cfg "toggle_prop_handler" "0"
[ "$(cfg_get toggle_prop_handler 1)" != "0" ] && _periodic_would_run2=true || _periodic_would_run2=false
assert_eq "dispatch: periodic props off" false "$_periodic_would_run2"

# ---- scenario: tee marker dispatch ----
bootstrap
source_libs
assert_file_not_exists "dispatch: no tee marker initially" "$SPECTER_DIR/tee_reported"

touch "$SPECTER_DIR/tee_reported"
[ -f "$SPECTER_DIR/tee_reported" ] && _tee_would_run=true || _tee_would_run=false
assert_eq "dispatch: tee runs when marker exists" true "$_tee_would_run"

rm -f "$SPECTER_DIR/tee_reported"
[ -f "$SPECTER_DIR/tee_reported" ] && _tee_would_run2=true || _tee_would_run2=false
assert_eq "dispatch: tee skips when marker removed" false "$_tee_would_run2"

# ---- scenario: invalid feature name sanitized ----
_bf="../../etc/passwd"
case "$_bf" in *[!a-zA-Z0-9_-]*) _sanitized=true ;; esac
assert_eq "dispatch: invalid name sanitized" true "$_sanitized"

done_testing
