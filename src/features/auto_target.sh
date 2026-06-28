#!/system/bin/sh
set -e
MODDIR=${0%/*}
. "$MODDIR/../lib/common.sh"
. "$MODDIR/../lib/constants.sh"

BLACKLIST="$SPECTER_DIR/blacklist.txt"
BLACKLIST_ENABLED="$SPECTER_DIR/blacklist_enabled"
KNOWN_PKGS="$SPECTER_DIR/auto_known_packages.txt"
TEMP_LIST="$SPECTER_DIR/auto_scan_tmp.txt"

_feature_should_run "target" || { log_d "AUTO_TARGET" "target disabled or claimed, skipping"; exit 0; }

log_i "AUTO_TARGET" "Scanning for new packages"

[ -f "$TARGET_TXT" ] || { log_w "AUTO_TARGET" "target.txt missing, skipping"; exit 0; }

pkgs=$(pm list packages -3 2>/dev/null) || { log_e "AUTO_TARGET" "pm list packages failed"; exit 1; }
echo "$pkgs" | cut -d ":" -f 2 | sort -u > "$TEMP_LIST"
[ ! -s "$TEMP_LIST" ] && { rm -f "$TEMP_LIST"; exit 0; }

_known=""
[ -f "$KNOWN_PKGS" ] && _known=$(cat "$KNOWN_PKGS")

_new_pkgs=""
while IFS= read -r _pkg; do
  [ -z "$_pkg" ] && continue
    if ! echo "$_known" | grep -Fxq "$_pkg" 2>/dev/null && ! grep -Fxq "$_pkg" "$TARGET_TXT" 2>/dev/null; then
    if [ -f "$BLACKLIST_ENABLED" ] && [ -s "$BLACKLIST" ]; then
      if grep -Fxq "$_pkg" "$BLACKLIST" 2>/dev/null; then
        continue
      fi
    fi
    _new_pkgs="$_new_pkgs$_pkg
"
  fi
done < "$TEMP_LIST"

if [ -n "$_new_pkgs" ]; then
  _default_mode=$(cfg_get target_default_mode "bare")
  case "$_default_mode" in
    "force") _suffix="!" ;;
    "conditional") _suffix="?" ;;
    *) _suffix="" ;;
  esac
  _added=0
  while IFS= read -r _pkg; do
    [ -z "$_pkg" ] && continue
    echo "${_pkg}${_suffix}" >> "$TARGET_TXT"
    _added=$((_added + 1))
  done <<EOF
$_new_pkgs
EOF
  unset _default_mode _suffix
  log_i "AUTO_TARGET" "Added $_added new package(s)"
fi

# Cleanup: remove entries for uninstalled or blacklisted packages
_installed_list=$(pm list packages -3 2>/dev/null | cut -d: -f2 | sort -u)
_bl_set=""
[ -f "$BLACKLIST_ENABLED" ] && [ -s "$BLACKLIST" ] && _bl_set=$(cat "$BLACKLIST")
_TMP_CLEAN="${TARGET_TXT}.clean.$$"

_cleaned=0
while IFS= read -r _line || [ -n "$_line" ]; do
  [ -z "$_line" ] && continue
  case "$_line" in \[*\]) echo "$_line" >> "$_TMP_CLEAN"; continue ;; esac
  _base="$_line"
  case "$_base" in *\!) _base=${_base%!} ;; *\?) _base=${_base%\?} ;; esac
  _keep=false
  for _fixed in $FIXED_TARGETS; do
    [ "$_base" = "$_fixed" ] && { _keep=true; break; }
  done
  if [ "$_keep" = "true" ]; then echo "$_line" >> "$_TMP_CLEAN"; continue; fi
  if echo "$_installed_list" | grep -Fxq "$_base" 2>/dev/null; then
    if [ -n "$_bl_set" ] && echo "$_bl_set" | grep -Fxq "$_base" 2>/dev/null; then
      _cleaned=$((_cleaned + 1))
      continue
    fi
    echo "$_line" >> "$_TMP_CLEAN"
  else
    _cleaned=$((_cleaned + 1))
  fi
done < "$TARGET_TXT"

if [ -f "$_TMP_CLEAN" ]; then
  mv -f "$_TMP_CLEAN" "$TARGET_TXT"
  [ "$_cleaned" -gt 0 ] && log_i "AUTO_TARGET" "Removed $_cleaned stale/blacklisted entry(s)"
fi
unset _installed_list _bl_set _TMP_CLEAN _cleaned _fixed _keep _base

cp "$TEMP_LIST" "$KNOWN_PKGS" 2>/dev/null || true
rm -f "$TEMP_LIST"
log_i "AUTO_TARGET" "Auto-target scan complete"
exit 0
