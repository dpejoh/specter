# shellcheck shell=sh
ROOT_SOL=""

log() { echo "[$1] $2"; }

die() { log "ERROR" "$1"; exit 1; }

download() {
    _dl_url="$1" _dl_output="$2" _dl_sha256="$3" _dl_oldpath="$PATH"
    PATH="/data/adb/ap/bin:/data/adb/ksu/bin:/data/adb/magisk:/data/data/com.termux/files/usr/bin:$PATH"
    _dl_tmp="" _dl_code=1 _dl_try=0 _dl_ua="Specter/1.0"

    if [ -z "$_dl_output" ]; then
        _dl_tmp=$(mktemp 2>/dev/null || echo "/data/local/tmp/.specter_dl_${$}_$(date +%s)")
        _dl_output="$_dl_tmp"
    fi

    for _dl_try in 1 2 3; do
        if busybox wget -T 10 --no-check-certificate -qO "$_dl_output" -U "$_dl_ua" "$_dl_url" 2>/dev/null; then
            [ -s "$_dl_output" ] && { _dl_code=0; break; }
        fi
        if command -v curl >/dev/null 2>&1 && curl --version >/dev/null 2>&1; then
            curl --connect-timeout 10 -Ls -o "$_dl_output" -A "$_dl_ua" "$_dl_url" 2>/dev/null && [ -s "$_dl_output" ] && { _dl_code=0; break; }
        fi
        sleep 1
    done

    if [ "$_dl_code" -eq 0 ] && [ -n "$_dl_sha256" ]; then
        _dl_sum=$(sha256sum "$_dl_output" 2>/dev/null | cut -d' ' -f1)
        if [ "$_dl_sum" != "$_dl_sha256" ]; then
            rm -f "$_dl_output"
            PATH="$_dl_oldpath"
            unset _dl_url _dl_output _dl_sha256 _dl_oldpath _dl_tmp _dl_code _dl_try _dl_sum _dl_ua
            return 1
        fi
    fi

    if [ -n "$_dl_tmp" ]; then
        [ "$_dl_code" -eq 0 ] && cat "$_dl_tmp"
        rm -f "$_dl_tmp"
    fi

    PATH="$_dl_oldpath"
    unset _dl_url _dl_output _dl_sha256 _dl_oldpath _dl_tmp _dl_code _dl_try _dl_sum _dl_ua
    return $_dl_code
}

check_network() {
    _cn_oldpath="$PATH"
    PATH="/data/adb/ap/bin:/data/adb/ksu/bin:/data/adb/magisk:/data/data/com.termux/files/usr/bin:$PATH"

    # Fast path: 1 DNS ping (2s timeout)
    ping -c1 -W2 "1.1.1.1" >/dev/null 2>&1 && PATH="$_cn_oldpath" && unset _cn_oldpath && return 0

    # Fallback: 1 HTTP check (5s timeout)
    if busybox wget -T 5 -qO /dev/null "https://clients3.google.com/generate_204" 2>/dev/null; then
        PATH="$_cn_oldpath"; unset _cn_oldpath; return 0
    fi
    if command -v curl >/dev/null 2>&1 && curl --version >/dev/null 2>&1; then
        curl --connect-timeout 5 -sI "https://clients3.google.com/generate_204" >/dev/null 2>&1 && PATH="$_cn_oldpath" && unset _cn_oldpath && return 0
    fi

    PATH="$_cn_oldpath"
    unset _cn_oldpath
    return 1
}

check_prop() {
    _cp_name=$1 _cp_expected=$2
    _cp_value=$(resetprop "$_cp_name" 2>/dev/null || echo "")
    [ -z "$_cp_value" ] || [ "$_cp_value" = "$_cp_expected" ] || resetprop -n "$_cp_name" "$_cp_expected" 2>/dev/null || true
    unset _cp_name _cp_expected _cp_value
}

