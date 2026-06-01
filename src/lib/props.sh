# shellcheck shell=sh
GOOGLE_REVOCATION_URL="${GOOGLE_REVOCATION_URL:-https://android.googleapis.com/attestation/status?encrypted=0}"
PERSIST_RESTORE_FILE="$SPECTER_DIR/persist_backup.txt"

sp_try() {
  _st_name="$1"
  if [ $# -eq 2 ]; then
    _st_expected="$2"
    _st_current=$(resetprop "$_st_name" 2>/dev/null || echo "")
    [ -z "$_st_current" ] || [ "$_st_current" = "$_st_expected" ] && return 0
  elif [ $# -ge 3 ]; then
    _st_needle="$2" _st_value="$3"
    _st_current=$(resetprop "$_st_name" 2>/dev/null || echo "")
    case "$_st_current" in *"$_st_needle"*) ;; *) return 1 ;; esac
    _st_expected="$_st_value"
  else
    return 1
  fi
  resetprop -n "$_st_name" "$_st_expected" 2>/dev/null || true
  unset _st_name _st_expected _st_current _st_needle _st_value
  return 0
}

sp_persist() {
  _sp_name="$1" _sp_value="$2"
  _sp_original=$(resetprop "$_sp_name" 2>/dev/null || echo "")
  resetprop -n -p "$_sp_name" "$_sp_value" 2>/dev/null || true
  if [ -n "$_sp_original" ]; then
    ensure_dir "$SPECTER_DIR"
    if ! grep -qsF "|$_sp_name|" "$PERSIST_RESTORE_FILE" 2>/dev/null; then
      echo "restore|$_sp_name|$_sp_original" >> "$PERSIST_RESTORE_FILE" 2>/dev/null || true
    fi
  fi
  unset _sp_name _sp_value _sp_original
}

hide_recovery_folders() {
    _hrf_backup="/data/adb/recovery_backups"
    _hrf_random="" _hrf_subdirs=0 _hrf_path=""

    for _hrf_folder in TWRP OrangeFox FOX PBRP PitchBlack Recovery; do
        _hrf_path="/sdcard/$_hrf_folder"
        [ ! -d "$_hrf_path" ] && continue

        if [ -f "$_hrf_path/.twrps" ]; then
            rm -f "$_hrf_path/.twrps" 2>/dev/null || {
                _hrf_random=$(head /dev/urandom 2>/dev/null | tr -dc A-Za-z0-9 | head -c 12)
                [ -z "$_hrf_random" ] && _hrf_random="recovery_${$}"
                mv "$_hrf_path" "/sdcard/$_hrf_random" 2>/dev/null
                continue
            }
        fi

        _hrf_path_recurse="$_hrf_path"
        _hrf_subdirs=$(find "$_hrf_path_recurse" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l)

        if [ "$_hrf_subdirs" -gt 0 ]; then
            mkdir -p "$_hrf_backup" 2>/dev/null
            mv "$_hrf_path" "$_hrf_backup/" 2>/dev/null
        else
            rm -rf "$_hrf_path" 2>/dev/null
        fi
    done

    unset _hrf_backup _hrf_random _hrf_subdirs _hrf_path _hrf_path_recurse _hrf_folder
}

apply_boot_hardening() {
  if [ "$(toybox cat /sys/fs/selinux/enforce 2>/dev/null)" = "0" ]; then
    chmod 640 /sys/fs/selinux/enforce 2>/dev/null || true
    chmod 440 /sys/fs/selinux/policy 2>/dev/null || true
  fi
}

apply_vbmeta_props() {
  if [ -f "$VBMETA_DIGEST" ]; then
    resetprop -n ro.boot.vbmeta.digest "$(cat "$VBMETA_DIGEST")"
  fi
  resetprop ro.boot.vbmeta.avb_version >/dev/null 2>&1 || resetprop -n ro.boot.vbmeta.avb_version "1.2"
  resetprop ro.boot.vbmeta.hash_alg >/dev/null 2>&1 || resetprop -n ro.boot.vbmeta.hash_alg "sha256"
  resetprop ro.boot.vbmeta.invalidate_on_error >/dev/null 2>&1 || resetprop -n ro.boot.vbmeta.invalidate_on_error "yes"
  resetprop ro.boot.vbmeta.size >/dev/null 2>&1 || resetprop -n ro.boot.vbmeta.size "4096"
}

apply_boot_props() {
  for _abp_prop in \
    ro.build.selinux:1 ro.secure:1 ro.crypto.state:encrypted \
    ro.hardware.virtual_device:0 ro.build.type:user ro.build.tags:release-keys \
    ro.warranty_bit:0 ro.vendor.warranty_bit:0 ro.vendor.boot.warranty_bit:0 \
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
  case "$_fb_flavor" in
    *userdebug*) sp_try "ro.build.flavor" "${_fb_flavor%userdebug}user" ;;
    *eng*)       sp_try "ro.build.flavor" "${_fb_flavor%eng}user" ;;
  esac
  unset _fb_flavor
}

