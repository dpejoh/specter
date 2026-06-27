# shellcheck shell=sh
GOOGLE_REVOCATION_URL="${GOOGLE_REVOCATION_URL:-https://android.googleapis.com/attestation/status?encrypted=0}"
PERSIST_RESTORE_FILE="$SPECTER_DIR/persist_backup.txt"

sp_try() {
  _st_name="$1"
  if [ $# -eq 2 ]; then
    _st_expected="$2"
    _st_current=$(resetprop "$_st_name" 2>/dev/null || echo "")
    [ -z "$_st_current" ] || [ "$_st_current" = "$_st_expected" ] && { unset _st_name _st_expected _st_current _st_needle _st_value; return 0; }
  elif [ $# -ge 3 ]; then
    _st_needle="$2" _st_value="$3"
    _st_current=$(resetprop "$_st_name" 2>/dev/null || echo "")
    case "$_st_current" in *"$_st_needle"*) ;; *) unset _st_name _st_expected _st_current _st_needle _st_value; return 1 ;; esac
    _st_expected="$_st_value"
  else
    unset _st_name _st_expected _st_current _st_needle _st_value; return 1
  fi
  resetprop -n "$_st_name" "$_st_expected" 2>/dev/null || true
  log_i "PROPS" "$_st_name: ${_st_current:-(unset)} → $_st_expected"
  if [ -n "$_st_current" ] && [ "$_st_current" != "$_st_expected" ]; then
    if ! grep -qsF "|$_st_name|" "$PERSIST_RESTORE_FILE" 2>/dev/null; then
      ensure_dir "$SPECTER_DIR" 2>/dev/null
      echo "restore|$_st_name|$_st_current" >> "$PERSIST_RESTORE_FILE" 2>/dev/null || true
    fi
  fi
  unset _st_name _st_expected _st_current _st_needle _st_value
  return 0
}

sp_persist() {
  _sp_name="$1" _sp_value="$2"
  _sp_original=$(resetprop "$_sp_name" 2>/dev/null || echo "")
  resetprop -n -p "$_sp_name" "$_sp_value" 2>/dev/null || true
  log_i "PROPS" "persist $_sp_name: ${_sp_original:-(unset)} → $_sp_value"
  if [ -n "$_sp_original" ]; then
    ensure_dir "$SPECTER_DIR"
    if ! grep -qsF "|$_sp_name|" "$PERSIST_RESTORE_FILE" 2>/dev/null; then
      echo "restore|$_sp_name|$_sp_original" >> "$PERSIST_RESTORE_FILE" 2>/dev/null || true
    fi
  fi
  unset _sp_name _sp_value _sp_original
}

apply_vbmeta_props() {
  resetprop ro.boot.vbmeta.avb_version >/dev/null 2>&1 || { resetprop -n ro.boot.vbmeta.avb_version "1.2" && log_i "PROPS" "ro.boot.vbmeta.avb_version → 1.2"; }
  resetprop ro.boot.vbmeta.hash_alg >/dev/null 2>&1 || { resetprop -n ro.boot.vbmeta.hash_alg "sha256" && log_i "PROPS" "ro.boot.vbmeta.hash_alg → sha256"; }
  resetprop ro.boot.vbmeta.invalidate_on_error >/dev/null 2>&1 || { resetprop -n ro.boot.vbmeta.invalidate_on_error "yes" && log_i "PROPS" "ro.boot.vbmeta.invalidate_on_error → yes"; }
  resetprop ro.boot.vbmeta.size >/dev/null 2>&1 || { resetprop -n ro.boot.vbmeta.size "4096" && log_i "PROPS" "ro.boot.vbmeta.size → 4096"; }
}

apply_boot_props() {
  for _abp_prop in \
    ro.build.selinux:1 ro.secure:1 ro.crypto.state:encrypted \
    ro.hardware.virtual_device:0 ro.build.type:user ro.build.tags:release-keys \
    ro.boot.warranty_bit:0 ro.warranty_bit:0 ro.vendor.warranty_bit:0 ro.vendor.boot.warranty_bit:0 \
    ro.is_ever_orange:0 ro.secureboot.lockstate:locked \
    ro.boot.vbmeta.device_state:locked ro.boot.verifiedbootstate:green \
    ro.boot.flash.locked:1 ro.boot.veritymode:enforcing \
    ro.boot.veritymode.managed:yes ro.boot.selinux:enforcing \
    vendor.boot.verifiedbootstate:green vendor.boot.vbmeta.device_state:locked \
    ro.boot.realmebootstate:green ro.boot.realme.lockstate:1 \
    ro.kernel.qemu:0 ro.boot.qemu:0 \
    ro.system.build.tags:release-keys ro.vendor.build.tags:release-keys; do
    sp_try "${_abp_prop%%:*}" "${_abp_prop#*:}"
  done
  for _abp_prop in ro.product.build.type ro.system.build.type ro.vendor.build.type \
    ro.odm.build.type ro.product.vendor.build.type ro.product.odm.build.type; do
    sp_try "$_abp_prop" "user"
  done
  for _abp_prop in ro.product.build.tags ro.system.build.tags ro.vendor.build.tags \
    ro.odm.build.tags ro.product.vendor.build.tags ro.product.odm.build.tags; do
    sp_try "$_abp_prop" "release-keys"
  done
  for _abp_prop in partition.system.verified partition.vendor.verified \
    partition.product.verified partition.system_ext.verified partition.odm.verified; do
    sp_try "$_abp_prop" "1"
  done
  unset _abp_prop
}

