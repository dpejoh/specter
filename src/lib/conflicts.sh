# shellcheck shell=sh
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

_feature_should_run() {
  _fsr_feature="$1" _fsr_default="${2:-1}"
  [ "$(cfg_get "toggle_$_fsr_feature" "$_fsr_default")" != "0" ] || return 1
  _conflict_claimed "$_fsr_feature" && return 1
  return 0
}

resolve_conflicts() {
  ensure_dir "$SPECTER_DIR"
  touch "$CONFLICT_BACKUP_FILE" 2>/dev/null || true

  migrate_conflict_config

  # Moved to boot_core.sh (needs PM service)
  while IFS='|' read -r _rc_id _rc_name _rc_scripts _rc_features _rc_type; do
    [ -z "$_rc_id" ] && continue
    _conflict_detect "$_rc_id" || continue

    case "$_rc_type" in
      aggressive)
        _conflict_apply_scripts "$_rc_scripts" "priority_specter"
        cfg_set "conflict_$_rc_id" "priority_specter"
        log "CONFLICT" "$_rc_name: 100% overlap, disabled, Specter covers all"
        ;;
      passive)
        cfg_set "conflict_$_rc_id" "priority_module"
        log "CONFLICT" "$_rc_name: partial overlap, defaulting to Module priority"
        ;;
    esac
  done <<EOF
$(_conflict_registry)
EOF
  unset _rc_id _rc_name _rc_scripts _rc_features _rc_type
}

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
    [ "$(_conflict_choice "$_cc_id")" = "priority_module" ] || continue
    _cc_claimed=0; break
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
