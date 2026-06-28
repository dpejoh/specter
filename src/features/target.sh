#!/system/bin/sh
set -e
MODDIR=${0%/*}
. "$MODDIR/../lib/common.sh"
. "$MODDIR/../lib/constants.sh"
. "$MODDIR/../lib/target_common.sh"

log_d "TARGET" "Starting target management"

[ -d "$TRICKY_DIR" ] || die "Tricky Store data directory not found"

MODULE_ROOT="${MODDIR%/features}"
TEMP_PKGS="$MODULE_ROOT/pkgs.txt"
_TMP_TARGET="${TARGET_TXT}.new.$$"

_read_tee_status
_ensure_blacklist
_parse_customize

_ensure_target_txt() {
  [ -f "$TARGET_TXT" ] && [ -s "$TARGET_TXT" ] && return 0
  log_w "TARGET" "target.txt missing or empty, creating default"
  mkdir -p "$(dirname "$TARGET_TXT")" 2>/dev/null || true
  for _entry in $FIXED_TARGETS; do
    echo "$_entry"
  done > "$TARGET_TXT"
  unset _entry
}

_ensure_target_txt

case "${1}" in
  --merge-denylist)
    log_i "TARGET" "Mode: merge-denylist"
    command -v magisk >/dev/null 2>&1 || { log_w "TARGET" "magisk not found, skipping"; exit 0; }
    _merge_setup
    trap 'rm -f "$_TMP_TARGET" "$_TMP_EXIST"' EXIT
    _merge_load_existing

    _denylist=$(magisk --denylist ls 2>/dev/null | awk -F'|' '{print $1}' | grep -v "isolated" || true)
    if [ -n "$_denylist" ]; then
      for _pkg in $_denylist; do
        [ -z "$_pkg" ] && continue
        _append_missing "$_pkg"
      done
      unset _pkg
    fi

    _merge_cleanup
    : "${_added:=0}"
    log_i "TARGET" "Denylist merge: checked $_count entries, added $_added"
    ;;
  --merge)
    log_i "TARGET" "Mode: merge"
    _merge_setup
    trap 'rm -f "$TEMP_PKGS" "${TEMP_PKGS}.filtered" "$_TMP_TARGET" "$_TMP_EXIST"' EXIT
    _merge_load_existing

    for entry in $FIXED_TARGETS; do
      _append_missing "$entry"
    done

    pkgs=$(pm list packages -3 2>/dev/null) || {
      log_w "TARGET" "Failed to list packages"
    }
    if [ -n "$pkgs" ]; then
      echo "$pkgs" | cut -d ":" -f 2 > "$TEMP_PKGS"
      if [ -f "$SPECTER_DIR/blacklist_enabled" ] && [ -s "$BLACKLIST" ]; then
        if grep -Fvxf "$BLACKLIST" "$TEMP_PKGS" > "${TEMP_PKGS}.filtered" 2>/dev/null; then
          mv "${TEMP_PKGS}.filtered" "$TEMP_PKGS"
        else
          log_w "TARGET" "Blacklist filtering failed"
        fi
      fi

      while read -r pkg; do
        [ -z "$pkg" ] && continue
        _compute_suffix "$pkg"
        _append_missing "${pkg}"
      done < "$TEMP_PKGS"
      rm -f "$TEMP_PKGS" "${TEMP_PKGS}.filtered"
    fi

    _merge_cleanup
    : "${_added:=0}"
    log_i "TARGET" "Checked $_count entries, added $_added"
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
      if [ -f "$SPECTER_DIR/blacklist_enabled" ] && [ -s "$BLACKLIST" ]; then
        if grep -Fvxf "$BLACKLIST" "$TEMP_PKGS" > "${TEMP_PKGS}.filtered" 2>/dev/null; then
          mv "${TEMP_PKGS}.filtered" "$TEMP_PKGS"
        else
          log_w "TARGET" "Blacklist filtering failed"
        fi
      fi

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

    rm -f "${TARGET_TXT}.bak"
    [ -f "$TARGET_TXT" ] && cp "$TARGET_TXT" "${TARGET_TXT}.bak"
    mv -f "$_TMP_TARGET" "$TARGET_TXT"

    _count=$(wc -l < "$TARGET_TXT")
    log_i "TARGET" "Wrote $_count entries to target.txt"
    ;;
esac

log_i "TARGET" "Target management complete"
exit 0