detect_root_solution() {
    ROOT_TYPE="Unknown"; export ROOT_TYPE
    if [ -d "/data/adb/ap" ]; then
        ROOT_SOL="apatch"; ROOT_TYPE="APatch"
    elif [ -d "/data/adb/ksu" ]; then
        ROOT_SOL="kernelsu"
        if [ -f "/data/adb/ksu/.dynamic_sign" ]; then
            ROOT_TYPE="SukiSU-Ultra"
        elif [ -f "/sys/module/kernelsu/parameters/expected_manager_size" ]; then
            ROOT_TYPE="KernelSU-Next"
        else
            ROOT_TYPE="KernelSU"
        fi
    elif [ -f "/data/adb/magisk" ] || [ -f "/data/adb/magisk.db" ]; then
        ROOT_SOL="magisk"; ROOT_TYPE="Magisk"
    elif [ -f "/data/adb/ksud" ]; then
        ROOT_SOL="kernelsu"; ROOT_TYPE="KernelSU"
    elif [ -f "/data/adb/apd" ]; then
        ROOT_SOL="apatch"; ROOT_TYPE="APatch"
    elif command -v resetprop >/dev/null 2>&1; then
        ROOT_SOL="magisk"; ROOT_TYPE="Magisk"
    else
        ROOT_SOL="legacy"; ROOT_TYPE="Legacy"
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
    check_prop "ro.secure" "1"
    check_prop "ro.build.type" "user"
    check_prop "ro.build.tags" "release-keys"
    check_prop "ro.system.build.tags" "release-keys"
    check_prop "ro.vendor.build.tags" "release-keys"
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
    return 0
}

apply_boot_hardening() {
  if [ "$(toybox cat /sys/fs/selinux/enforce 2>/dev/null)" = "0" ]; then
    chmod 640 /sys/fs/selinux/enforce 2>/dev/null || true
    chmod 440 /sys/fs/selinux/policy 2>/dev/null || true
  fi
}

ensure_dir() { mkdir -p "$1" 2>/dev/null; }

# Data-driven boot prop application — single source of truth
apply_boot_props() {
  # 2-arg props: sp_try <prop> <value>
  while IFS='|' read -r _abp_prop _abp_val; do
    [ -z "$_abp_prop" ] && continue
    case "$_abp_prop" in
      ro.*.build.type)
        while IFS= read -r _abp_match; do
          [ -z "$_abp_match" ] && continue
          sp_try "$_abp_match" "user"
        done <<MATCHES
$(resetprop 2>/dev/null | grep -oE 'ro.*\.build\.type' | grep -v 'ro.build.type' || true)
MATCHES
        ;;
      ro.*.build.tags)
        while IFS= read -r _abp_match; do
          [ -z "$_abp_match" ] && continue
          sp_try "$_abp_match" "release-keys"
        done <<MATCHES
$(resetprop 2>/dev/null | grep -oE 'ro.*\.build\.tags' | grep -v 'ro.build.tags' || true)
MATCHES
        ;;
      *)
        sp_try "$_abp_prop" "$_abp_val"
        ;;
    esac
  done << PROPS
ro.build.selinux|1
ro.secure|1
ro.crypto.state|encrypted
ro.hardware.virtual_device|0
ro.build.type|user
ro.build.tags|release-keys
ro.*.build.type|user
ro.*.build.tags|release-keys
ro.warranty_bit|0
ro.vendor.warranty_bit|0
ro.is_ever_orange|0
ro.secureboot.lockstate|locked
ro.boot.vbmeta.device_state|locked
ro.boot.verifiedbootstate|green
ro.boot.flash.locked|1
ro.boot.veritymode|enforcing
vendor.boot.verifiedbootstate|green
vendor.boot.vbmeta.device_state|locked
ro.vendor.boot.warranty_bit|0
ro.boot.realmebootstate|green
ro.boot.realme.lockstate|1
PROPS
}

spoof_build_props() {
  _fb_flavor=$(resetprop ro.build.flavor 2>/dev/null || echo "")
  case "$_fb_flavor" in
    *userdebug*) sp_try "ro.build.flavor" "${_fb_flavor%userdebug}user" ;;
    *eng*)       sp_try "ro.build.flavor" "${_fb_flavor%eng}user" ;;
  esac
  unset _fb_flavor
}

_pif_prop() {
  [ ! -d "/data/adb/Box-Brain" ] || return 1
  [ -f "/data/adb/modules/playintegrityfix/module.prop" ] || return 1
  grep "^name=" "/data/adb/modules/playintegrityfix/module.prop" 2>/dev/null | cut -d= -f2
}

