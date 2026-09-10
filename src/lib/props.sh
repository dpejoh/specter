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

sp_force() {
  _sf_name="$1" _sf_expected="$2"
  _sf_current=$(resetprop "$_sf_name" 2>/dev/null || echo "")
  [ "$_sf_current" = "$_sf_expected" ] && { unset _sf_name _sf_expected _sf_current; return 0; }
  resetprop -n "$_sf_name" "$_sf_expected" 2>/dev/null || true
  log_i "PROPS" "$_sf_name: ${_sf_current:-(unset)} → $_sf_expected"
  if [ -n "$_sf_current" ] && [ "$_sf_current" != "$_sf_expected" ]; then
    if ! grep -qsF "|$_sf_name|" "$PERSIST_RESTORE_FILE" 2>/dev/null; then
      ensure_dir "$SPECTER_DIR" 2>/dev/null
      echo "restore|$_sf_name|$_sf_current" >> "$PERSIST_RESTORE_FILE" 2>/dev/null || true
    fi
  fi
  unset _sf_name _sf_expected _sf_current
  return 0
}

apply_boot_props() {
  for _abp_prop in \
    ro.build.selinux:1 ro.build.selinux.enforce:1 \
    ro.secure:1 ro.crypto.state:encrypted \
    ro.hardware.virtual_device:0 ro.build.type:user ro.build.tags:release-keys \
    ro.boot.warranty_bit:0 ro.warranty_bit:0 ro.vendor.warranty_bit:0 ro.vendor.boot.warranty_bit:0 \
    ro.is_ever_orange:0 ro.secureboot.lockstate:locked \
    ro.boot.vbmeta.device_state:locked ro.boot.verifiedbootstate:green \
    ro.boot.veritymode:enforcing \
    ro.boot.veritymode.managed:yes ro.boot.selinux:enforcing \
    vendor.boot.verifiedbootstate:green vendor.boot.vbmeta.device_state:locked \
    ro.boot.realmebootstate:green ro.boot.realme.lockstate:1 \
    ro.kernel.qemu: ro.boot.qemu:0 \
    ro.bootimage.build.tags:release-keys \
    ro.system.build.tags:release-keys ro.vendor.build.tags:release-keys; do
    sp_try "${_abp_prop%%:*}" "${_abp_prop#*:}"
  done
  sp_force "ro.boot.flash.locked" "1"
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

  # Boot error prop cleanup
  resetprop --delete "ro.boot.verifiedbooterror" 2>/dev/null || true
  resetprop --delete "ro.boot.verifyerrorpart" 2>/dev/null || true
  resetprop --delete "crashrecovery.rescue_boot_count" 2>/dev/null || true
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

  _fb_fingerprint=$(resetprop ro.build.fingerprint 2>/dev/null || echo "")
  case "$_fb_fingerprint" in
    *userdebug*) sp_try "ro.build.fingerprint" "${_fb_fingerprint%userdebug}user" ;;
    *)           [ -n "$_fb_fingerprint" ] && log_i "PROPS" "ro.build.fingerprint: already release" ;;
  esac
  unset _fb_fingerprint
}


