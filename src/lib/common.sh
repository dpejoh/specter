# shellcheck shell=sh disable=SC3057,SC3052
ROOT_SOL=""

log() { echo "[$1] $2"; }

die() { log "ERROR" "$1"; exit 1; }

download() {
    _dl_url="$1" _dl_output="$2" _dl_sha256="$3" _dl_oldpath="$PATH"
    PATH="/data/adb/magisk:/data/data/com.termux/files/usr/bin:$PATH"
    _dl_tmp="" _dl_code=1 _dl_try=0

    if [ -z "$_dl_output" ]; then
        _dl_tmp=$(mktemp 2>/dev/null || echo "/data/local/tmp/.specter_dl_${$}_$(date +%s)")
        _dl_output="$_dl_tmp"
    fi

    for _dl_try in 1 2 3; do
        if command -v curl >/dev/null 2>&1 && curl --version >/dev/null 2>&1; then
            curl --connect-timeout 10 -Ls -o "$_dl_output" "$_dl_url" 2>/dev/null && _dl_code=0 && break
        fi
        if command -v wget >/dev/null 2>&1; then
            wget -T 10 -qO "$_dl_output" "$_dl_url" 2>/dev/null && _dl_code=0 && break
        fi
        sleep 1
    done

    if [ "$_dl_code" -eq 0 ] && [ -n "$_dl_sha256" ]; then
        _dl_sum=$(sha256sum "$_dl_output" 2>/dev/null | cut -d' ' -f1)
        if [ "$_dl_sum" != "$_dl_sha256" ]; then
            rm -f "$_dl_output"
            PATH="$_dl_oldpath"
            unset _dl_url _dl_output _dl_sha256 _dl_oldpath _dl_tmp _dl_code _dl_try _dl_sum
            return 1
        fi
    fi

    if [ -n "$_dl_tmp" ] && [ "$_dl_code" -eq 0 ]; then
        cat "$_dl_tmp"
        rm -f "$_dl_tmp"
    fi

    PATH="$_dl_oldpath"
    unset _dl_url _dl_output _dl_sha256 _dl_oldpath _dl_tmp _dl_code _dl_try _dl_sum
    return $_dl_code
}

check_network() {
    _cn_oldpath="$PATH"
    PATH="/data/adb/magisk:/data/data/com.termux/files/usr/bin:$PATH"
    _cn_dns="" _cn_endpoint="https://clients3.google.com/generate_204" _cn_retry=0

    for _cn_dns in "1.1.1.1" "8.8.8.8" "9.9.9.9"; do
        ping -c1 -W2 "$_cn_dns" >/dev/null 2>&1 && PATH="$_cn_oldpath" && unset _cn_oldpath _cn_dns _cn_endpoint _cn_retry && return 0
    done

    for _cn_retry in 1 2 3; do
        if command -v curl >/dev/null 2>&1 && curl --version >/dev/null 2>&1; then
            curl --connect-timeout 5 -sI "$_cn_endpoint" >/dev/null 2>&1 && PATH="$_cn_oldpath" && unset _cn_oldpath _cn_dns _cn_endpoint _cn_retry && return 0
        fi
        if command -v wget >/dev/null 2>&1; then
            wget -T 5 --spider "$_cn_endpoint" >/dev/null 2>&1 && PATH="$_cn_oldpath" && unset _cn_oldpath _cn_dns _cn_endpoint _cn_retry && return 0
        fi
        sleep "$_cn_retry"
    done

    PATH="$_cn_oldpath"
    unset _cn_oldpath _cn_dns _cn_endpoint _cn_retry
    return 1
}

check_prop() {
    _cp_name=$1 _cp_expected=$2
    _cp_value=$(resetprop "$_cp_name" 2>/dev/null || echo "")
    [ -z "$_cp_value" ] || [ "$_cp_value" = "$_cp_expected" ] || resetprop -n "$_cp_name" "$_cp_expected" 2>/dev/null || true
    unset _cp_name _cp_expected _cp_value
}

detect_root_solution() {

    if [ -f "/data/adb/ksud" ]; then
        ROOT_SOL="kernelsu"
    elif [ -f "/data/adb/apd" ]; then
        ROOT_SOL="apatch"
    elif [ -f "/data/adb/magisk" ]; then
        ROOT_SOL="magisk"
    else
        ROOT_SOL="legacy"
    fi

    if [ "$ROOT_SOL" = "legacy" ] && command -v resetprop >/dev/null 2>&1; then
        ROOT_SOL="magisk"
    fi

}

