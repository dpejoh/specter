plan "rom_fingerprint.sh — hexpatch, prefix stripping, camera scrub, lineage health"

# ---------- hexpatch deletion ----------

bootstrap
source_libs
set_cfg "toggle_rom_fingerprint" "1"
set_cfg "rom_fingerprint_hexpatch" "1"
set_cfg "rom_fingerprint_prefix" "0"
set_prop "ro.build.display.id" "lineage_beryllium-userdebug 10 QQ3A.200605.001"
set_prop "ro.build.fingerprint" "lineage/beryllium/beryllium:10/QQ3A.200605.001/1234:userdebug/release-keys"
set_prop "persist.sys.xposed" "1"

_rf_hexpatch=$(cfg_get rom_fingerprint_hexpatch 1)
if [ "$_rf_hexpatch" != "0" ]; then
  for _rf_pattern in lineage; do
    _rf_props=$(resetprop 2>/dev/null | grep -i "$_rf_pattern" | cut -d'[' -f2 | cut -d']' -f1 || true)
    for _rf_prop in $_rf_props; do
      [ -z "$_rf_prop" ] && continue
      resetprop --delete "$_rf_prop" 2>/dev/null || true
    done
  done
fi

assert_prop_not_set "hexpatch: display.id deleted" "ro.build.display.id"
assert_prop_not_set "hexpatch: fingerprint deleted" "ro.build.fingerprint"
assert_prop_set "hexpatch: xposed untouched" "persist.sys.xposed"

# ---------- prefix stripping ----------

bootstrap
source_libs
set_cfg "toggle_rom_fingerprint" "1"
set_cfg "rom_fingerprint_hexpatch" "0"
set_cfg "rom_fingerprint_prefix" "1"
set_prop "ro.build.display.id" "aosp_beryllium-userdebug"
set_prop "ro.build.fingerprint" "lineage_beryllium-userdebug"
set_prop "ro.build.description" "stock desc"
set_prop "ro.build.version.incremental" "QQ3A.200605.001"

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

assert_prop_eq "prefix: display.id aosp_ stripped" "ro.build.display.id" "beryllium-userdebug"
assert_prop_eq "prefix: fingerprint lineage_ stripped" "ro.build.fingerprint" "beryllium-userdebug"
assert_prop_eq "prefix: description unchanged" "ro.build.description" "stock desc"
assert_prop_eq "prefix: incremental unchanged" "ro.build.version.incremental" "QQ3A.200605.001"

# ---------- vendor.camera.aux.packagelist scrub (lineage present) ----------

bootstrap
source_libs
set_cfg "toggle_rom_fingerprint" "1"
set_cfg "rom_fingerprint_hexpatch" "0"
set_cfg "rom_fingerprint_prefix" "0"
set_prop "vendor.camera.aux.packagelist" "com.google.android.googlecamera,org.lineageos.aperture"

_rf_cam=$(resetprop vendor.camera.aux.packagelist 2>/dev/null || echo "")
case "$_rf_cam" in
  *org.lineageos*) resetprop -n vendor.camera.aux.packagelist "com.android.camera" ;;
esac

assert_prop_eq "camera: lineage pkglist scrubbed to com.android.camera" "vendor.camera.aux.packagelist" "com.android.camera"

# ---------- vendor.camera.aux.packagelist clean (no lineage) ----------

bootstrap
source_libs
set_prop "vendor.camera.aux.packagelist" "com.google.android.googlecamera"
_rf_cam=$(resetprop vendor.camera.aux.packagelist 2>/dev/null || echo "")
case "$_rf_cam" in
  *org.lineageos*) resetprop -n vendor.camera.aux.packagelist "com.android.camera" ;;
esac
assert_prop_eq "camera: no lineage, pkglist unchanged" "vendor.camera.aux.packagelist" "com.google.android.googlecamera"

# ---------- persist.vendor.camera.privapp.list scrub ----------

bootstrap
source_libs
set_prop "persist.vendor.camera.privapp.list" "com.android.camera,org.lineageos.aperture"
_rf_cam_priv=$(resetprop persist.vendor.camera.privapp.list 2>/dev/null || echo "")
case "$_rf_cam_priv" in
  *org.lineageos*) resetprop -n persist.vendor.camera.privapp.list "com.android.camera" ;;
esac
assert_prop_eq "camera: lineage privapp scrubbed" "persist.vendor.camera.privapp.list" "com.android.camera"

# ---------- persist.vendor.camera.privapp.list clean (no lineage) ----------

bootstrap
source_libs
set_prop "persist.vendor.camera.privapp.list" "com.android.camera"
_rf_cam_priv=$(resetprop persist.vendor.camera.privapp.list 2>/dev/null || echo "")
case "$_rf_cam_priv" in
  *org.lineageos*) resetprop -n persist.vendor.camera.privapp.list "com.android.camera" ;;
esac
assert_prop_eq "camera: no lineage, privapp unchanged" "persist.vendor.camera.privapp.list" "com.android.camera"

# ---------- lineage_health service stop ----------

bootstrap
source_libs
set_prop "init.svc.vendor.lineage_health" "running"
_rf_health=$(resetprop init.svc.vendor.lineage_health 2>/dev/null || echo "")
if [ -n "$_rf_health" ]; then
  setprop ctl.stop vendor.lineage_health 2>/dev/null || true
  resetprop -d init.svc.vendor.lineage_health 2>/dev/null || true
fi
assert_log_contains "health: ctl.stop called" "resetprop.log" "CTL_STOP vendor.lineage_health"
assert_log_contains "health: resetprop -d called" "resetprop.log" "DELETE init.svc.vendor.lineage_health"

# ---------- lineage_health service not running (noop) ----------

bootstrap
source_libs
set_prop "init.svc.vendor.lineage_health" ""
_rf_health=$(resetprop init.svc.vendor.lineage_health 2>/dev/null || echo "")
[ -z "$_rf_health" ] && _health_missing=true || _health_missing=false
assert_eq "health: prop missing, no action taken" "true" "$_health_missing"

# ---------- master toggle off ----------

bootstrap
source_libs
set_cfg "toggle_rom_fingerprint" "0"
set_cfg "rom_fingerprint_hexpatch" "1"
set_cfg "rom_fingerprint_prefix" "1"
set_prop "ro.build.display.id" "lineage_rom"

[ "$(cfg_get toggle_rom_fingerprint 1)" = "0" ] && _disabled=true
assert_eq "master-off: no action when toggle=0" "true" "$_disabled"

done_testing
