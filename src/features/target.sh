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

ksm_lock_targets || die "Failed to lock target list"

case "${1:-}" in
  --set)
    [ -n "${2:-}" ] && [ -f "$2" ] || die "target.sh --set requires an existing file argument"
    # Apply/WebUI rebuilds from pm -3 only; re-add FIXED_TARGETS missing by base name.
    _set_bases="$SPECTER_DIR/.target_set_bases.$$"
    : > "$_set_bases"
    while IFS= read -r _set_line || [ -n "$_set_line" ]; do
      [ -z "$_set_line" ] && continue
      case "$_set_line" in \[*\]) continue ;; esac
      printf '%s\n' "$(_normalize_pkg "$_set_line")" >> "$_set_bases"
    done < "$2"
    if [ -s "$2" ] && [ "$(tail -c 1 "$2" | wc -l)" -eq 0 ]; then
      printf '\n' >> "$2"
    fi
    for _set_entry in $FIXED_TARGETS; do
      grep -Fxq "$_set_entry" "$_set_bases" 2>/dev/null && continue
      printf '%s\n' "$_set_entry" >> "$2"
    done
    rm -f "$_set_bases"
    unset _set_bases _set_line _set_entry
    ksm_commit_targets_merge "$2" || die "Failed to commit target list from $2"
    rm -f "$2"
    log_i "TARGET" "Committed target list (sections preserved)"
    exit 0
    ;;
esac

MODULE_ROOT="${MODDIR%/features}"
TEMP_PKGS="$MODULE_ROOT/pkgs.txt"
_TMP_TARGET="$SPECTER_DIR/.target_new.$$"

_ensure_blacklist
_parse_customize

_ensure_target_txt() {
  [ -n "$(ksm_read_targets)" ] && return 0
  log_w "TARGET" "target list missing or empty, creating default"
  _et_tmp="$SPECTER_DIR/.target_seed.$$"
  for _entry in $FIXED_TARGETS; do
    echo "$_entry"
  done > "$_et_tmp"
  ksm_commit_targets "$_et_tmp"
  unset _entry _et_tmp
}

_ensure_target_txt

case "${1}" in
  --merge-denylist)
    log_i "TARGET" "Mode: merge-denylist"
    command -v magisk >/dev/null 2>&1 || { log_w "TARGET" "magisk not found, skipping"; exit 0; }
    _merge_setup
    trap 'rm -f "$_TMP_TARGET" "$_TMP_EXIST" "$_TMP_ADD"' EXIT
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
    trap 'rm -f "$TEMP_PKGS" "${TEMP_PKGS}.filtered" "$_TMP_TARGET" "$_TMP_EXIST" "$_TMP_ADD"' EXIT
    _merge_load_existing

    for entry in $FIXED_TARGETS; do
      _append_missing "$entry"
    done

    pkgs=$(pm list packages -3 2>/dev/null) || {
      log_w "TARGET" "Failed to list packages"
    }
    if [ -n "$pkgs" ]; then
      echo "$pkgs" | cut -d ":" -f 2 > "$TEMP_PKGS"
      _filter_blacklist "$TEMP_PKGS"

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
    trap 'rm -f "$TEMP_PKGS" "${TEMP_PKGS}.filtered" "$_TMP_TARGET"' EXIT

    for entry in $FIXED_TARGETS; do
      echo "$entry" >> "$_TMP_TARGET"
      _count=$((_count + 1))
    done

    pkgs=$(pm list packages -3 2>/dev/null) || {
      log_w "TARGET" "Failed to list packages"
    }
    if [ -n "$pkgs" ]; then
      echo "$pkgs" | cut -d ":" -f 2 > "$TEMP_PKGS"
      _filter_blacklist "$TEMP_PKGS"

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

    ksm_commit_targets "$_TMP_TARGET"

    _count=$(ksm_read_targets | wc -l)
    log_i "TARGET" "Wrote $_count entries to target list"
    ;;
esac

log_i "TARGET" "Target management complete"
exit 0