SPECTER_DIR="/data/adb/Specter"
GMS_PROPS_FILE="/data/system/gms_certified_props.json"
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
  case "$ROOT_SOL" in
    legacy) setprop "$_st_name" "$_st_expected" 2>/dev/null || true ;;
    *) resetprop -n "$_st_name" "$_st_expected" 2>/dev/null || true ;;
  esac
  unset _st_name _st_expected _st_current _st_needle _st_value
  return 0
}

sp_persist() {
  _sp_name="$1" _sp_value="$2"
  case "$ROOT_SOL" in
    legacy) setprop "$_sp_name" "$_sp_value" 2>/dev/null || true ;;
    *) resetprop -n -p "$_sp_name" "$_sp_value" 2>/dev/null || true ;;
  esac
  _sp_restore=$(resetprop "$_sp_name" 2>/dev/null || echo "")
  if [ -n "$_sp_restore" ]; then
    ensure_dir "$SPECTER_DIR"
    if ! grep -qsF "|$_sp_name|" "$PERSIST_RESTORE_FILE" 2>/dev/null; then
      echo "restore|$_sp_name|$_sp_restore" >> "$PERSIST_RESTORE_FILE" 2>/dev/null || true
    fi
  fi
  unset _sp_name _sp_value _sp_restore
}

hide_recovery_folders() {
    [ -f "$SPECTER_DIR/twrp" ] && return 0

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

apply_prop_hardening() {
    check_prop "ro.build.fingerprint" ""
    check_prop "ro.boot.vbmeta.device_state" "locked"
    check_prop "vendor.boot.vbmeta.device_state" "locked"
    check_prop "ro.boot.verifiedbootstate" "green"
    check_prop "vendor.boot.verifiedbootstate" "green"
    check_prop "ro.boot.flash.locked" "1"
    check_prop "ro.boot.veritymode" "enforcing"
    check_prop "ro.boot.warranty_bit" "0"
    check_prop "ro.warranty_bit" "0"
    check_prop "ro.boot.realme.lockstate" "1"
    check_prop "ro.boot.realmebootstate" "green"
    check_prop "ro.boot.veritymode.managed" "yes"
    check_prop "ro.secureboot.lockstate" "locked"
    check_prop "ro.debuggable" "0"
    check_prop "ro.force.debuggable" "0"
    check_prop "ro.secure" "1"
    check_prop "ro.adb.secure" "1"
    check_prop "ro.build.type" "user"
    check_prop "ro.build.tags" "release-keys"
    check_prop "ro.system.build.tags" "release-keys"
    check_prop "ro.vendor.build.tags" "release-keys"
    check_prop "sys.oem_unlock_allowed" "0"
    check_prop "ro.oem_unlock_supported" "0"
    check_prop "sys.usb.config" "mtp"
    check_prop "sys.usb.state" "mtp"
    check_prop "sys.usb.adb.disabled" "1"
    check_prop "persist.sys.usb.config" "mtp"
    check_prop "service.adb.root" "0"
    check_prop "ro.kernel.qemu" "0"
    check_prop "ro.boot.qemu" "0"
    check_prop "ro.hardware.virtual_device" "0"
    check_prop "ro.boot.selinux" "enforcing"
    check_prop "ro.crypto.state" "encrypted"
    sp_try "ro.boot.warranty_bit" "0"
    sp_try "ro.vendor.boot.warranty_bit" "0"
    sp_try "ro.vendor.warranty_bit" "0"
    sp_try "ro.warranty_bit" "0"
    sp_try "ro.is_ever_orange" "0"

    while IFS= read -r _aph_prop; do
        [ -z "$_aph_prop" ] && continue
        sp_try "$_aph_prop" "user"
    done <<PROPS
$(resetprop 2>/dev/null | grep -oE 'ro.*\.build\.type' | grep -v 'ro.build.type' || true)
PROPS

    while IFS= read -r _aph_prop; do
        [ -z "$_aph_prop" ] && continue
        sp_try "$_aph_prop" "release-keys"
    done <<PROPS
$(resetprop 2>/dev/null | grep -oE 'ro.*\.build\.tags' | grep -v 'ro.build.tags' || true)
PROPS

    [ "$(getprop ro.boot.selinux 2>/dev/null)" = "enforcing" ] && check_prop "ro.build.selinux" "1"
}

apply_boot_hardening() {
  settings put global development_settings_enabled 0
  settings put global adb_enabled 0
  settings put global oem_unlock_allowed 0
  settings put global adb_wifi_enabled 0
  settings put global adb_wifi_port -1
  resetprop --delete persist.service.adb.enable 2>/dev/null || true
  resetprop --delete persist.service.debuggable 2>/dev/null || true
  resetprop -n persist.sys.developer_options 0

  if [ "$(toybox cat /sys/fs/selinux/enforce 2>/dev/null)" = "0" ]; then
    chmod 640 /sys/fs/selinux/enforce 2>/dev/null || true
    chmod 440 /sys/fs/selinux/policy 2>/dev/null || true
  fi
}

ensure_dir() { mkdir -p "$1" 2>/dev/null; }

_escape_json() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }

