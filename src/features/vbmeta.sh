#!/system/bin/sh
set -e
MODDIR=${0%/*}
. "$MODDIR/../lib/common.sh"
. "$MODDIR/../lib/paths.sh"
. "$MODDIR/../lib/config_env.sh"

[ "$(cfg_get toggle_vbmeta 1)" = "0" ] && exit 0

if [ ! -f "$VBMETA_DIGEST" ]; then
  . "$MODDIR/../lib/vbmeta.sh"
  _vbmeta_slot=$(getprop ro.boot.slot_suffix 2>/dev/null || echo "")
  _vbmeta_dev="/dev/block/by-name/vbmeta${_vbmeta_slot}"
  [ -b "$_vbmeta_dev" ] || _vbmeta_dev="/dev/block/by-name/vbmeta"
  _hash=$(vbmeta_digest "$_vbmeta_dev" 2>/dev/null || true)
  if [ -n "$_hash" ]; then
    ensure_dir "$SPECTER_DIR"
    echo "$_hash" > "$VBMETA_DIGEST"
  fi
  unset _hash _vbmeta_slot _vbmeta_dev
fi

apply_vbmeta_props
