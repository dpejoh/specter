#!/system/bin/sh
set -e
MODDIR=${0%/*}
. "$MODDIR/../lib/common.sh"
. "$MODDIR/../lib/constants.sh"
. "$MODDIR/../lib/target_common.sh"

detect_keystore_manager

BLACKLIST="$SPECTER_DIR/blacklist.txt"
BLACKLIST_ENABLED="$SPECTER_DIR/blacklist_enabled"
KNOWN_PKGS="$SPECTER_DIR/auto_known_packages.txt"
TEMP_LIST="$SPECTER_DIR/.auto_target_scan.$$"
_INSTALLED="$SPECTER_DIR/.auto_target_installed.$$"
trap 'rm -f "$TEMP_LIST" "$_INSTALLED" "$SPECTER_DIR/.auto_target_existing.$$" "$SPECTER_DIR/.auto_target_staging.$$" "$SPECTER_DIR/.auto_target_adds.$$" "$SPECTER_DIR/.auto_target_clean.$$" "$SPECTER_DIR/.auto_target_seen.$$"' EXIT

_feature_should_run "target" || { log_d "AUTO_TARGET" "target disabled or claimed, skipping"; exit 0; }

log_i "AUTO_TARGET" "Scanning for new packages"

ksm_available || { log_d "AUTO_TARGET" "no keystore manager, skipping"; exit 0; }
[ -f "$KSM_TARGETS" ] || { log_w "AUTO_TARGET" "target list missing, skipping"; exit 0; }

ksm_lock_targets || { log_e "AUTO_TARGET" "failed to lock target list"; exit 1; }

pkgs=$(_get_installed_packages) || { log_e "AUTO_TARGET" "pm list packages failed"; exit 1; }
printf '%s\n' "$pkgs" | sort -u > "$TEMP_LIST"
[ ! -s "$TEMP_LIST" ] && { rm -f "$TEMP_LIST"; exit 0; }

if command -v cmd >/dev/null 2>&1; then
  _all=$(cmd package list packages 2>/dev/null) || _all=""
fi
[ -z "$_all" ] && _all=$(pm list packages 2>/dev/null || echo "")
echo "$_all" | sed -n 's/^package://p' | sort -u > "$_INSTALLED"
[ -s "$_INSTALLED" ] || cp "$TEMP_LIST" "$_INSTALLED"
unset _all

_EXISTING="$SPECTER_DIR/.auto_target_existing.$$"
ksm_read_targets > "$_EXISTING" || true

_STAGING="$SPECTER_DIR/.auto_target_staging.$$"
ksm_read_targets_raw > "$_STAGING" || true
if [ ! -s "$_STAGING" ] && [ -s "$KNOWN_PKGS" ]; then
  log_w "AUTO_TARGET" "existing target list unreadable, skipping commit"
  exit 0
fi

_ADDS="$SPECTER_DIR/.auto_target_adds.$$"
: > "$_ADDS"

_suffix=""
if [ "$KSM_PER_APP_MODES" = "1" ]; then
  _default_mode=$(cfg_get target_default_mode "bare" 2>/dev/null || echo "bare")
  case "$_default_mode" in
    "force") _suffix="!" ;;
    "conditional") _suffix="?" ;;
    *) _suffix="" ;;
  esac
  unset _default_mode
fi

_bl_enabled=0
[ -f "$BLACKLIST_ENABLED" ] && [ -s "$BLACKLIST" ] && _bl_enabled=1

_new_count=$(awk -v bl_file="$BLACKLIST" \
    -v bl_enabled="$_bl_enabled" \
    -v known_file="$KNOWN_PKGS" \
    -v exist_file="$_EXISTING" \
    -v suffix="$_suffix" \
    -v adds_file="$_ADDS" '
  BEGIN {
    if (bl_enabled == 1 && bl_file != "") {
      while ((getline bl < bl_file) > 0) {
        sub(/\r$/, "", bl); sub(/^[[:space:]]+/, "", bl); sub(/[[:space:]]+$/, "", bl)
        sub(/[[:space:]#].*$/, "", bl)
        if (bl != "" && bl !~ /^#/) blacklist[bl] = 1
      }
      close(bl_file)
    }
    if (known_file != "") {
      while ((getline kn < known_file) > 0) {
        sub(/\r$/, "", kn); sub(/[[:space:]]+$/, "", kn); sub(/^[[:space:]]+/, "", kn)
        if (kn != "") known[kn] = 1
      }
      close(known_file)
    }
    if (exist_file != "") {
      while ((getline ex < exist_file) > 0) {
        sub(/\r$/, "", ex); sub(/[[:space:]]+$/, "", ex); sub(/^[[:space:]]+/, "", ex)
        if (ex != "") existing[ex] = 1
      }
      close(exist_file)
    }
    added = 0
  }
  {
    sub(/\r$/, "", $0); sub(/[[:space:]]+$/, "", $0); sub(/^[[:space:]]+/, "", $0)
    pkg = $0
    if (pkg == "") next
    if (pkg in known) next
    if (pkg in existing) next
    if (pkg in blacklist) next
    print (pkg suffix) >> adds_file
    added++
  }
  END {
    print added
  }
' "$TEMP_LIST")

[ "${_new_count:-0}" -gt 0 ] && log_i "AUTO_TARGET" "Added $_new_count new package(s)"

_TMP_CLEAN="$SPECTER_DIR/.auto_target_clean.$$"
: > "$_TMP_CLEAN"

_cleaned=$(awk -v bl_file="$BLACKLIST" \
    -v bl_enabled="$_bl_enabled" \
    -v inst_file="$_INSTALLED" \
    -v fixed_str="$FIXED_TARGETS" \
    -v clean_file="$_TMP_CLEAN" '
  BEGIN {
    if (bl_enabled == 1 && bl_file != "") {
      while ((getline bl < bl_file) > 0) {
        sub(/\r$/, "", bl); sub(/^[[:space:]]+/, "", bl); sub(/[[:space:]]+$/, "", bl)
        sub(/[[:space:]#].*$/, "", bl)
        if (bl != "" && bl !~ /^#/) blacklist[bl] = 1
      }
      close(bl_file)
    }
    if (inst_file != "") {
      while ((getline inst < inst_file) > 0) {
        sub(/\r$/, "", inst); sub(/[[:space:]]+$/, "", inst); sub(/^[[:space:]]+/, "", inst)
        if (inst != "") installed[inst] = 1
      }
      close(inst_file)
    }
    n_fixed = split(fixed_str, fixed_arr, /[[:space:]]+/)
    for (i = 1; i <= n_fixed; i++) {
      if (fixed_arr[i] != "") fixed[fixed_arr[i]] = 1
    }
    cleaned = 0
  }
  {
    sub(/\r$/, "", $0); sub(/[[:space:]]+$/, "", $0); sub(/^[[:space:]]+/, "", $0)
    line = $0
    if (line == "") next
    if (line ~ /^\[/) {
      print line >> clean_file
      next
    }
    base = line
    sub(/[!?]$/, "", base)
    if (base in seen) {
      cleaned++
      next
    }
    seen[base] = 1
    if (base in blacklist) {
      cleaned++
      next
    }
    if (base in fixed) {
      print line >> clean_file
      next
    }
    if (base in installed) {
      print line >> clean_file
    } else {
      cleaned++
    }
  }
  END {
    print cleaned
  }
' "$_STAGING")

_txt_insert_default "$_TMP_CLEAN" "$_ADDS"
ksm_commit_targets "$_TMP_CLEAN"
[ "${_cleaned:-0}" -gt 0 ] && log_i "AUTO_TARGET" "Removed $_cleaned stale/blacklisted entry(s)"

cp "$TEMP_LIST" "$KNOWN_PKGS" 2>/dev/null || true
log_i "AUTO_TARGET" "Auto-target scan complete"
exit 0