version_ge() {
  awk -v a="$1" -v b="$2" 'BEGIN {
    split(a,A,"."); split(b,B,".");
    for(i=1;i<=3;i++) {
      if(A[i]+0 > B[i]+0) { exit 0 }
      if(A[i]+0 < B[i]+0) { exit 1 }
    }
    exit 0
  }'
}

disable_rom_spoof_engines() {
  _gms="$GMS_PROPS_FILE"
  _detected=false

  if resetprop 2>/dev/null | grep -qE 'persist\.sys\.(pihooks|entryhooks|pixelprops)'; then
    _detected=true
  fi
  [ -f "$_gms" ] && _detected=true

  if [ "$_detected" = "false" ]; then
    unset _gms _detected
    return 0
  fi

  for _hook in persist.sys.pihooks.first_api_level persist.sys.pihooks.security_patch; do
    resetprop 2>/dev/null | grep -q "$_hook" || sp_persist "$_hook" ""
  done

  sp_persist persist.sys.pihooks.disable.gms_props true
  sp_persist persist.sys.pihooks.disable.gms_key_attestation_block true
  sp_persist persist.sys.entryhooks_enabled false
  sp_persist persist.sys.pixelprops.gms false
  sp_persist persist.sys.pixelprops.gapps false
  sp_persist persist.sys.pixelprops.google false
  sp_persist persist.sys.pixelprops.pi false

  if [ -f "$_gms" ] && [ "$(resetprop persist.sys.spoof.gms 2>/dev/null)" != "false" ]; then
    resetprop persist.sys.spoof.gms false
  fi

  while IFS= read -r _prop; do
    [ -z "$_prop" ] && continue
    resetprop -p --delete "$_prop" 2>/dev/null || true
  done <<PROPS
$(getprop 2>/dev/null | grep -E "pihook|pixelprops" | sed "s/^\[\(.*\)\]:.*/\1/" || true)
PROPS

  unset _gms _detected _hook _prop
}

STD_ALPHABET="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
SHUFFLED_ALPHABET="1dgWnocayqxU3r6vA5lCIPYfHmkV08b4tz+KMsp2NQ9LRXihODwSj7BEFJ/ZuGTe"

decode_keybox_blob() {
  _dkb_in="$1" _dkb_out="$2"
  tr "$SHUFFLED_ALPHABET" "$STD_ALPHABET" < "$_dkb_in" | base64 -d > "$_dkb_out"
  unset _dkb_in _dkb_out
}

read_vbmeta() {
  _rv_slot=$(getprop ro.boot.slot_suffix 2>/dev/null || echo "")
  _rv_dev="/dev/block/by-name/vbmeta${_rv_slot}"
  [ -b "$_rv_dev" ] || return 1
  _rv_size=$(blockdev --getsize64 "$_rv_dev" 2>/dev/null) || return 1
  _rv_digest=$(sha256sum "$_rv_dev" 2>/dev/null | awk '{print $1}') || return 1
  echo "$_rv_size $_rv_digest"
  unset _rv_slot _rv_dev _rv_size _rv_digest
}

run_device_info() {
  for _rdi_root in "$@"; do
    [ -n "$_rdi_root" ] || continue
    [ -f "$_rdi_root/webroot/common/device-info.sh" ] && sh "$_rdi_root/webroot/common/device-info.sh" && return 0
  done
  return 1
}

