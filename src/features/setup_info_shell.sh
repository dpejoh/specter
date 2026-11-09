#!/system/bin/sh
# shellcheck shell=ksh
set -e
MODDIR=${0%/*}
. "$MODDIR/../lib/common.sh"
. "$MODDIR/../lib/constants.sh"

# The generic helper spawns sed for every field. This script writes ~30 fields,
# and each process costs ~100 ms on Android, so use mksh's built-in expansion.
_escape_json() {
  _ej_val=$1
  _ej_val=${_ej_val//\\/\\\\}
  _ej_val=${_ej_val//\"/\\\"}
  printf '%s' "$_ej_val"
  unset _ej_val
}

INFO_PATH="${SPECTER_SETUP_INFO:-$MODDIR/../webroot/json/setup_info.json}"
ensure_dir "$(dirname "$INFO_PATH")"

_now=$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || echo "")
detect_root_solution >/dev/null 2>&1 || true
detect_keystore_manager

_dash() { [ -n "$1" ] && printf '%s' "$1" || printf '%s' "—"; }
_onoff() { [ "$1" = "1" ] && printf '%s' "On" || printf '%s' "Off"; }
_fmt_interval() {
  _fi=$1
  if [ "$_fi" -ge 3600 ] 2>/dev/null; then
    printf '%s h' "$((_fi / 3600))"
  elif [ "$_fi" -ge 60 ] 2>/dev/null; then
    printf '%s min' "$((_fi / 60))"
  else
    printf '%s s' "${_fi:-0}"
  fi
}

_prop_value() {
  _pv_file=$1 _pv_key=$2
  [ -f "$_pv_file" ] || { unset _pv_file _pv_key; return 1; }
  while IFS='=' read -r _pv_k _pv_v; do
    if [ "$_pv_k" = "$_pv_key" ]; then
      printf '%s' "$_pv_v"
      unset _pv_file _pv_key _pv_k _pv_v
      return 0
    fi
  done < "$_pv_file"
  unset _pv_file _pv_key _pv_k _pv_v
  return 1
}

_module_id_for() {
  case "$1" in
    trickystore) printf '%s' "tricky_store" ;;
    teesim) printf '%s' "teesim" ;;
    omk) printf '%s' "${OMK_MODULE##*/}" ;;
    pif) printf '%s' "playintegrityfix" ;;
    zygisk) printf '%s' "zygisksu" ;;
    *) printf '%s' "$1" ;;
  esac
}

_module_dir_for() {
  _mdf_id=$(_module_id_for "$1")
  for _mdf_dir in "$MODULES_BASE/$_mdf_id" "${MODULES_BASE}_update/$_mdf_id"; do
    if [ -f "$_mdf_dir/module.prop" ]; then
      printf '%s\n' "$_mdf_dir"
      unset _mdf_id _mdf_dir
      return 0
    fi
  done
  unset _mdf_id _mdf_dir
  return 1
}

_module_version() {
  _mv_dir=$(_module_dir_for "$1" 2>/dev/null || true)
  [ -n "$_mv_dir" ] || { unset _mv_dir; return 1; }
  _prop_value "$_mv_dir/module.prop" version
  unset _mv_dir
}

_module_enabled() {
  _me_dir=$(_module_dir_for "$1" 2>/dev/null || true)
  [ -n "$_me_dir" ] || { unset _me_dir; return 1; }
  if [ -f "$_me_dir/disable" ]; then
    _me_rc=1
  else
    _me_rc=0
  fi
  unset _me_dir
  return $_me_rc
}

_pif_read() {
  for _pr_file in \
    "/data/adb/pif.prop" \
    "$PIF_DIR/custom.pif.prop" \
    "/data/adb/pif.json" \
    "$PIF_DIR/pif.json" \
    "$PIF_DIR/autopif.json" \
    "$PIF_DIR/custom.pif.json"; do
    [ -f "$_pr_file" ] || continue
    case "$_pr_file" in
      *.prop)
        _pr_val=$(_prop_value "$_pr_file" "$1" 2>/dev/null || true)
        ;;
      *.json)
        _pr_val=$(grep -o "\"$1\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" "$_pr_file" 2>/dev/null \
          | head -1 | sed 's/.*:[[:space:]]*"\([^"]*\)"/\1/' || true)
        ;;
    esac
    if [ -n "$_pr_val" ]; then
      printf '%s\n' "$_pr_val"
      unset _pr_file _pr_val
      return 0
    fi
  done
  unset _pr_file _pr_val
  return 1
}

_rows=""
_row() {
  _row_json=$(printf '{"label":"%s","value":"%s"}' \
    "$(_escape_json "$1")" "$(_escape_json "$2")")
  _rows="${_rows}${_rows:+,}${_row_json}"
  unset _row_json
}