_ts_prop() {
  for _ts_dir in /data/adb/modules/tricky_store /data/adb/modules_update/tricky_store; do
    [ -f "$_ts_dir/module.prop" ] || continue
    grep "^name=" "$_ts_dir/module.prop" 2>/dev/null | cut -d= -f2
    return 0
  done
  echo ""
}

_is_teesimulator() {
  case "$(_ts_prop)" in
    *TEESimulator*) return 0 ;;
  esac
  [ -f "/data/adb/tricky_store/spoof_build_vars" ] && return 0
  return 1
}

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


STD_ALPHABET="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
SHUFFLED_ALPHABET="1dgWnocayqxU3r6vA5lCIPYfHmkV08b4tz+KMsp2NQ9LRXihODwSj7BEFJ/ZuGTe"

decode_keybox_blob() {
  _dkb_in="$1" _dkb_out="$2"
  tr "$SHUFFLED_ALPHABET" "$STD_ALPHABET" < "$_dkb_in" | base64 -d > "$_dkb_out"
  unset _dkb_in _dkb_out
}

run_device_info() {
  for _rdi_root in "$@"; do
    [ -n "$_rdi_root" ] || continue
    [ -f "$_rdi_root/webroot/common/device-info.sh" ] && sh "$_rdi_root/webroot/common/device-info.sh" && return 0
  done
  return 1
}

# shellcheck disable=SC3057,SC3052
_parse_serial() {
  _h="$1"
  # Check if shell supports string slicing — needed for DER parsing below
  case "${_h:0:1}" in "") return 1 ;; esac 2>/dev/null || { log "WARN" "Shell lacks string slicing — skipping serial decode"; return 1; }
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
  _b64=$(sed -n '/-----BEGIN CERTIFICATE-----/,/-----END CERTIFICATE-----/p; /-----END CERTIFICATE-----/q' "$1" | grep -v 'CERTIFICATE' | sed 's/^[[:space:]]*//' | tr -d '\n')
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
  for _fk_dir in "$_fk_lib_dir/hw" "$_fk_lib_dir" "/vendor/bin"; do
    _fk_bin=$(find "$_fk_dir" -iname "*kmInstallKeybox*" 2>/dev/null | head -1)
    [ -n "$_fk_bin" ] && break
  done
  echo "${_fk_bin:-}"
  unset _fk_abi _fk_lib_dir _fk_bin _fk_dir
}

block_rom_spoof_engines() {
  _brs_gate=false
  resetprop 2>/dev/null | grep -qE 'persist\.sys\.(pihooks|entryhooks|pixelprops)' && _brs_gate=true
  [ -f "$GMS_PROPS_FILE" ] && _brs_gate=true
  [ "$_brs_gate" = "false" ] && unset _brs_gate && return 0

  # Init missing persist props only (don't overwrite existing)
  for _brs_hook in persist.sys.pihooks.first_api_level persist.sys.pihooks.security_patch; do
    resetprop 2>/dev/null | grep -q "$_brs_hook" || sp_persist "$_brs_hook" ""
  done
  unset _brs_hook

  # Data-driven map for unconditional spoof engine blocks
  while IFS='|' read -r _brs_prop _brs_val; do
    sp_persist "$_brs_prop" "$_brs_val"
  done << MAP
persist.sys.pihooks.disable.gms_props|true
persist.sys.pihooks.disable.gms_key_attestation_block|true
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
    resetprop -p --delete "$_brs_prop" 2>/dev/null || true
  done << BRS_PROPS
$(getprop 2>/dev/null | grep -E "pihook|pixelprops" | sed "s/^\[\(.*\)\]:.*/\1/" || true)
BRS_PROPS

  unset _brs_gate _brs_prop _brs_val
}

