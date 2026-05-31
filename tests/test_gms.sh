. "$(dirname "$0")/helpers.sh"

plan "gms.sh — GMS force-stop + Play Store data clear"

# ---- scenario: both sub-toggles enabled ----
bootstrap
source_libs
set_cfg "toggle_action_gms" "1"
set_cfg "action_gms_force_stop" "1"
set_cfg "action_gms_clear_data" "1"

_master_off=false
[ "$(cfg_get toggle_action_gms 1)" = "0" ] && _master_off=true

if [ "$_master_off" = "false" ]; then
  _force_stop=$(cfg_get action_gms_force_stop 1)
  _clear_data=$(cfg_get action_gms_clear_data 1)
  _installed_pkgs=$(pm list packages 2>/dev/null) || true

  if [ "$_force_stop" != "0" ]; then
    for _pid in $(pgrep -f 'droidguard\|com\.google\.android\.gms\b' 2>/dev/null); do
      kill -9 "$_pid" 2>/dev/null || true
    done
    for _pkg in com.google.android.gms com.google.android.gms.unstable com.google.android.gms.persistent com.google.android.gms.wearable com.google.android.gms.l; do
      echo "$_installed_pkgs" | grep -Fq "package:$_pkg" || continue
      am force-stop "$_pkg" >/dev/null 2>&1 || true
    done
  fi
  if [ "$_clear_data" != "0" ] && echo "$_installed_pkgs" | grep -q "package:com.android.vending"; then
    pm clear com.android.vending >/dev/null 2>&1 || true
  fi
fi

assert_log_contains "gms: pm list called"           "pm.log" "PM list"
assert_log_contains "gms: am force-stop called"     "am.log" "AM force-stop"
assert_log_contains "gms: pm clear called"          "pm.log" "PM clear com.android.vending"

# ---- scenario: force-stop only ----
bootstrap
source_libs
set_cfg "toggle_action_gms" "1"
set_cfg "action_gms_force_stop" "1"
set_cfg "action_gms_clear_data" "0"

_force_stop=$(cfg_get action_gms_force_stop 1)
_clear_data=$(cfg_get action_gms_clear_data 1)
_installed_pkgs=$(pm list packages 2>/dev/null) || true

if [ "$_force_stop" != "0" ]; then
  for _pkg in com.google.android.gms; do
    echo "$_installed_pkgs" | grep -Fq "package:$_pkg" || continue
    am force-stop "$_pkg" >/dev/null 2>&1 || true
  done
fi
if [ "$_clear_data" != "0" ]; then
  pm clear com.android.vending >/dev/null 2>&1 || true
fi

assert_log_contains "gms: force-stop called (only)"    "am.log" "AM force-stop"
assert_log_not_contains "gms: no pm clear"            "pm.log" "PM clear com.android.vending"

# ---- scenario: clear_data only ----
bootstrap
source_libs
set_cfg "toggle_action_gms" "1"
set_cfg "action_gms_force_stop" "0"
set_cfg "action_gms_clear_data" "1"

_force_stop=$(cfg_get action_gms_force_stop 1)
_clear_data=$(cfg_get action_gms_clear_data 1)
_installed_pkgs=$(pm list packages 2>/dev/null) || true

if [ "$_force_stop" != "0" ]; then
  for _pkg in com.google.android.gms; do
    echo "$_installed_pkgs" | grep -Fq "package:$_pkg" || continue
    am force-stop "$_pkg" >/dev/null 2>&1 || true
  done
fi
if [ "$_clear_data" != "0" ]; then
  pm clear com.android.vending >/dev/null 2>&1 || true
fi

assert_log_not_contains "gms: no am force-stop"       "am.log" "AM force-stop"
assert_log_contains "gms: pm clear called (only)"     "pm.log" "PM clear com.android.vending"

done_testing
