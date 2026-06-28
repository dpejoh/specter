#!/system/bin/sh
set -e
MODDIR=${0%/*}
. "$MODDIR/../lib/common.sh"
. "$MODDIR/../lib/constants.sh"

[ "$(cfg_get toggle_rom_fingerprint 1)" = "0" ] && exit 0

_rf_hexpatch=$(cfg_get rom_fingerprint_hexpatch 1)
_rf_prefix=$(cfg_get rom_fingerprint_prefix 1)

[ "$_rf_hexpatch$_rf_prefix" = "00" ] && exit 0

log_i "ROM_FP" "Cleaning ROM fingerprints"
_cleaned=0

if [ "$_rf_hexpatch" != "0" ]; then
  for _rf_pattern in \
    lineage crDroid PixelExperience PixelOS EvolutionX ArrowOS \
    HavocOS ResurrectionRemix AICP AOSiP AOSPA Bootleggers \
    CarbonROM ColtOS DotOS DirtyUnicorns DerpFest ExtendedUI \
    FluidOS FusionOS GenesisOS GZOSP HalogenOS IonOS \
    LegionOS LiquidRemix LLuviaOS Mokee MSM-Xtended \
    NitrogenOS NusantaraOS OctaviOS OmniROM ParanoidAndroid \
    POSP ProjectSakura RevengeOS RisingOS ShapeShiftOS \
    SlimRoms SpiceOS StagOS SuperiorOS SyberiaOS \
    TequilaOS TheAndroidProject titanium ValidusOS \
    ViperOS XOSP ZenithOS ZephyrusOS crDroidProject; do
    _rf_props=$(resetprop 2>/dev/null | grep -i "$_rf_pattern" | cut -d'[' -f2 | cut -d']' -f1 || true)
    for _rf_prop in $_rf_props; do
      [ -z "$_rf_prop" ] && continue
      resetprop --delete "$_rf_prop" 2>/dev/null || true
      _cleaned=$((_cleaned + 1))
    done
  done
  unset _rf_pattern _rf_props _rf_prop
fi

if [ "$_rf_prefix" != "0" ]; then
  for _rf_build_prop in ro.build.fingerprint ro.build.display.id ro.build.description ro.build.version.incremental ro.product.vendor.name; do
    _rf_val=$(resetprop "$_rf_build_prop" 2>/dev/null || echo "")
    [ -z "$_rf_val" ] && continue
    _rf_new_val="$_rf_val"
    for _rf_pref in aosp_ lineage_; do
      case "$_rf_new_val" in
        "$_rf_pref"*) _rf_new_val=${_rf_new_val#"$_rf_pref"} ;;
      esac
    done
    [ "$_rf_new_val" != "$_rf_val" ] && resetprop -n "$_rf_build_prop" "$_rf_new_val" && _cleaned=$((_cleaned + 1))
  done
  unset _rf_build_prop _rf_val _rf_new_val _rf_pref
fi

# LineageOS camera packagelist scrub
_rf_cam=$(resetprop vendor.camera.aux.packagelist 2>/dev/null || echo "")
case "$_rf_cam" in
  *org.lineageos*) resetprop -n vendor.camera.aux.packagelist "com.android.camera" && _cleaned=$((_cleaned + 1)) && log_d "ROM_FP" "Scrubbed vendor.camera.aux.packagelist" ;;
esac
unset _rf_cam

_rf_cam_priv=$(resetprop persist.vendor.camera.privapp.list 2>/dev/null || echo "")
case "$_rf_cam_priv" in
  *org.lineageos*) resetprop -n persist.vendor.camera.privapp.list "com.android.camera" && _cleaned=$((_cleaned + 1)) && log_d "ROM_FP" "Scrubbed persist.vendor.camera.privapp.list" ;;
esac
unset _rf_cam_priv

# Kill vendor.lineage_health service
_rf_health=$(resetprop init.svc.vendor.lineage_health 2>/dev/null || echo "")
if [ -n "$_rf_health" ]; then
  setprop ctl.stop vendor.lineage_health 2>/dev/null || true
  resetprop -d init.svc.vendor.lineage_health 2>/dev/null || true
  _cleaned=$((_cleaned + 1))
  log_d "ROM_FP" "Stopped vendor.lineage_health"
fi
unset _rf_health

if [ "$_cleaned" -gt 0 ]; then
  log_i "ROM_FP" "Cleaned $_cleaned ROM-specific fingerprints"
else
  log_i "ROM_FP" "No ROM fingerprints to clean"
fi
unset _cleaned
log_i "ROM_FP" "ROM fingerprint cleanup complete"
