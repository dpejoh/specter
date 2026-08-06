# shellcheck shell=sh
# Helper APK — target append + versionCode compare
# SPECTER_PKG comes from constants.sh

# 0 if bundled should replace installed (missing installed, or bundled > installed)
specter_vc_newer() {
  [ -z "$2" ] && return 0
  [ "$1" -gt "$2" ] 2>/dev/null
}

# Append SPECTER_PKG to the active target list if missing (no full refresh)
ensure_specter_target() {
  detect_keystore_manager 2>/dev/null || true
  if [ -n "$KSM_TARGETS" ]; then
    if ksm_read_targets 2>/dev/null | grep -Fxq "$SPECTER_PKG"; then
      return 0
    fi
    _est_tmp="${SPECTER_DIR}/.specter_tgt.$$"
    ksm_read_targets_raw > "$_est_tmp" 2>/dev/null || : > "$_est_tmp"
    printf '%s\n' "$SPECTER_PKG" >> "$_est_tmp"
    ksm_commit_targets "$_est_tmp" || true
    unset _est_tmp
  else
    mkdir -p "$(dirname "$TARGET_TXT")" 2>/dev/null || true
    if [ -f "$TARGET_TXT" ] && grep -qE "^${SPECTER_PKG}[!?]?$" "$TARGET_TXT" 2>/dev/null; then
      return 0
    fi
    printf '%s\n' "$SPECTER_PKG" >> "$TARGET_TXT"
  fi
}