_mods=""
_emit_module() {
  _em_id=$1 _em_name=$2 _em_version=$3 _em_rows=$4
  _em_json=$(printf '{"id":"%s","name":"%s","version":"%s","rows":[%s]}' \
    "$(_escape_json "$_em_id")" \
    "$(_escape_json "$_em_name")" \
    "$(_escape_json "$_em_version")" \
    "$_em_rows")
  _mods="${_mods}${_mods:+,}${_em_json}"
  unset _em_id _em_name _em_version _em_rows _em_json
}

_features=""
_feature() {
  _feature_json=$(printf '{"label":"%s","value":"%s"}' \
    "$(_escape_json "$1")" "$(_escape_json "$2")")
  _features="${_features}${_features:+,}${_feature_json}"
  unset _feature_json
}

_warnings=""
_warn() {
  _warn_json="\"$(_escape_json "$1")\""
  _warnings="${_warnings}${_warnings:+,}${_warn_json}"
  unset _warn_json
}

# ── Device ──────────────────────────────────────────────────
_android=$(getprop ro.build.version.release 2>/dev/null || true)
_specter_version=$(_prop_value "$MODDIR/../module.prop" version 2>/dev/null || true)
_effective_patch=$(ksm_get_security_patch 2>/dev/null || true)
[ -n "$_effective_patch" ] || _effective_patch=$(getprop ro.build.version.security_patch 2>/dev/null || true)
# ── Keystore backend ────────────────────────────────────────
_keystore_target_count=0
if [ "$KSM" != "none" ] && [ -n "$KSM_TARGETS" ] && [ -f "$KSM_TARGETS" ]; then
  _keystore_target_count=$(ksm_read_targets 2>/dev/null | wc -l | tr -d ' ' || true)
  [ -n "$_keystore_target_count" ] || _keystore_target_count=0
fi

if [ "$KSM" = "none" ]; then
  _ksm_state="Not installed"
  _rows=""
  _row "State" "$_ksm_state"
  _emit_module "keystore" "Keystore backend" "" "$_rows"
  _warn "No supported keystore backend detected"
else
  if _module_enabled "$KSM" 2>/dev/null; then
    _ksm_state="Enabled"
  else
    _ksm_state="Disabled"
  fi
  _rows=""
  _row "State" "$_ksm_state"
  _row "Target count" "$_keystore_target_count"

  if [ "$KSM" = "omk" ]; then
    _omk_log=$(grep -E '^[ ]*log_level[ ]*=' "$OMK_CONFIG" 2>/dev/null | head -1 | sed 's/.*=[ ]*//; s/^"//; s/"$//' || true)
    _omk_os=$(_toml_get_trust_key "$OMK_CONFIG" os_version 2>/dev/null || true)
    _omk_patch=$(_toml_get_trust_key "$OMK_CONFIG" security_patch 2>/dev/null || true)
    _omk_vb=$(_toml_get_trust_key "$OMK_CONFIG" verified_boot_state 2>/dev/null || true)
    _omk_lock=$(_toml_get_trust_key "$OMK_CONFIG" device_locked 2>/dev/null || true)
    _omk_scoop=$( _toml_read_scoop "$OMK_INJECTOR" 2>/dev/null | wc -l | tr -d ' ' || true)
    _row "Log level" "$(_dash "$_omk_log")"
    _row "Reported OS version" "$(_dash "$_omk_os")"
    _row "Trust security patch" "$(_dash "$_omk_patch")"
    _row "Verified boot state" "$(_dash "$_omk_vb")"
    _row "Device locked" "$(_dash "$_omk_lock")"
    _row "Scoop packages" "${_omk_scoop:-0}"
  fi

  _emit_module "keystore" "$KSM_NAME" "$(_module_version "$KSM" 2>/dev/null || true)" "$_rows"
fi

# ── Play Integrity Fix ──────────────────────────────────────
_pif_present=0
_pif_dir="$PIF_DIR"
if [ -f "$_pif_dir/module.prop" ]; then
  _pif_present=1
  _pif_name=$(_prop_value "$_pif_dir/module.prop" name 2>/dev/null || true)
  _pif_version=$(_module_version pif 2>/dev/null || true)
  _pif_model=$(_pif_read MODEL 2>/dev/null || true)
  _pif_manufacturer=$(_pif_read MANUFACTURER 2>/dev/null || true)
  _spoofed_device="${_pif_manufacturer}${_pif_manufacturer:+ }${_pif_model}"
  if _module_enabled pif 2>/dev/null; then _pif_state="Enabled"; else _pif_state="Disabled"; fi
  _rows=""
  _row "State" "$_pif_state"
  _row "Spoofed device" "$(_dash "$_spoofed_device")"
  _emit_module "pif" "$(_dash "$_pif_name")" "$_pif_version" "$_rows"
  unset _pif_name _pif_version _pif_state _pif_model _pif_manufacturer _spoofed_device
fi
unset _pif_dir

