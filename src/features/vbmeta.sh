#!/system/bin/sh
set -e
MODDIR=${0%/*}
. "$MODDIR/../lib/common.sh"
. "$MODDIR/../lib/paths.sh"
. "$MODDIR/../lib/config_env.sh"

[ "$(cfg_get toggle_vbmeta 1)" = "0" ] && exit 0

if [ ! -f "$VBMETA_DIGEST" ]; then
  . "$MODDIR/../lib/vbmeta.sh"
  _hash=$(vbmeta_digest "/dev/block/by-name/vbmeta" 2>/dev/null || true)
  if [ -n "$_hash" ]; then
    ensure_dir "$SPECTER_DIR"
    echo "$_hash" > "$VBMETA_DIGEST"
  fi
  unset _hash
fi

apply_vbmeta_props
