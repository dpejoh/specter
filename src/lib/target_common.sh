# Shared routines for target.sh and target_merge.sh
# Source after common.sh, paths.sh, package_list.sh, config_env.sh

# Returns 1 if TEESimulator was handled (caller should exit)
_tee_section() {
  _is_teesimulator || return 0
  log "TARGET" "TEESimulator, generating locked.xml section"
  _cust="/sdcard/Specter/customize.txt"
  if [ -f "$_cust" ] && [ "$(head -1 "$_cust" 2>/dev/null)" != "#disable" ]; then
    _locked=$(grep -v '^#' "$_cust" | sed 's/[!?]$//' 2>/dev/null || echo "")
    if [ -n "$_locked" ]; then
      [ -f "$TARGET_TXT" ] && cp "$TARGET_TXT" "${TARGET_TXT}.bak"
      _tmp=$(mktemp 2>/dev/null || echo "/data/local/tmp/.specter_tee_$$")
      _locked_f="/data/local/tmp/.specter_locked.$$"
      printf '%s\n' "$_locked" > "$_locked_f"
      if [ -f "$TARGET_TXT" ] && [ -s "$TARGET_TXT" ]; then
        sed '/^\[/d' "$TARGET_TXT" | grep -Fvxf "$_locked_f" > "$_tmp"
      fi
      rm -f "$_locked_f"
      printf '%s\n' '[locked.xml]' "$_locked" >> "$_tmp"
      [ -s "$_tmp" ] && mv -f "$_tmp" "$TARGET_TXT" || rm -f "$_tmp"
      unset _tmp
    fi
    unset _locked
  fi
  unset _cust
  log "TARGET" "Finish (TEESimulator)"
  return 1
}

# Ensure blacklist exists
_ensure_blacklist() {
  BLACKLIST="$SPECTER_DIR/blacklist.txt"
  if [ ! -f "$BLACKLIST" ]; then
    log "TARGET" "Creating default blacklist from DETECTOR_APPS"
    ensure_dir "$SPECTER_DIR"
    {
      for _pkg in $DETECTOR_APPS $BLACKLIST_EXTRA; do
        echo "$_pkg"
      done
    } > "$BLACKLIST"
    log "TARGET" "Default blacklist created"
  fi
  unset _pkg
}

# Parse customize.txt, sets $_customize_mode
_parse_customize() {
  _customize="/sdcard/Specter/customize.txt"
  _customize_mode=""
  if [ -f "$_customize" ]; then
    _first=$(head -1 "$_customize" 2>/dev/null || echo "")
    case "$_first" in
      "!") _customize_mode="force_all" ;;
      "?") _customize_mode="condition_all" ;;
      "#disable") _customize_mode="disabled" ;;
      *) _customize_mode="selective" ;;
    esac
    log "TARGET" "customize.txt mode: $_customize_mode"
  fi
  unset _customize _first
}

# Read TEE status, sets $teeBroken
_read_tee_status() {
  teeBroken="false"
  [ -f "$TEE_STATUS" ] && teeBroken=$(grep -E '^(teeBroken|tee_broken)=' "$TEE_STATUS" 2>/dev/null | cut -d= -f2 || echo "false")
}

# Compute suffix for a given package based on customize.txt and TEE status
# Sets $_suffix and $_custom_matched
_compute_suffix() {
  _pkg="$1"
  _suffix="" _custom_matched=false
  if [ "$_customize_mode" = "selective" ]; then
    _match=$(grep -E "^${_pkg}[!?]?$" "$_customize" 2>/dev/null | head -1)
    if [ -n "$_match" ]; then
      _custom_matched=true
      case "$_match" in
        *!) _suffix="!" ;;
        *\?)
          if [ "$teeBroken" = "true" ]; then
            _suffix=""
          else
            _suffix="?"
          fi
          ;;
        *) _suffix="" ;;
      esac
    fi
  fi
  if [ "$_customize_mode" = "force_all" ]; then
    _suffix="!"
  elif [ "$_customize_mode" = "condition_all" ]; then
    _suffix="?"
  fi
  if [ -z "$_suffix" ] && [ "$_custom_matched" != "true" ]; then
    [ "$teeBroken" = "true" ] && _suffix="?"
  fi
}