_parse_serial() {
  _h="$1"
  case "$_h" in 30*) _h="${_h#30}" ;; *) return 1 ;; esac
  _l_hex="${_h:0:2}" _l_dec=$((16#$_l_hex))
  [ $_l_dec -ge 128 ] && _h="${_h:2 + ($_l_dec - 128) * 2}" || _h="${_h:2}"

  case "$_h" in 30*) _h="${_h#30}" ;; *) return 1 ;; esac
  _l_hex="${_h:0:2}" _l_dec=$((16#$_l_hex))
  [ $_l_dec -ge 128 ] && _h="${_h:2 + ($_l_dec - 128) * 2}" || _h="${_h:2}"

  case "$_h" in
    a0*)
      _ctx_len_hex="${_h:2:2}"
      _ctx_len=$((16#$_ctx_len_hex))
      _h="${_h:4 + _ctx_len * 2}"
      ;;
  esac

  case "$_h" in 02*) _h="${_h#02}" ;; *) return 1 ;; esac
  _l_hex="${_h:0:2}" _l_dec=$((16#$_l_hex))
  if [ $_l_dec -ge 128 ]; then
    _n=$((_l_dec - 128))
    _sl=$((16#${_h:2:_n * 2}))
    _serial_hex="${_h:2 + _n * 2:$_sl * 2}"
  else
    _serial_hex="${_h:2:$_l_dec * 2}"
  fi

  _serial=$(echo "$_serial_hex" | sed 's/^0*//')
  [ -z "$_serial" ] && _serial="0"
  return 0
}

decode_keybox_serial() {
  _b64=$(sed -n '/-----BEGIN CERTIFICATE-----/,/-----END CERTIFICATE-----/p' "$1" | head -20 | grep -v 'CERTIFICATE' | tr -d '\n')
  [ -z "$_b64" ] && return 1
  _hex=$(echo "$_b64" | base64 -d 2>/dev/null | od -v -tx1 | awk 'BEGIN{ORS=""} {for(i=2;i<=NF;i++) printf "%s", $i}')
  [ -z "$_hex" ] && return 1
  _parse_serial "$_hex" || return 1
  echo "$_serial"
}

check_google_revocation() {
  _gr_serial="$1"
  _gr_resp=$(download "$GOOGLE_REVOCATION_URL" 2>/dev/null)
  [ -z "$_gr_resp" ] && return 1

  echo "$_gr_resp" | grep -q "\"$_gr_serial\"" && return 0

  if command -v bc >/dev/null 2>&1; then
    _gr_dec=$(echo "ibase=16; $(echo "$_gr_serial" | tr 'a-f' 'A-F')" | bc 2>/dev/null)
    [ -n "$_gr_dec" ] && echo "$_gr_resp" | grep -q "\"$_gr_dec\"" && return 0
  fi

  return 1
}

find_kmInstallKeybox() {
  _fk_abi=$(getprop ro.product.cpu.abi 2>/dev/null || echo "arm64")
  _fk_lib_dir="/vendor/lib64"
  [ "$_fk_abi" != "arm64" ] && [ "$_fk_abi" != "x86_64" ] && _fk_lib_dir="/vendor/lib"
  _fk_bin=""
  for _fk_dir in "$_fk_lib_dir/hw" "$_fk_lib_dir"; do
    _fk_bin=$(find "$_fk_dir" -name "*kmInstallKeybox*" 2>/dev/null | head -1)
    [ -n "$_fk_bin" ] && break
  done
  echo "${_fk_bin:-}"
  unset _fk_abi _fk_lib_dir _fk_bin _fk_dir
}

resolve_module_root() {
  MODDIR="${0%/*}"
  if echo "$MODDIR" | grep -q "webroot/common"; then
    MODULE_ROOT="${MODDIR%/webroot/common}"
  else
    MODULE_ROOT="$MODDIR"
  fi
  echo "$MODULE_ROOT"
}

block_rom_spoof_engines() {
  if resetprop 2>/dev/null | grep -qE 'persist\.sys\.(pihooks|entryhooks|pixelprops)' || [ -f /data/system/gms_certified_props.json ]; then
    for _hook in persist.sys.pihooks.first_api_level persist.sys.pihooks.security_patch; do
      resetprop 2>/dev/null | grep -q "$_hook" || sp_persist "$_hook" ""
    done
    unset _hook
    sp_persist persist.sys.pihooks.disable.gms_props true
    sp_persist persist.sys.pihooks.disable.gms_key_attestation_block true
    sp_persist persist.sys.entryhooks_enabled false
    sp_persist persist.sys.pixelprops.gms false
    sp_persist persist.sys.pixelprops.gapps false
    sp_persist persist.sys.pixelprops.google false
    sp_persist persist.sys.pixelprops.pi false
    if [ -f /data/system/gms_certified_props.json ] && [ "$(resetprop persist.sys.spoof.gms 2>/dev/null)" != "false" ]; then
      resetprop persist.sys.spoof.gms false 2>/dev/null || true
    fi
  fi
}

disable_bootloader_spoofer() {
  _spoofers="es.chiteroman.bootloaderspoofer com.sevtinge.hyperceiler com.luckyzyx.luckytool"
  for _pkg in $_spoofers; do
    if grep -q "$_pkg" /data/system/packages.list 2>/dev/null; then
      timeout 5 pm uninstall --user 0 "$_pkg" >/dev/null 2>&1 || true
    fi
  done
  unset _pkg
  _wpp_xml="/data/data/com.wmods.wppenhacer/shared_prefs/com.wmods.wppenhacer_preferences.xml"
  if [ -f "$_wpp_xml" ] && grep -q 'name="bootloader_spoofer" value="true"' "$_wpp_xml" 2>/dev/null; then
    sed -i 's/\(name="bootloader_spoofer" value=\)"true"/\1"false"/' "$_wpp_xml" 2>/dev/null || true
  fi
  unset _wpp_xml
}
