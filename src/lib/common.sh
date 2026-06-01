# shellcheck shell=sh
# Backward-compatible shim — sources all domain libraries.
# Scripts that source common.sh continue to work unchanged.
# New scripts can source only the libraries they need (e.g. lib/log.sh).

# Determine module root. MODDIR is set by most callers (service.sh, features, etc.).
# MODULE_ROOT is used by webroot/common/* scripts.
# As last resort, derive from the caller's $0 path.
if [ -n "$MODDIR" ]; then
  case "$MODDIR" in
    */features) _root="${MODDIR%/*}" ;;
    *)          _root="$MODDIR" ;;
  esac
elif [ -n "$MODULE_ROOT" ]; then
  _root="$MODULE_ROOT"
else
  _d="${0%/*}"
  case "$_d" in
    */lib) _root="${_d%/lib}" ;;
    */features) _root="${_d%/features}" ;;
    */webroot/common) _root="${_d%/webroot/common}" ;;
    *) _root="$_d" ;;
  esac
  unset _d
fi

. "$_root/lib/log.sh"
. "$_root/lib/util.sh"
. "$_root/lib/network.sh"
. "$_root/lib/detect.sh"
. "$_root/lib/paths.sh"
. "$_root/lib/props.sh"
. "$_root/lib/keybox.sh"
. "$_root/lib/conflicts.sh"

# Module-local paths (was in paths.sh, consolidated here)
BBIN="$_root/bin"
: "${CONFIG_DIR:="$_root/config"}"
MIGRATION_MARKER="$_root/.migrated"

unset _root
