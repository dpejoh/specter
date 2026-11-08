#!/system/bin/sh
set -e
MODDIR=${0%/*}
. "$MODDIR/../lib/common.sh"
. "$MODDIR/../lib/constants.sh"
. "$MODDIR/../lib/target_common.sh"

log_d "TARGET" "Starting target management"

# The generation mode depends only on the argument, so announce it before
# keystore detection and locking (list/set have their own fast paths below).
case "${1:-}" in
  --list|--list-raw|--set) ;;
  --merge-denylist)
    _mode="merge-denylist"
    log_i "TARGET" "Mode: merge-denylist"
    command -v magisk >/dev/null 2>&1 || { log_w "TARGET" "magisk not found, skipping"; exit 0; }
    ;;
  --merge)
    _mode="merge"
    log_i "TARGET" "Mode: merge"
    ;;
  *)
    _mode="overwrite"
    log_i "TARGET" "Mode: overwrite"
    ;;
esac

detect_keystore_manager
ksm_available || die "No keystore manager (Tricky Store / TEESimulator / OhMyKeymint) data directory found"

case "${1:-}" in
  --list)
    ksm_read_targets
    exit 0
    ;;
  --list-raw)
    # Preserve !/? for the WebUI; drop [section] headers (not packages).
    ksm_read_targets_raw | grep -v '^[[:space:]]*\[' || true
    exit 0
    ;;
esac

ksm_lock_targets || die "Failed to lock target list"

_ensure_blacklist

case "${1:-}" in
  --set)
    [ -n "${2:-}" ] && [ -f "$2" ] || die "target.sh --set requires an existing file argument"
    _set_out="$SPECTER_DIR/.target_set.$$"

    awk -v fixed_str="$FIXED_TARGETS" '
      BEGIN {
        n_fixed = split(fixed_str, fixed_arr, /[[:space:]]+/)
      }
      {
        sub(/\r$/, "", $0); sub(/[[:space:]]+$/, "", $0); sub(/^[[:space:]]+/, "", $0)
        if ($0 == "" || $0 ~ /^\[/) next
        base = $0
        sub(/[!?]$/, "", base)
        if (base !~ /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)*$/) next
        if (!(base in seen)) {
          seen[base] = 1
          print $0
        }
      }
      END {
        for (i = 1; i <= n_fixed; i++) {
          f = fixed_arr[i]
          if (f != "" && !(f in seen)) {
            seen[f] = 1
            print f
          }
        }
      }
    ' "$2" > "$_set_out"

    _filter_blacklist "$_set_out"
    if ksm_commit_targets_merge "$_set_out"; then
      rm -f "$2" "$_set_out"
    else
      rm -f "$_set_out"
      die "Failed to commit target list from $2"
    fi
    log_i "TARGET" "Committed target list (sections preserved)"
    exit 0
    ;;
esac

_resolve_default_suffix
: "${_def_suffix:=}" "${_customize_file:=}" "${_cust_selective:=0}"

_bl_enabled=0
[ -f "$SPECTER_DIR/blacklist_enabled" ] && [ -s "$BLACKLIST" ] && _bl_enabled=1

if [ "$_mode" = "merge-denylist" ]; then
  _raw_pkgs=$(magisk --denylist ls 2>/dev/null | awk -F'|' '{print $1}' | grep -v "isolated" || true)
else
  _raw_pkgs=$(_get_installed_packages)
  if [ -z "$_raw_pkgs" ]; then
    log_w "TARGET" "Failed to list packages"
  fi
fi

if [ "$_mode" = "overwrite" ]; then
  _TMP_TARGET="$SPECTER_DIR/.target_new.$$"
  trap 'rm -f "$_TMP_TARGET"' EXIT

  {
    for _entry in $FIXED_TARGETS; do
      printf '%s\n' "$_entry"
    done
    [ -n "$_raw_pkgs" ] && printf '%s\n' "$_raw_pkgs"
  } | awk -v ksm_modes="$KSM_PER_APP_MODES" \
      -v def_suffix="$_def_suffix" \
      -v fixed_str="$FIXED_TARGETS" \
      -v bl_file="$BLACKLIST" \
      -v bl_enabled="$_bl_enabled" \
      -v cust_file="$_customize_file" \
      -v cust_selective="$_cust_selective" '
    BEGIN {
      n_fixed = split(fixed_str, fixed_arr, /[[:space:]]+/)
      for (i = 1; i <= n_fixed; i++) {
        if (fixed_arr[i] != "") fixed[fixed_arr[i]] = 1
      }
      if (bl_enabled == 1 && bl_file != "") {
        while ((getline bl < bl_file) > 0) {
          sub(/\r$/, "", bl); sub(/^[[:space:]]+/, "", bl); sub(/[[:space:]]+$/, "", bl)
          sub(/[[:space:]#].*$/, "", bl)
          if (bl != "" && bl !~ /^#/) blacklist[bl] = 1
        }
        close(bl_file)
      }
      if (ksm_modes == 1 && cust_selective == 1 && cust_file != "") {
        while ((getline cl < cust_file) > 0) {
          sub(/\r$/, "", cl); sub(/[[:space:]]+$/, "", cl); sub(/^[[:space:]]+/, "", cl)
          if (cl ~ /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)*[!?]?$/) {
            s = ""
            if (cl ~ /!$/) { s = "!"; sub(/!$/, "", cl) }
            else if (cl ~ /\?$/) { s = "?"; sub(/\?$/, "", cl) }
            custom_suffix[cl] = s
            has_custom[cl] = 1
          }
        }
        close(cust_file)
      }
    }
    {
      sub(/\r$/, "", $0); sub(/[[:space:]]+$/, "", $0); sub(/^[[:space:]]+/, "", $0)
      if ($0 == "" || $0 ~ /^\[/) next
      base = $0
      sub(/[!?]$/, "", base)
      if (base !~ /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)*$/) next
      if (base in blacklist) next
      if (base in seen) next
      seen[base] = 1

      # Mandatory targets stay bare, as target.sh --set always writes them.
      suffix = ""
      if (!(base in fixed) && ksm_modes == 1) {
        if (base in has_custom) suffix = custom_suffix[base]
        else suffix = def_suffix
      }
      print base suffix
    }
  ' > "$_TMP_TARGET"

  # Count before commit: ksm_commit_targets consumes the temp file.
  _count=$(wc -l < "$_TMP_TARGET" 2>/dev/null || echo 0)
  ksm_commit_targets "$_TMP_TARGET"
  log_i "TARGET" "Wrote $_count entries to target list"
else
  # merge or merge-denylist
  _TMP_TARGET="$SPECTER_DIR/.target_new.$$"
  _TMP_EXIST="$SPECTER_DIR/.target_exist.$$"
  _TMP_ADD="$SPECTER_DIR/.target_add.$$"
  trap 'rm -f "$_TMP_TARGET" "$_TMP_EXIST" "$_TMP_ADD"' EXIT
  : > "$_TMP_ADD"

  ksm_read_targets_raw > "$_TMP_TARGET" 2>/dev/null || : > "$_TMP_TARGET"
  ksm_read_targets > "$_TMP_EXIST" 2>/dev/null || : > "$_TMP_EXIST"

  _merge_stats=$(
    if [ "$_mode" = "merge" ]; then
      for _entry in $FIXED_TARGETS; do
        printf '%s\n' "$_entry"
      done
      [ -n "$_raw_pkgs" ] && printf '%s\n' "$_raw_pkgs"
    else
      # Keep the old "seed mandatory targets when the list is empty" behaviour.
      if [ ! -s "$_TMP_EXIST" ]; then
        for _entry in $FIXED_TARGETS; do
          printf '%s\n' "$_entry"
        done
      fi
      printf '%s\n' "$_raw_pkgs"
    fi | awk -v ksm_modes="$KSM_PER_APP_MODES" \
      -v def_suffix="$_def_suffix" \
      -v fixed_str="$FIXED_TARGETS" \
      -v exist_file="$_TMP_EXIST" \
      -v bl_file="$BLACKLIST" \
      -v bl_enabled="$_bl_enabled" \
      -v cust_file="$_customize_file" \
      -v cust_selective="$_cust_selective" \
      -v add_file="$_TMP_ADD" '
    BEGIN {
      n_fixed = split(fixed_str, fixed_arr, /[[:space:]]+/)
      for (i = 1; i <= n_fixed; i++) {
        if (fixed_arr[i] != "") fixed[fixed_arr[i]] = 1
      }
      while ((getline ex < exist_file) > 0) {
        sub(/\r$/, "", ex); sub(/[[:space:]]+$/, "", ex); sub(/^[[:space:]]+/, "", ex)
        if (ex != "") existing[ex] = 1
      }
      close(exist_file)
      if (bl_enabled == 1 && bl_file != "") {
        while ((getline bl < bl_file) > 0) {
          sub(/\r$/, "", bl); sub(/^[[:space:]]+/, "", bl); sub(/[[:space:]]+$/, "", bl)
          sub(/[[:space:]#].*$/, "", bl)
          if (bl != "" && bl !~ /^#/) blacklist[bl] = 1
        }
        close(bl_file)
      }
      if (ksm_modes == 1 && cust_selective == 1 && cust_file != "") {
        while ((getline cl < cust_file) > 0) {
          sub(/\r$/, "", cl); sub(/[[:space:]]+$/, "", cl); sub(/^[[:space:]]+/, "", cl)
          if (cl ~ /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)*[!?]?$/) {
            s = ""
            if (cl ~ /!$/) { s = "!"; sub(/!$/, "", cl) }
            else if (cl ~ /\?$/) { s = "?"; sub(/\?$/, "", cl) }
            custom_suffix[cl] = s
            has_custom[cl] = 1
          }
        }
        close(cust_file)
      }
      count = 0
      added = 0
    }
    {
      sub(/\r$/, "", $0); sub(/[[:space:]]+$/, "", $0); sub(/^[[:space:]]+/, "", $0)
      if ($0 == "" || $0 ~ /^\[/) next
      base = $0
      sub(/[!?]$/, "", base)
      if (base !~ /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)*$/) next
      count++
      if (base in blacklist) next
      if (base in existing) next
      existing[base] = 1

      # Mandatory targets stay bare, as target.sh --set always writes them.
      suffix = ""
      if (!(base in fixed) && ksm_modes == 1) {
        if (base in has_custom) suffix = custom_suffix[base]
        else suffix = def_suffix
      }
      print (base suffix) >> add_file
      added++
    }
    END {
      printf "%d %d\n", count, added
    }
  ')

  _count="${_merge_stats%% *}"
  _added="${_merge_stats#* }"

  if [ -f "$_TMP_TARGET" ]; then
    _txt_insert_default "$_TMP_TARGET" "$_TMP_ADD"
    _filter_blacklist "$_TMP_TARGET"
    ksm_commit_targets "$_TMP_TARGET"
  fi

  if [ "$_mode" = "merge-denylist" ]; then
    log_i "TARGET" "Denylist merge: checked ${_count:-0} entries, added ${_added:-0}"
  else
    log_i "TARGET" "Checked ${_count:-0} entries, added ${_added:-0}"
  fi
fi

log_i "TARGET" "Target management complete"
exit 0
