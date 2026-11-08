# shellcheck shell=sh
# Shared routines for target.sh and target_merge.sh
# Source after common.sh and constants.sh

# Ensure blacklist exists
_ensure_blacklist() {
  BLACKLIST="$SPECTER_DIR/blacklist.txt"
  if [ ! -f "$BLACKLIST" ]; then
    log_i "TARGET" "Creating default blacklist"
    ensure_dir "$SPECTER_DIR"
    : > "$BLACKLIST"
    log_i "TARGET" "Default blacklist created"
  fi
  unset _pkg
}

# Fast package enumeration trying native cmd first, then pm
_get_installed_packages() {
  _gip_pkgs=""
  if command -v cmd >/dev/null 2>&1; then
    _gip_pkgs=$(cmd package list packages -3 2>/dev/null) || _gip_pkgs=""
  fi
  if [ -z "$_gip_pkgs" ]; then
    _gip_pkgs=$(pm list packages -3 2>/dev/null) || _gip_pkgs=""
  fi
  if [ -n "$_gip_pkgs" ]; then
    printf '%s\n' "$_gip_pkgs" | sed -n 's/^package://p'
  fi
  unset _gip_pkgs
}

# Parse customize.txt, sets $_customize_mode and $_customize_file
_parse_customize() {
  _customize="/sdcard/Specter/customize.txt"
  _customize_mode=""
  _customize_file=""
  if [ -f "$_customize" ]; then
    _customize_file="$_customize"
    _first=$(head -1 "$_customize" 2>/dev/null || echo "")
    case "$_first" in
      "!") _customize_mode="force_all" ;;
      "?") _customize_mode="condition_all" ;;
      "#disable") _customize_mode="disabled" ;;
      *) _customize_mode="selective" ;;
    esac
    log_d "TARGET" "customize.txt mode: $_customize_mode"
  fi
  unset _first
}

# Resolve default suffix and selective customize rules
_resolve_default_suffix() {
  _def_suffix=""
  _cust_selective=0
  if [ "$KSM_PER_APP_MODES" = "1" ]; then
    _parse_customize
    case "$_customize_mode" in
      force_all)     _def_suffix="!" ;;
      condition_all) _def_suffix="?" ;;
      disabled)      _def_suffix="" ;;
      selective)
        _cust_selective=1
        _def_mode=$(cfg_get target_default_mode "bare" 2>/dev/null || echo "bare")
        case "$_def_mode" in
          force)       _def_suffix="!" ;;
          conditional) _def_suffix="?" ;;
          *)           _def_suffix="" ;;
        esac
        ;;
      *)
        _def_mode=$(cfg_get target_default_mode "bare" 2>/dev/null || echo "bare")
        case "$_def_mode" in
          force)       _def_suffix="!" ;;
          conditional) _def_suffix="?" ;;
          *)           _def_suffix="" ;;
        esac
        ;;
    esac
  fi
}

# Filter $1 (a package list file) against the blacklist when enabled.
_filter_blacklist() {
  _fb_file="$1"
  [ -f "$SPECTER_DIR/blacklist_enabled" ] && [ -s "$BLACKLIST" ] || { unset _fb_file; return 0; }
  _fb_tmp="${_fb_file}.filtered.$$"
  awk -v bl_file="$BLACKLIST" '
    BEGIN {
      while ((getline bl < bl_file) > 0) {
        sub(/\r$/, "", bl); sub(/^[[:space:]]+/, "", bl); sub(/[[:space:]]+$/, "", bl)
        sub(/[[:space:]#].*$/, "", bl)
        if (bl != "" && bl !~ /^#/) blacklist[bl] = 1
      }
      close(bl_file)
    }
    {
      sub(/\r$/, "", $0)
      if ($0 ~ /^[[:space:]]*\[/) { print; next }
      line = $0
      sub(/[[:space:]]+$/, "", line); sub(/^[[:space:]]+/, "", line)
      base = line
      sub(/[!?]$/, "", base)
      if (base in blacklist) next
      print
    }
  ' "$_fb_file" > "$_fb_tmp" 2>/dev/null && mv -f "$_fb_tmp" "$_fb_file" || rm -f "$_fb_tmp"
  unset _fb_file _fb_tmp
}
