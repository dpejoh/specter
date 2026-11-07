#!/system/bin/sh
# shellcheck shell=ksh
# Write the installed-module/conflict snapshot consumed by the WebUI.
# Runs from service.sh, action.sh, and the scheduler's stale-input path.
set -e
MODDIR=${0%/*}
. "$MODDIR/../lib/common.sh"
. "$MODDIR/../lib/constants.sh"

OUT="${SPECTER_MODULES_STATE:-$MODDIR/../webroot/json/modules_state.json}"
ensure_dir "$(dirname "$OUT")"

_modules='{'
_modules_sep=''

_add_module_dir() {
  _amd_dir="$1"
  [ -f "$_amd_dir/module.prop" ] || return 0
  _amd_id="${_amd_dir##*/}"
  case "$_amd_id" in .*) _amd_id="${_amd_id#.}" ;; esac
  case "$_amd_id" in ''|.|..) return 0 ;; esac
  case "$_modules" in *"\"$_amd_id\":"*) return 0 ;; esac
  _amd_esc="$_amd_id"
  _amd_esc=${_amd_esc//\\/\\\\}
  _amd_esc=${_amd_esc//\"/\\\"}
  _modules="${_modules}${_modules_sep}\"$_amd_esc\":true"
  _modules_sep=','
}

for _ms_dir in \
  "$MODULES_BASE"/* "$MODULES_BASE"/.* \
  "${MODULES_BASE}_update"/* "${MODULES_BASE}_update"/.*; do
  [ -d "$_ms_dir" ] || continue
  _add_module_dir "$_ms_dir"
done
_modules="${_modules}}"

_conflicts=$(conflict_status_json 2>/dev/null || printf '[]')
_checked_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || echo "")
_checked_esc=$_checked_at
_checked_esc=${_checked_esc//\\/\\\\}
_checked_esc=${_checked_esc//\"/\\\"}

cat > "$OUT" <<EOF
{"modules":$_modules,"conflicts":$_conflicts,"checked_at":"$_checked_esc"}
EOF
chmod 644 "$OUT" 2>/dev/null || true

unset _modules _modules_sep _conflicts _checked_at _checked_esc _amd_esc _ms_dir
exit 0
