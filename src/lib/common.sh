# shellcheck shell=sh

if [ -n "$MODDIR" ]; then
  case "$MODDIR" in */features) _root="${MODDIR%/*}" ;; *) _root="$MODDIR" ;; esac
elif [ -n "$MODULE_ROOT" ]; then
  _root="$MODULE_ROOT"
else
  _d="${0%/*}"
  case "$_d" in */lib) _root="${_d%/lib}" ;; */features) _root="${_d%/features}" ;; */webroot/common) _root="${_d%/webroot/common}" ;; *) _root="$_d" ;; esac
  unset _d
fi

. "$_root/lib/log.sh"
. "$_root/lib/constants.sh"
. "$_root/lib/network.sh"
. "$_root/lib/modules.sh"
. "$_root/lib/detect.sh"
. "$_root/lib/props.sh"
. "$_root/lib/keybox.sh"
. "$_root/lib/conflicts.sh"

: "${CONFIG_DIR:="$SPECTER_DIR/config"}"

[ "$(cfg_get dev_mode false 2>/dev/null)" = "true" ] && export SPECTER_LOG_LEVEL=debug

unset _root
