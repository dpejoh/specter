# shellcheck shell=sh
CONFLICT_BACKUP_FILE="$SPECTER_DIR/conflict_backups.txt"

_conflict_registry() {
  cat "$SPECTER_DIR/config/conflicts.txt" 2>/dev/null ||
  cat "$MODDIR/config/conflicts.txt" 2>/dev/null || true
}

_conflict_detect() {
  _cd_modid="$1"
  case "$_cd_modid" in
    integritybox)
      [ -d "$MODULES_BASE/playintegrityfix" ] && [ -d "/data/adb/Box-Brain" ]
      ;;
    *)
      [ -d "$MODULES_BASE/$_cd_modid" ] ||
      [ -d "${MODULES_BASE}_update/$_cd_modid" ] ||
      [ -d "$MODULES_BASE/.$_cd_modid" ] ||
      [ -d "${MODULES_BASE}_update/.$_cd_modid" ]
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
  grep -qxF "$_cr_path" "$CONFLICT_BACKUP_FILE" 2>/dev/null ||
    echo "$_cr_path" >> "$CONFLICT_BACKUP_FILE" 2>/dev/null || true
}

_conflict_restore_bak() {
  _cr_path="$1"
  [ -f "$_cr_path.bak" ] || return 0
  mv "$_cr_path.bak" "$_cr_path" 2>/dev/null || true
}

_conflict_uninstall() {
  _cu_id="$1"
  _cu_name="$2"
  _cu_removed=1
  # Map registry IDs to actual module directory names
  _cu_dir="$MODULES_BASE/$_cu_id"
  case "$_cu_id" in
    integritybox) _cu_dir="$MODULES_BASE/playintegrityfix" ;;
  esac
  _cu_dir_upd="${MODULES_BASE}_update/${_cu_dir##*/}"
  for _cu_path in "$_cu_dir" "$_cu_dir_upd"; do
    [ -d "$_cu_path" ] || continue
    [ -f "$_cu_path/uninstall.sh" ] && sh "$_cu_path/uninstall.sh" 2>/dev/null || true
    rm -rf "$_cu_path"
    log "CONFLICT" "Uninstalled $_cu_name ($_cu_id)"
    _cu_removed=0
  done
  # integritybox also stores state in Box-Brain
  [ "$_cu_id" = "integritybox" ] && [ -d "/data/adb/Box-Brain" ] && {
    rm -rf "/data/adb/Box-Brain"
    log "CONFLICT" "Uninstalled Box-Brain (integritybox state)"
  }
  # Strip any backup entries for scripts in the removed module
  [ "$_cu_removed" = "0" ] && [ -f "$CONFLICT_BACKUP_FILE" ] &&
    sed -i "\|/$_cu_id/|d" "$CONFLICT_BACKUP_FILE" 2>/dev/null || true
  unset _cu_id _cu_name _cu_dir _cu_dir_upd _cu_path _cu_removed
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

# Map a conflict feature name to its toggle config key.
# action-pipeline features use the toggle_action_ prefix.
_conflict_toggle_key() {
  case "$1" in
    target|security_patch) printf 'toggle_action_%s' "$1" ;;
    *) printf 'toggle_%s' "$1" ;;
  esac
  unset _ctk_f
}

_feature_should_run() {
  _fsr_feature="$1" _fsr_default="${2:-1}"
  _fsr_key="$(_conflict_toggle_key "$_fsr_feature")"
  [ "$(cfg_get "$_fsr_key" "$_fsr_default")" != "0" ] || return 1
  return 0
}

resolve_conflicts() {
  ensure_dir "$SPECTER_DIR"
  touch "$CONFLICT_BACKUP_FILE" 2>/dev/null || true

  while IFS='|' read -r _rc_id _rc_name _rc_scripts _rc_features _rc_type; do
    [ -z "$_rc_id" ] && continue
    _conflict_detect "$_rc_id" || continue

    case "$_rc_type" in
      aggressive)
        case "$_rc_id" in
          Yurikey|integritybox|tsupport-advance|sensitive_props)
            _conflict_uninstall "$_rc_id" "$_rc_name"
            log "CONFLICT" "$_rc_name: 100% overlap, uninstalled"
            ;;
          *)
            _conflict_apply_scripts "$_rc_scripts" "priority_specter"
            log "CONFLICT" "$_rc_name: 100% overlap, disabled, Specter covers all"
            ;;
        esac
        cfg_set "conflict_$_rc_id" "priority_specter"
        ;;
      passive)
        if [ ! -f "$CONFIG_DIR/conflict_$_rc_id.val" ]; then
          cfg_set "conflict_$_rc_id" "priority_module"
          log "CONFLICT" "$_rc_name: partial overlap, defaulting to Module priority"
        fi
        # Sync claimed features to toggles (only set default, don't overwrite user)
        _rc_old_ifs="$IFS"
        IFS=','
        for _rc_feature in $_rc_features; do
          [ -z "$_rc_feature" ] && continue
          _rc_toggle_key="$(_conflict_toggle_key "$_rc_feature")"
          [ -f "$CONFIG_DIR/$_rc_toggle_key.val" ] || cfg_set "$_rc_toggle_key" "0"
        done
        IFS="$_rc_old_ifs"
        ;;
    esac
  done <<EOF
$(_conflict_registry)
EOF
  unset _rc_id _rc_name _rc_scripts _rc_features _rc_type
}

