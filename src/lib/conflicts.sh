# shellcheck shell=sh
CONFLICT_BACKUP_FILE="$SPECTER_DIR/conflict_backups.txt"
CONFLICT_LIST="$CONFIG_DIR/conflicts.txt"

_conflict_detect() {
  case "$1" in
    integritybox) [ -d "$MODULES_BASE/playintegrityfix" ] && [ -d "/data/adb/Box-Brain" ] ;;
    *) [ -d "$MODULES_BASE/$1" ] || [ -d "${MODULES_BASE}_update/$1" ] || [ -d "$MODULES_BASE/.$1" ] || [ -d "${MODULES_BASE}_update/.$1" ] ;;
  esac
}

_conflict_rename_bak() {
  [ -f "$1" ] && [ ! -f "$1.bak" ] && mv "$1" "$1.bak" 2>/dev/null && grep -qxF "$1" "$CONFLICT_BACKUP_FILE" 2>/dev/null || echo "$1" >> "$CONFLICT_BACKUP_FILE" 2>/dev/null || true
}

_conflict_restore_bak() {
  [ -f "$1.bak" ] && mv "$1.bak" "$1" 2>/dev/null || true
}

_conflict_uninstall() {
  _cu_id="$1" _cu_name="$2"
  _cu_dir="$MODULES_BASE/$_cu_id"
  [ "$_cu_id" = "integritybox" ] && _cu_dir="$MODULES_BASE/playintegrityfix"
  _cu_dir_upd="${MODULES_BASE}_update/${_cu_dir##*/}"
  for _cu_path in "$_cu_dir" "$_cu_dir_upd"; do
    [ -d "$_cu_path" ] || continue
    [ -f "$_cu_path/uninstall.sh" ] && sh "$_cu_path/uninstall.sh" 2>/dev/null || true
    rm -rf "$_cu_path"
  done
  [ "$_cu_id" = "integritybox" ] && [ -d "/data/adb/Box-Brain" ] && rm -rf "/data/adb/Box-Brain"
  sed -i "\|/$_cu_id/|d" "$CONFLICT_BACKUP_FILE" 2>/dev/null || true
}

_conflict_toggle_key() {
  case "$1" in target|security_patch|gms|keybox|pif) printf 'toggle_action_%s' "$1" ;; *) printf 'toggle_%s' "$1" ;; esac
}

_feature_should_run() {
  _fsr_feature="$1" _fsr_default="${2:-1}"
  [ "$(cfg_get "$(_conflict_toggle_key "$_fsr_feature")" "$_fsr_default")" != "0" ] || return 1
}

_apply_scripts() {
  _as_scripts="$1" _as_choice="$2"
  _as_old_ifs="$IFS"; IFS=','
  for _as_script in $_as_scripts; do
    [ -z "$_as_script" ] && continue
    [ "$_as_choice" = "priority_module" ] && _conflict_restore_bak "$_as_script" || _conflict_rename_bak "$_as_script"
  done
  IFS="$_as_old_ifs"
}

_resolve_aggressive() {
  _conflict_uninstall "$1" "$2"
  log_i "CONFLICT" "$2: 100% overlap, uninstalled"
  cfg_set "conflict_$1" "priority_specter"
}

_resolve_moderate() {
  _apply_scripts "$3" "priority_specter"
  log_i "CONFLICT" "$2: overlap, disabled, Specter covers all"
  cfg_set "conflict_$1" "priority_specter"
}

_resolve_passive() {
  if [ ! -f "$CONFIG_DIR/conflict_$1.val" ]; then
    cfg_set "conflict_$1" "priority_module"
    log_i "CONFLICT" "$2: partial overlap, defaulting to Module priority"
  fi
}

