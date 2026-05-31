#!/system/bin/sh
MODDIR=${0%/*}
. "$MODDIR/../lib/common.sh"
. "$MODDIR/../lib/paths.sh"
. "$MODDIR/../lib/package_list.sh"
. "$MODDIR/../lib/config_env.sh"
. "$MODDIR/../lib/target_common.sh"

log "TARGET" "Start"

[ -d "$TRICKY_DIR" ] || die "Tricky Store data directory not found"

_tee_section || true

MODULE_ROOT="${MODDIR%/features}"
TEMP_PKGS="$MODULE_ROOT/pkgs.txt"
_TMP_TARGET="${TARGET_TXT}.new.$$"

_read_tee_status
_ensure_blacklist
_parse_customize

_ensure_target_txt() {
  [ -f "$TARGET_TXT" ] && [ -s "$TARGET_TXT" ] && return 0
  log "TARGET" "target.txt missing or empty, creating default"
  mkdir -p "$(dirname "$TARGET_TXT")" 2>/dev/null || true
  for _entry in $FIXED_TARGETS; do
    echo "$_entry"
  done > "$TARGET_TXT"
  unset _entry
}

_ensure_target_txt

case "${1}" in
  --merge)
    log "TARGET" "Mode: merge"
    _count=0; _added=0
    _TMP_EXIST="${TARGET_TXT}.exist.$$"
    trap 'rm -f "$TEMP_PKGS" "${TEMP_PKGS}.filtered" "$_TMP_TARGET" "$_TMP_EXIST"' EXIT

    _normalize_pkg() {
      _line="$1"
      case "$_line" in *!) _line=${_line%!} ;; *\?) _line=${_line%\?} ;; esac
      printf '%s' "$_line"
    }

    _record_existing() {
      [ -f "$_TMP_EXIST" ] || : > "$_TMP_EXIST"
      tr -d '\r' < "$TARGET_TXT" 2>/dev/null | while IFS= read -r _line || [ -n "$_line" ]; do
        [ -z "$_line" ] && continue
        case "$_line" in \[*\]) continue ;; esac
        _base=$(_normalize_pkg "$_line")
        [ -n "$_base" ] && printf '%s\n' "$_base" >> "$_TMP_EXIST"
      done
    }

    _append_missing() {
      _line="$1"
      _base=$(_normalize_pkg "$_line")
      [ -z "$_base" ] && return 0
      if ! grep -Fxq "$_base" "$_TMP_EXIST" 2>/dev/null; then
        printf '%s\n' "$_line" >> "$_TMP_TARGET"
        printf '%s\n' "$_base" >> "$_TMP_EXIST"
        _added=$((_added + 1))
      fi
      _count=$((_count + 1))
    }

    if [ -f "$TARGET_TXT" ] && [ -s "$TARGET_TXT" ]; then
      cp "$TARGET_TXT" "$_TMP_TARGET"
      _record_existing
    else
      : > "$_TMP_TARGET"
      : > "$_TMP_EXIST"
    fi

    for entry in $FIXED_TARGETS; do
      _append_missing "$entry"
    done

    pkgs=$(pm list packages -3 2>/dev/null) || {
      log "TARGET" "Warning: Failed to list packages"
    }
    if [ -n "$pkgs" ]; then
      echo "$pkgs" | cut -d ":" -f 2 > "$TEMP_PKGS"
      if [ -f "$SPECTER_DIR/blacklist_enabled" ] && [ -s "$BLACKLIST" ]; then
        if grep -Fvxf "$BLACKLIST" "$TEMP_PKGS" > "${TEMP_PKGS}.filtered" 2>/dev/null; then
          mv "${TEMP_PKGS}.filtered" "$TEMP_PKGS"
        else
          log "TARGET" "Warning: Blacklist filtering failed"
        fi
      fi

      while read -r pkg; do
        [ -z "$pkg" ] && continue
        _compute_suffix "$pkg"
        _append_missing "${pkg}${_suffix}"
      done < "$TEMP_PKGS"
      rm -f "$TEMP_PKGS" "${TEMP_PKGS}.filtered"
    fi

    rm -f "${TARGET_TXT}.bak"
    [ -f "$TARGET_TXT" ] && cp "$TARGET_TXT" "${TARGET_TXT}.bak"
    mv -f "$_TMP_TARGET" "$TARGET_TXT"

    log "TARGET" "Checked $_count entries, added $_added"
    ;;
  *)
    log "TARGET" "Mode: overwrite"
    _count=0
    trap 'rm -f "$TEMP_PKGS" "${TEMP_PKGS}.filtered" "$_TMP_TARGET"' EXIT

    for entry in $FIXED_TARGETS; do
      echo "$entry" >> "$_TMP_TARGET"
      _count=$((_count + 1))
    done

    pkgs=$(pm list packages -3 2>/dev/null) || {
      log "TARGET" "Warning: Failed to list packages"
    }
    if [ -n "$pkgs" ]; then
      echo "$pkgs" | cut -d ":" -f 2 > "$TEMP_PKGS"
      if [ -f "$SPECTER_DIR/blacklist_enabled" ] && [ -s "$BLACKLIST" ]; then
        if grep -Fvxf "$BLACKLIST" "$TEMP_PKGS" > "${TEMP_PKGS}.filtered" 2>/dev/null; then
          mv "${TEMP_PKGS}.filtered" "$TEMP_PKGS"
        else
          log "TARGET" "Warning: Blacklist filtering failed"
        fi
      fi

      while read -r pkg; do
        [ -z "$pkg" ] && continue
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
    log "TARGET" "Wrote $_count entries to target.txt"
    ;;
esac

log "TARGET" "Finish"
exit 0