_conflict_claimed() {
  _cc_feature="$1"
  # First pass: if any aggressive module with priority_specter covers this feature,
  # Specter is now the designated handler — no other module can claim it
  while IFS='|' read -r _cc_id _cc_name _cc_scripts _cc_features _cc_type; do
    [ -z "$_cc_id" ] && continue
    _conflict_detect "$_cc_id" || continue
    case ",$_cc_features," in *",$_cc_feature,"*) ;; *) continue ;; esac
    [ "$_cc_type" = "aggressive" ] || continue
    [ "$(_conflict_choice "$_cc_id")" = "priority_specter" ] || continue
    unset _cc_id _cc_name _cc_scripts _cc_features _cc_type _cc_feature
    return 1  # not claimed — Specter handles it
  done <<EOF
$(_conflict_registry)
EOF
  # Second pass: check if any module (any type) has priority_module for this feature
  while IFS='|' read -r _cc_id _cc_name _cc_scripts _cc_features _cc_type; do
    [ -z "$_cc_id" ] && continue
    _conflict_detect "$_cc_id" || continue
    case ",$_cc_features," in *",$_cc_feature,"*) ;; *) continue ;; esac
    [ "$(_conflict_choice "$_cc_id")" = "priority_module" ] || continue
    unset _cc_id _cc_name _cc_scripts _cc_features _cc_type _cc_feature
    return 0  # claimed by this module
  done <<EOF
$(_conflict_registry)
EOF
  unset _cc_id _cc_name _cc_scripts _cc_features _cc_type _cc_feature
  return 1  # not claimed
}

conflict_status_json() {
  _cs_first=1
  printf '['
  while IFS='|' read -r _cs_id _cs_name _cs_scripts _cs_features _cs_type; do
    [ -z "$_cs_id" ] && continue
    _conflict_detect "$_cs_id" || continue
    _cs_choice="$(_conflict_choice "$_cs_id")"
    _cs_priority=true
    [ "$_cs_choice" = "priority_module" ] && _cs_priority=false
    _cs_name_json="$(_escape_json "$_cs_name")"
    _cs_features_json="$(_escape_json "$_cs_features")"
    if [ "$_cs_first" -eq 0 ]; then printf ','; else _cs_first=0; fi
    printf '{"key":"%s","friendlyName":"%s","detected":true,"prioritySpecter":%s,"type":"%s","features":"%s"}' "$_cs_id" "$_cs_name_json" "$_cs_priority" "$_cs_type" "$_cs_features_json"
  done <<EOF
$(_conflict_registry)
EOF
  printf ']'
  unset _cs_first _cs_id _cs_name _cs_scripts _cs_features _cs_type _cs_choice _cs_priority _cs_name_json _cs_features_json
}

conflict_set_choice() {
  _csc_key="$1"
  _csc_choice="$2"
  case "$_csc_choice" in
    priority_specter|priority_module) ;; *) return 1 ;;
  esac
  ensure_dir "$SPECTER_DIR"
  touch "$CONFLICT_BACKUP_FILE" 2>/dev/null || true
  _csc_found=1
  while IFS='|' read -r _csc_id _csc_name _csc_scripts _csc_features _csc_type; do
    [ -z "$_csc_id" ] && continue
    [ "$_csc_id" = "$_csc_key" ] || continue
    _csc_found=0
    cfg_set "conflict_$_csc_id" "$_csc_choice"
    if _conflict_detect "$_csc_id"; then
      if [ "$_csc_type" = "aggressive" ]; then
        _conflict_apply_scripts "$_csc_scripts" "$_csc_choice"
      else
        # passive: sync toggles to match the new priority
        _csc_old_ifs="$IFS"
        IFS=','
        for _csc_feature in $_csc_features; do
          [ -z "$_csc_feature" ] && continue
          _csc_toggle_key="$(_conflict_toggle_key "$_csc_feature")"
          if [ "$_csc_choice" = "priority_specter" ]; then
            cfg_set "$_csc_toggle_key" "1"
          else
            [ -f "$CONFIG_DIR/$_csc_toggle_key.val" ] || cfg_set "$_csc_toggle_key" "0"
          fi
        done
        IFS="$_csc_old_ifs"
      fi
    fi
    break
  done <<EOF
$(_conflict_registry)
EOF
  unset _csc_key _csc_choice _csc_id _csc_name _csc_scripts _csc_features _csc_type
  return $_csc_found
}

# Called when a user toggles a feature ON in the web UI.
# Finds any module that claims this feature and switches it to priority_specter,
# then ensures the toggle is set to 1.
conflict_resolve_for_feature() {
  _crf_feature="$1"
  _crf_toggle_key="$(_conflict_toggle_key "$_crf_feature")"
  while IFS='|' read -r _crf_id _crf_name _crf_scripts _crf_features _crf_type; do
    [ -z "$_crf_id" ] && continue
    _conflict_detect "$_crf_id" || continue
    case ",$_crf_features," in *",$_crf_feature,"*) ;; *) continue ;; esac
    [ "$(_conflict_choice "$_crf_id")" = "priority_module" ] || continue
    cfg_set "conflict_$_crf_id" "priority_specter"
    if [ "$_crf_type" = "aggressive" ]; then
      _conflict_apply_scripts "$_crf_scripts" "priority_specter"
    fi
  done <<EOF
$(_conflict_registry)
EOF
  cfg_set "$_crf_toggle_key" "1"
  unset _crf_feature _crf_toggle_key _crf_id _crf_name _crf_scripts _crf_features _crf_type
}