resolve_conflicts() {
  ensure_dir "$SPECTER_DIR"
  touch "$CONFLICT_BACKUP_FILE" 2>/dev/null || true

  while IFS='|' read -r _rc_id _rc_name _rc_type _rc_features _rc_scripts; do
    case "$_rc_id" in ''|\#*) continue ;; esac
    if ! _conflict_detect "$_rc_id"; then
      [ -f "$CONFIG_DIR/conflict_$_rc_id.val" ] || continue
      rm -f "$CONFIG_DIR/conflict_$_rc_id.val"
      sed -i "\|/$_rc_id/|d" "$CONFLICT_BACKUP_FILE" 2>/dev/null || true
    fi
  done < "$CONFLICT_LIST"

  while IFS='|' read -r _rc_id _rc_name _rc_type _rc_features _rc_scripts; do
    case "$_rc_id" in ''|\#*) continue ;; esac
    _conflict_detect "$_rc_id" || continue
    case "$_rc_type" in
      aggressive) _resolve_aggressive "$_rc_id" "$_rc_name" "$_rc_scripts" ;;
      moderate) _resolve_moderate "$_rc_id" "$_rc_name" "$_rc_scripts" ;;
      passive) _resolve_passive "$_rc_id" "$_rc_name" ;;
    esac
  done < "$CONFLICT_LIST"
}

_conflict_claimed() {
  _cc_feature="$1"

  while IFS='|' read -r _cc_id _cc_name _cc_type _cc_features _cc_scripts; do
    case "$_cc_id" in ''|\#*) continue ;; esac
    [ "$_cc_type" = "passive" ] && continue
    _conflict_detect "$_cc_id" || continue
    case ",$_cc_features," in *,"$_cc_feature",*) ;; *) continue ;; esac
    [ "$(cfg_get "conflict_$_cc_id" "priority_specter")" = "priority_specter" ] && return 1
  done < "$CONFLICT_LIST"

  while IFS='|' read -r _cc_id _cc_name _cc_type _cc_features _cc_scripts; do
    case "$_cc_id" in ''|\#*) continue ;; esac
    [ "$_cc_type" != "passive" ] && continue
    _conflict_detect "$_cc_id" || continue
    case ",$_cc_features," in *,"$_cc_feature",*) ;; *) continue ;; esac
    [ "$(cfg_get "conflict_$_cc_id" "priority_module")" = "priority_module" ] && return 0
  done < "$CONFLICT_LIST"

  return 1
}

conflict_status_json() {
  _cs_first=1
  printf '['
  while IFS='|' read -r _cs_id _cs_name _cs_type _cs_features _cs_scripts; do
    case "$_cs_id" in ''|\#*) continue ;; esac
    [ "$_cs_type" = "passive" ] || continue
    _conflict_detect "$_cs_id" || continue
    [ "$_cs_first" -eq 0 ] && printf ',' || _cs_first=0
    _cs_choice=$(cfg_get "conflict_$_cs_id" "priority_specter")
    printf '{"key":"%s","friendlyName":"%s","detected":true,"prioritySpecter":%s,"type":"%s","features":"%s"}' \
      "$_cs_id" "$_cs_name" "$([ "$_cs_choice" = "priority_specter" ] && echo true || echo false)" "$_cs_type" "$_cs_features"
  done < "$CONFLICT_LIST"
  printf ']'
}

conflict_set_choice() {
  case "$2" in priority_specter|priority_module) ;; *) return 1 ;; esac
  cfg_set "conflict_$1" "$2"
}

conflict_resolve_for_feature() {
  _crf_toggle_key="$(_conflict_toggle_key "$1")"
  while IFS='|' read -r _crf_id _crf_name _crf_type _crf_features _crf_scripts; do
    case "$_crf_id" in ''|\#*) continue ;; esac
    _conflict_detect "$_crf_id" || continue
    [ "$(cfg_get "conflict_$_crf_id" priority_specter)" = "priority_module" ] || continue
    cfg_set "conflict_$_crf_id" "priority_specter"
  done < "$CONFLICT_LIST"
  cfg_set "$_crf_toggle_key" "1"
}
