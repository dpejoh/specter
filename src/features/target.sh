#!/system/bin/sh
set -e
MODDIR=${0%/*}
. "$MODDIR/../lib/common.sh"
. "$MODDIR/../lib/constants.sh"
. "$MODDIR/../lib/target_common.sh"

log_d "TARGET" "Starting target management"

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

_target_cleanup() {
  [ -n "${TEMP_PKGS:-}" ] && rm -f "$TEMP_PKGS" "${TEMP_PKGS}.filtered"
  [ -n "${_TMP_TARGET:-}" ] && rm -f "$_TMP_TARGET"
  [ -n "${_TMP_EXIST:-}" ] && rm -f "$_TMP_EXIST"
  [ -n "${_TMP_ADD:-}" ] && rm -f "$_TMP_ADD"
  [ -n "${_set_out:-}" ] && rm -f "$_set_out"
  [ -n "${_set_bases:-}" ] && rm -f "$_set_bases"
  ksm_unlock_targets
}
trap _target_cleanup EXIT

_ensure_blacklist

MODULE_ROOT="${MODDIR%/features}"
TEMP_PKGS="$MODULE_ROOT/pkgs.txt"

case "${1:-}" in
  --set|--merge-denylist) ;;
  *)
    pkgs=$(pm list packages -3 2>/dev/null) || log_w "TARGET" "Failed to list packages"
    if [ -n "${pkgs:-}" ]; then
      echo "$pkgs" | cut -d ":" -f 2 > "$TEMP_PKGS"
      _filter_blacklist "$TEMP_PKGS"
    fi
    unset pkgs
    ;;
esac

ksm_lock_targets || die "Failed to lock target list"

case "${1:-}" in
  --set)
    [ -n "${2:-}" ] && [ -f "$2" ] || die "target.sh --set requires an existing file argument"
    _set_out="$SPECTER_DIR/.target_set.$$"
    _set_bases="$SPECTER_DIR/.target_set_bases.$$"
    : > "$_set_out"
    : > "$_set_bases"
    while IFS= read -r _set_line || [ -n "$_set_line" ]; do
      [ -z "$_set_line" ] && continue
      case "$_set_line" in \[*\]) continue ;; esac
      _ksm_pkg_ok "$_set_line" || continue
      printf '%s\n' "$_set_line" >> "$_set_out"
      printf '%s\n' "$(_normalize_pkg "$_set_line")" >> "$_set_bases"
    done < "$2"
    for _set_entry in $FIXED_TARGETS; do
      grep -Fxq "$_set_entry" "$_set_bases" 2>/dev/null && continue
      printf '%s\n' "$_set_entry" >> "$_set_out"
    done
    rm -f "$_set_bases"
    unset _set_bases _set_line _set_entry
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

_TMP_TARGET="$SPECTER_DIR/.target_new.$$"

_parse_customize

_ensure_target_txt() {
  [ -n "$(ksm_read_targets)" ] && return 0
  log_w "TARGET" "target list missing or empty, creating default"
  _et_tmp="$SPECTER_DIR/.target_seed.$$"
  for _entry in $FIXED_TARGETS; do
    echo "$_entry"
  done > "$_et_tmp"
  _filter_blacklist "$_et_tmp"
  ksm_commit_targets "$_et_tmp"
  unset _entry _et_tmp
}

_ensure_target_txt

case "${1}" in
  --merge-denylist)
    log_i "TARGET" "Mode: merge-denylist"
    command -v magisk >/dev/null 2>&1 || { log_w "TARGET" "magisk not found, skipping"; exit 0; }
    _merge_setup
    _merge_load_existing

    _denylist=$(magisk --denylist ls 2>/dev/null | awk -F'|' '{print $1}' | grep -v "isolated" || true)
    if [ -n "$_denylist" ]; then
      for _pkg in $_denylist; do
        [ -z "$_pkg" ] && continue
        _compute_suffix "$_pkg"
        _append_missing "${_pkg}${_suffix}"
      done
      unset _pkg
    fi

    _merge_cleanup
    : "${_added:=0}"
    log_i "TARGET" "Denylist merge: checked $_count entries, added $_added"
    unset _count _added
    ;;
  --merge)
    log_i "TARGET" "Mode: merge"
    _merge_setup
    _merge_load_existing

    for entry in $FIXED_TARGETS; do
      _append_missing "$entry"
    done

    if [ -s "$TEMP_PKGS" ]; then
      while read -r pkg; do
        [ -z "$pkg" ] && continue
        _compute_suffix "$pkg"
        _append_missing "${pkg}${_suffix}"
      done < "$TEMP_PKGS"
      rm -f "$TEMP_PKGS" "${TEMP_PKGS}.filtered"
    fi

    _merge_cleanup
    : "${_added:=0}"
    log_i "TARGET" "Checked $_count entries, added $_added"
    unset _count _added
    ;;
  *)
    log_i "TARGET" "Mode: overwrite"
    _count=0

    for entry in $FIXED_TARGETS; do
      echo "$entry" >> "$_TMP_TARGET"
      _count=$((_count + 1))
    done

    if [ -s "$TEMP_PKGS" ]; then
      while read -r pkg; do
        [ -z "$pkg" ] && continue
        _suffix=""
        _compute_suffix "$pkg"
        echo "${pkg}${_suffix}" >> "$_TMP_TARGET"
        _count=$((_count + 1))
      done < "$TEMP_PKGS"
      rm -f "$TEMP_PKGS" "${TEMP_PKGS}.filtered"
    fi

    sort -u "$_TMP_TARGET" -o "$_TMP_TARGET"
    _filter_blacklist "$_TMP_TARGET"

    ksm_commit_targets "$_TMP_TARGET"

    _count=$(ksm_read_targets | wc -l)
    log_i "TARGET" "Wrote $_count entries to target list"
    ;;
esac

log_i "TARGET" "Target management complete"
exit 0