disable_bootloader_spoofer() {
  if command -v cmd >/dev/null 2>&1; then
    if pm list packages 2>/dev/null | grep -q "es.chiteroman.bootloaderspoofer"; then
      cmd package uninstall --user 0 "es.chiteroman.bootloaderspoofer" >/dev/null 2>&1 || true
    fi
    cmd appops set com.wmods.wppenhacer POST_NOTIFICATIONS deny 2>/dev/null || true
  else
    # Fallback for older Android — use pm + sed
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

CONFLICT_BACKUP_FILE="/data/adb/Specter/conflict_backups.txt"

_conflict_registry() { cat "$MODDIR/config/conflicts.txt" 2>/dev/null || true; }

_conflict_detect() {
  _cd_modid="$1"
  case "$_cd_modid" in
    integritybox)
      [ -d "/data/adb/modules/playintegrityfix" ] && [ -d "/data/adb/Box-Brain" ]
      ;;
    *)
      [ -d "/data/adb/modules/$_cd_modid" ] || [ -d "/data/adb/modules_update/$_cd_modid" ]
      ;;
  esac
}

_conflict_choice() {
  _cc_key="$1"
  cfg_get "conflict_$_cc_key" "priority_specter"
}

_conflict_rename_bak() {
  _cr_path="$1"
  [ -f "$_cr_path" ] || return 0
  [ -f "$_cr_path.bak" ] && return 0
  mv "$_cr_path" "$_cr_path.bak" 2>/dev/null || true
  echo "$_cr_path" >> "$CONFLICT_BACKUP_FILE" 2>/dev/null || true
}

_conflict_restore_bak() {
  _cr_path="$1"
  [ -f "$_cr_path.bak" ] || return 0
  mv "$_cr_path.bak" "$_cr_path" 2>/dev/null || true
}

_conflict_apply_scripts() {
  _cas_scripts="$1"
  _cas_choice="$2"
  _cas_old_ifs="$IFS"
  IFS=','
  for _cas_script in $_cas_scripts; do
    [ -z "$_cas_script" ] && continue
    if [ "$_cas_choice" = "priority_module" ]; then
      _conflict_restore_bak "$_cas_script"
    else
      _conflict_rename_bak "$_cas_script"
    fi
  done
  IFS="$_cas_old_ifs"
  unset _cas_scripts _cas_choice _cas_old_ifs _cas_script
}

migrate_conflict_config() {
  _mc_old_dir="/data/adb/Specter/config"
  [ -d "$_mc_old_dir" ] || return 0
  while IFS='|' read -r _mc_id _mc_name _mc_scripts _mc_features _mc_type; do
    [ -z "$_mc_id" ] && continue
    _mc_old_file="$_mc_old_dir/conflict_$_mc_id.val"
    [ -f "$_mc_old_file" ] || continue
    _mc_current=$(cfg_get "conflict_$_mc_id" "__specter_unset__")
    if [ "$_mc_current" = "__specter_unset__" ]; then
      _mc_old_val=$(cat "$_mc_old_file" 2>/dev/null | tr -d '\r\n')
      case "$_mc_old_val" in
        priority_specter|priority_module) cfg_set "conflict_$_mc_id" "$_mc_old_val" ;;
      esac
    fi
  done <<EOF
$(_conflict_registry)
EOF
  unset _mc_old_dir _mc_id _mc_name _mc_scripts _mc_features _mc_type _mc_old_file _mc_current _mc_old_val
}

_feature_enabled() { [ "$(cfg_get "$1" "${2:-1}")" != "0" ]; }

# Single toggle+conflict check used by boot_core.sh dispatcher
_feature_should_run() {
  _fsr_feature="$1"
  [ "$(cfg_get "toggle_$_fsr_feature" 1)" != "0" ] || return 1
  _conflict_claimed "$_fsr_feature" && return 1
  return 0
}

resolve_conflicts() {
  ensure_dir "$SPECTER_DIR"
  touch "$CONFLICT_BACKUP_FILE" 2>/dev/null || true

  migrate_conflict_config

  # Silent cleanup of conflicting bootloader spoofer
  disable_bootloader_spoofer

  while IFS='|' read -r _rc_id _rc_name _rc_scripts _rc_features _rc_type; do
    [ -z "$_rc_id" ] && continue
    _conflict_detect "$_rc_id" || continue

    case "$_rc_type" in
      aggressive)
        # 100% overlap — silently disable the other module, Specter handles it
        _conflict_apply_scripts "$_rc_scripts" "priority_specter"
        cfg_set "conflict_$_rc_id" "priority_specter"
        log "CONFLICT" "$_rc_name: 100% overlap — disabled, Specter covers all"
        ;;
      passive)
        # Partial overlap — both coexist, user decides via WebUI which handles shared features
        cfg_set "conflict_$_rc_id" "priority_module"
        log "CONFLICT" "$_rc_name: partial overlap — defaulting to Module priority"
        ;;
    esac
  done <<EOF