spoof_build_props() {
  _fb_flavor=$(resetprop ro.build.flavor 2>/dev/null || echo "")
  [ -n "$_fb_flavor" ] && log_i "PROPS" "ro.build.flavor: $_fb_flavor (checking)"
  case "$_fb_flavor" in
    *userdebug*) sp_try "ro.build.flavor" "${_fb_flavor%userdebug}user" ;;
    *eng*)       sp_try "ro.build.flavor" "${_fb_flavor%eng}user" ;;
    *)           log_i "PROPS" "ro.build.flavor: $_fb_flavor, already release" ;;
  esac
  unset _fb_flavor
}

block_rom_spoof_engines() {
  _brs_gate=false
  resetprop 2>/dev/null | grep -qE 'persist\.sys\.(entryhooks|pixelprops|pihooks)' && _brs_gate=true
  [ -f "$GMS_PROPS_FILE" ] && _brs_gate=true
  [ "$_brs_gate" = "false" ] && { log_i "PROPS" "No spoof engines detected"; unset _brs_gate; return 0; }
  log_i "PROPS" "Blocking spoof engines"

  while IFS='|' read -r _brs_prop _brs_val; do
    sp_persist "$_brs_prop" "$_brs_val"
  done << MAP
persist.sys.entryhooks_enabled|false
persist.sys.pixelprops.gms|false
persist.sys.pixelprops.gapps|false
persist.sys.pixelprops.google|false
persist.sys.pixelprops.pi|false
persist.sys.pihooks.disable.gms|true
MAP
  log_i "PROPS" "Blocked 6 spoof engine props"

  if [ -f "$GMS_PROPS_FILE" ] && [ "$(resetprop persist.sys.spoof.gms 2>/dev/null)" != "false" ]; then
    resetprop persist.sys.spoof.gms false 2>/dev/null || true
    log_i "PROPS" "persist.sys.spoof.gms → false"
  fi

  while IFS= read -r _brs_prop; do
    [ -z "$_brs_prop" ] && continue
    _brs_orig=$(resetprop "$_brs_prop" 2>/dev/null || echo "")
    if [ -n "$_brs_orig" ]; then
      ensure_dir "$SPECTER_DIR"
      if ! grep -qsF "|$_brs_prop|" "$PERSIST_RESTORE_FILE" 2>/dev/null; then
        echo "restore|$_brs_prop|$_brs_orig" >> "$PERSIST_RESTORE_FILE" 2>/dev/null || true
      fi
      log_i "PROPS" "Deleted $_brs_prop (was: $_brs_orig)"
    fi
    resetprop -p --delete "$_brs_prop" 2>/dev/null || true
  done << BRS_PROPS
$(getprop 2>/dev/null | grep -E "(pixelprops|pihooks)" | sed "s/^\[\(.*\)\]:.*/\1/" || true)
BRS_PROPS

  unset _brs_gate _brs_prop _brs_val _brs_orig
}

detect_region() {
_dr_locale=$(getprop ro.system.locale 2>/dev/null || getprop persist.sys.locale 2>/dev/null || getprop ro.product.locale 2>/dev/null)
    _dr_locale=${_dr_locale:-en-US}
    _dr_country=$(echo "$_dr_locale" | sed 's/.*-//;s/.*_//')
  printf '%s' "$_dr_country" | tr '[:upper:]' '[:lower:]'
  unset _dr_locale _dr_country
}

apply_region_props() {
  _ar_region=$(detect_region)
  log_i "PROPS" "Detected region: $_ar_region"
  case "$_ar_region" in
    cn)
      for _p in "persist.radio.calls.on.ims:1" "persist.radio.jbims:1" "persist.radio.videocall.audio.output:1"; do
        sp_try "${_p%%:*}" "${_p#*:}"
      done
      ;;
    in)
      for _p in "persist.radio.calls.on.ims:1" "persist.radio.jbims:1"; do
        sp_try "${_p%%:*}" "${_p#*:}"
      done
      ;;
    ru)
      sp_try "persist.sys.locale" "ru-RU"
      sp_try "persist.sys.language" "ru"
      sp_try "persist.sys.country" "RU"
      ;;
    jp|ja)
      sp_try "persist.radio.calls.on.ims:1"
      ;;
    kr|ko)
      sp_try "persist.radio.calls.on.ims:1"
      ;;
    br)
      sp_try "persist.radio.calls.on.ims:1"
      ;;
    *)
      log_i "PROPS" "No region-specific props for $_ar_region"
      ;;
  esac
  unset _ar_region _p
}