# ── HMA-OSS ─────────────────────────────────────────────────
_hma_dir=$(_hma_find_dir 2>/dev/null || true)
if [ -n "$_hma_dir" ] && [ -f "$_hma_dir/config.json" ]; then
  _hma_cfg="$_hma_dir/config.json"
  _hma_ver=$(cat /data/adb/modules/hma_oss_zygisk/module.prop /data/adb/modules_update/hma_oss_zygisk/module.prop \
    /data/adb/modules/hma_oss/module.prop /data/adb/modules_update/hma_oss/module.prop 2>/dev/null \
    | sed -n 's/^version=//p' | head -1)
  [ -n "$_hma_ver" ] || _hma_ver=$(dumpsys package org.frknkrc44.hma_oss 2>/dev/null \
    | sed -n 's/.*versionName=//p' | head -1)
  _hma_ver_num=$(printf '%s' "$_hma_ver" | sed -n 's/.*oss-\([0-9][0-9]*\).*/\1/p')
  [ -n "$_hma_ver_num" ] || _hma_ver_num=$(printf '%s' "$_hma_ver" | grep -o '[0-9][0-9]*' | head -1 || true)
  _hma_auto_reload="No"
  [ -n "$_hma_ver_num" ] && [ "$_hma_ver_num" -ge 175 ] && _hma_auto_reload="Yes"
  _rows=""
  _row "Auto-reload" "$_hma_auto_reload"
  _emit_module "hma" "HMA-OSS" "$_hma_ver" "$_rows"
  unset _hma_cfg _hma_ver _hma_ver_num _hma_auto_reload
  _hma_present=1
else
  _hma_present=0
fi
unset _hma_dir

# ── Zygisk Next ─────────────────────────────────────────────
if _module_dir_for zygisk >/dev/null 2>&1; then
  _zn_version=$(_module_version zygisk 2>/dev/null || true)
  if _module_enabled zygisk 2>/dev/null; then _zn_state=true; else _zn_state=false; fi
  _rows=""
  _row "State" "$([ "$_zn_state" = true ] && echo "Enabled" || echo "Disabled")"
  _emit_module "zygisk" "Zygisk Next" "$_zn_version" "$_rows"
  unset _zn_version _zn_state
fi

# ── Specter feature states ───────────────────────────────────
_feature "Auto Target" "$(_onoff "$(cfg_get toggle_auto_target 1)") · $(_fmt_interval "$(cfg_get auto_target_interval 300)")"
_feature "Keybox refresh" "$(_onoff "$(cfg_get toggle_keybox_info 1)") · $(_fmt_interval "$(cfg_get keybox_watch_interval 3600)") · replace $([ "$(cfg_get toggle_keybox_auto_replace 1)" = "1" ] && echo "on" || echo "off")"
if [ "$_hma_present" = "1" ]; then
  _feature "Auto HMA config" "$(_onoff "$(cfg_get toggle_auto_hma 0)") · $(_fmt_interval "$(cfg_get hma_interval 21600)")"
fi
if [ "$_pif_present" = "1" ]; then
  _feature "Auto PIF" "$(_onoff "$(cfg_get toggle_autopif 0)")"
fi
_feature "Security patch action" "$(_onoff "$(cfg_get toggle_action_security_patch 0)")"

# ── Warnings ────────────────────────────────────────────────
_keybox_info="${SPECTER_KEYBOX_INFO:-$MODDIR/../webroot/json/keybox_info.json}"
if [ -f "$_keybox_info" ]; then
  _kb_info=$(cat "$_keybox_info" 2>/dev/null || true)
  case "$_kb_info" in *'"installed": false'*) _warn "No keybox is installed" ;; esac
  case "$_kb_info" in *'"revoked": true'*) _warn "The installed keybox is revoked" ;; esac
  case "$_kb_info" in *'"expired": true'*) _warn "The installed keybox is expired" ;; esac
  unset _kb_info
fi

_tmp="${INFO_PATH}.tmp.$$"
cat <<EOF > "$_tmp"
{
  "generated_at": "$(_escape_json "$_now")",
  "device": {
    "android": "$(_escape_json "$_android")",
    "root": "$(_escape_json "$ROOT_TYPE")",
    "specter": "$(_escape_json "$_specter_version")",
    "effective_patch": "$(_escape_json "$_effective_patch")"
  },
  "modules": [$_mods],
  "features": [$_features],
  "warnings": [$_warnings]
}
EOF
chmod 644 "$_tmp" 2>/dev/null || true
mv -f "$_tmp" "$INFO_PATH" 2>/dev/null || rm -f "$_tmp"

unset _now _android _specter_version _effective_patch
unset _pif_present _hma_present
unset _rows _mods _features _warnings _keybox_info _ksm_state _tmp
log_i "SETUP_INFO" "Setup snapshot written to $INFO_PATH"
exit 0