$(_conflict_registry)
EOF
  unset _rc_id _rc_name _rc_scripts _rc_features _rc_type
}

# Check if ANY installed conflicting module claims a feature
_conflict_claimed() {
  _cc_feature="$1"
  _cc_claimed=1
  while IFS='|' read -r _cc_id _cc_name _cc_scripts _cc_features _cc_type; do
    [ -z "$_cc_id" ] && continue
    _conflict_detect "$_cc_id" || continue
    case ",$_cc_features," in
      *",$_cc_feature,"*) ;;
      *) continue ;;
    esac
    case "$_cc_type" in
      passive)
        # Only claim if user chose module priority — otherwise Specter handles it
        [ "$(_conflict_choice "$_cc_id")" = "priority_module" ] || continue
        _cc_claimed=0; break
        ;;
      aggressive)
        # Only claim if user (or auto-resolution) gave it priority
        [ "$(_conflict_choice "$_cc_id")" = "priority_module" ] || continue
        _cc_claimed=0; break
        ;;
    esac
  done <<EOF
$(_conflict_registry)
EOF
  unset _cc_id _cc_name _cc_scripts _cc_features _cc_type
  return $_cc_claimed
}

conflict_status_json() {
  migrate_conflict_config
  _cs_first=1
  printf '['
  while IFS='|' read -r _cs_id _cs_name _cs_scripts _cs_features _cs_type; do
    [ -z "$_cs_id" ] && continue
    _conflict_detect "$_cs_id" || continue
    _cs_choice="$(_conflict_choice "$_cs_id")"
    _cs_priority=true
    [ "$_cs_choice" = "priority_module" ] && _cs_priority=false
    _cs_name_json="$(_escape_json "$_cs_name")"
    if [ "$_cs_first" -eq 0 ]; then printf ','; else _cs_first=0; fi
    printf '{"key":"%s","friendlyName":"%s","detected":true,"prioritySpecter":%s,"type":"%s"}' "$_cs_id" "$_cs_name_json" "$_cs_priority" "$_cs_type"
  done <<EOF
$(_conflict_registry)
EOF
  printf ']'
  unset _cs_first _cs_id _cs_name _cs_scripts _cs_features _cs_type _cs_choice _cs_priority _cs_name_json
}

conflict_set_choice() {
  _csc_key="$1"
  _csc_choice="$2"
  case "$_csc_choice" in
    priority_specter|priority_module) ;; *) return 1 ;;
  esac
  migrate_conflict_config
  ensure_dir "$SPECTER_DIR"
  touch "$CONFLICT_BACKUP_FILE" 2>/dev/null || true
  _csc_found=1
  while IFS='|' read -r _csc_id _csc_name _csc_scripts _csc_features _csc_type; do
    [ -z "$_csc_id" ] && continue
    [ "$_csc_id" = "$_csc_key" ] || continue
    _csc_found=0
    cfg_set "conflict_$_csc_id" "$_csc_choice"
    # Only rename scripts for aggressive-type modules
    if _conflict_detect "$_csc_id" && [ "$_csc_type" = "aggressive" ]; then
      _conflict_apply_scripts "$_csc_scripts" "$_csc_choice"
    fi
    break
  done <<EOF
$(_conflict_registry)
EOF
  unset _csc_key _csc_choice _csc_id _csc_name _csc_scripts _csc_features _csc_type
  return $_csc_found
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
    "$_hd_magiskboot" hexpatch "$_hd_path" "$_hd_search_hex" "$_hd_replacement_hex" >/dev/null 2>&1 || resetprop -p --delete "$_hd_prop" 2>/dev/null || true
  else
    resetprop -p --delete "$_hd_prop" 2>/dev/null || true
  fi
  unset _hd_prop _hd_magiskboot _hd_file _hd_path _hd_search_hex _hd_search_len _hd_replacement _hd_replacement_hex
}
