#!/system/bin/sh
set -e
MODDIR=${0%/*}
. "$MODDIR/../lib/log.sh"
. "$MODDIR/../lib/constants.sh"

# One line per installed Xposed module: package<TAB>matched markers.
# The helper is a one-shot app_process run; results are cached until the
# installed package set or probe dex changes, so repeated HMA runs stay cheap.

_force=0
case "${1:-}" in --refresh|-f) _force=1 ;; esac

_dex="${SPECTER_DEX:-$MODDIR/../deps/classes.dex}"
_cache_dir="$SPECTER_DIR/cache"
_cache="$_cache_dir/xposed_modules"
_fingerprint="$_cache_dir/xposed_modules.fingerprint"
_ttl="${XPOSED_CACHE_TTL:-3600}"

ensure_dir "$_cache_dir"

_current_fingerprint=$(pm list packages 2>/dev/null | sort | cksum | awk '{print $1 ":" $2}')
# The probe dex can change between module upgrades; include it so an upgrade
# does not keep serving results from the previous scanner.
_dex_fingerprint=$(cksum "$_dex" 2>/dev/null | awk '{print $1 ":" $2}')
[ -n "$_dex_fingerprint" ] || _dex_fingerprint="missing"
_current_fingerprint="$_current_fingerprint:$_dex_fingerprint"
_cache_fresh=0
if [ -f "$_cache" ]; then
  _mtime=$(stat -c %Y "$_cache" 2>/dev/null || echo 0)
  _age=$(( $(date +%s) - _mtime ))
  [ "$_age" -ge 0 ] && [ "$_age" -lt "$_ttl" ] && _cache_fresh=1
fi

if [ "$_force" = "0" ] && [ "$_cache_fresh" = "1" ] &&
   [ "$(cat "$_fingerprint" 2>/dev/null || true)" = "$_current_fingerprint" ]; then
  cat "$_cache"
  exit 0
fi

if [ ! -f "$_dex" ]; then
  log_e "XPOSED" "helper dex not found"
  exit 1
fi

_tmp="${_cache}.$$"
if ! CLASSPATH="$_dex" app_process / com.dpejoh.specter.XposedProbe > "$_tmp" 2>/dev/null; then
  rm -f "$_tmp"
  log_e "XPOSED" "Xposed scan failed"
  exit 1
fi

mv -f "$_tmp" "$_cache"
printf '%s\n' "$_current_fingerprint" > "$_fingerprint"
cat "$_cache"