block_rom_spoof_engines() {
  _brs_gate=false
  resetprop 2>/dev/null | grep -qE 'persist\.sys\.(entryhooks|pixelprops)' && _brs_gate=true
  [ -f "$GMS_PROPS_FILE" ] && _brs_gate=true
  [ "$_brs_gate" = "false" ] && unset _brs_gate && return 0

  while IFS='|' read -r _brs_prop _brs_val; do
    sp_persist "$_brs_prop" "$_brs_val"
  done << MAP
persist.sys.entryhooks_enabled|false
persist.sys.pixelprops.gms|false
persist.sys.pixelprops.gapps|false
persist.sys.pixelprops.google|false
persist.sys.pixelprops.pi|false
MAP

  if [ -f "$GMS_PROPS_FILE" ] && [ "$(resetprop persist.sys.spoof.gms 2>/dev/null)" != "false" ]; then
    resetprop persist.sys.spoof.gms false 2>/dev/null || true
  fi

  while IFS= read -r _brs_prop; do
    [ -z "$_brs_prop" ] && continue
    _brs_orig=$(resetprop "$_brs_prop" 2>/dev/null || echo "")
    if [ -n "$_brs_orig" ]; then
      ensure_dir "$SPECTER_DIR"
      if ! grep -qsF "|$_brs_prop|" "$PERSIST_RESTORE_FILE" 2>/dev/null; then
        echo "restore|$_brs_prop|$_brs_orig" >> "$PERSIST_RESTORE_FILE" 2>/dev/null || true
      fi
    fi
    resetprop -p --delete "$_brs_prop" 2>/dev/null || true
  done << BRS_PROPS
$(getprop 2>/dev/null | grep -E "pixelprops" | sed "s/^\[\(.*\)\]:.*/\1/" || true)
BRS_PROPS

  unset _brs_gate _brs_prop _brs_val _brs_orig
}

disable_bootloader_spoofer() {
  if command -v cmd >/dev/null 2>&1; then
    if pm list packages 2>/dev/null | grep -q "es.chiteroman.bootloaderspoofer"; then
      cmd package uninstall --user 0 "es.chiteroman.bootloaderspoofer" >/dev/null 2>&1 || true
    fi
    cmd appops set com.wmods.wppenhacer POST_NOTIFICATIONS deny 2>/dev/null || true
  else
    if grep -q "es.chiteroman.bootloaderspoofer" /data/system/packages.list 2>/dev/null; then
      timeout 5 pm uninstall --user 0 "es.chiteroman.bootloaderspoofer" >/dev/null 2>&1 || true
    fi
    _wpp_xml="/data/data/com.wmods.wppenhacer/shared_prefs/com.wmods.wppenhacer_preferences.xml"
    if [ -f "$_wpp_xml" ] && grep -q 'name="bootloader_spoofer" value="true"' "$_wpp_xml" 2>/dev/null; then
      sed -i 's/\(name="bootloader_spoofer" value=\)"true"/\1"false"/' "$_wpp_xml" 2>/dev/null || true
    fi
    unset _wpp_xml
  fi
}

hexpatch_deleteprop() {
  _hd_prop="$1"
  [ -n "$_hd_prop" ] || return 0
  _hd_magiskboot=$(command -v magiskboot 2>/dev/null || find /data/adb /data/data/me.bmax.apatch/patch/ -name magiskboot -print -quit 2>/dev/null)
  if [ -n "$_hd_magiskboot" ]; then
    _hd_file=$(resetprop -Z "$_hd_prop" 2>/dev/null | cut -d' ' -f2 | cut -d':' -f3)
    [ -z "$_hd_file" ] && { resetprop -p --delete "$_hd_prop" 2>/dev/null || true; return 0; }
    _hd_path=$(find /dev/__properties__/ -name "*$_hd_file*" -print -quit 2>/dev/null)
    [ -z "$_hd_path" ] && { resetprop -p --delete "$_hd_prop" 2>/dev/null || true; return 0; }
    _hd_search_hex=$(printf '%s' "$_hd_prop" | od -A n -t x1 | tr -d ' \n' | tr '[:lower:]' '[:upper:]')
    _hd_search_len=$(printf '%s' "$_hd_prop" | wc -c)
    _hd_replacement=$(head /dev/urandom 2>/dev/null | tr -dc '0-9a-f' | head -c "$_hd_search_len" 2>/dev/null || printf '%s' "$_hd_prop" | od -A n -t x1 | tr -d ' \n' | head -c "$((_hd_search_len * 2))")
    _hd_replacement_hex=$(printf '%s' "$_hd_replacement" | od -A n -t x1 | tr -d ' \n' | tr '[:lower:]' '[:upper:]')
    "$_hd_magiskboot" hexpatch "$_hd_path" "$_hd_search_hex" "$_hd_replacement_hex" >/dev/null 2>&1 || {
      log "PROPS" "hexpatch failed for $_hd_prop, fell back to resetprop -p --delete"
      resetprop -p --delete "$_hd_prop" 2>/dev/null || true
    }
  else
    resetprop -p --delete "$_hd_prop" 2>/dev/null || true
  fi
  unset _hd_prop _hd_magiskboot _hd_file _hd_path _hd_search_hex _hd_search_len _hd_replacement _hd_replacement_hex
}
