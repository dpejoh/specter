#!/system/bin/sh
MODULE_ROOT="${0%/*}"
MODULE_ROOT="${MODULE_ROOT%/webroot/common}"
. "$MODULE_ROOT/lib/vbmeta.sh"
. "$MODULE_ROOT/lib/constants.sh"

TEMP_DIR="/data/local/tmp/.specter_tee_check"
rm -rf "$TEMP_DIR" && mkdir -p "$TEMP_DIR"

_dex="$MODULE_ROOT/deps/classes.dex"
if [ -f "$_dex" ]; then
  su -c "/system/bin/app_process -Djava.class.path='$_dex' / com.dpejoh.specter.Main '$TEMP_DIR'" 2>/dev/null || true

  if [ -f "$TEMP_DIR/tee_status" ]; then
    _val=$(grep -E '^(teeBroken|tee_broken)=' "$TEMP_DIR/tee_status" 2>/dev/null | cut -d= -f2)
    case "$_val" in
      true)  echo "tee_status=broken" ;;
      false) echo "tee_status=normal" ;;
      *)     echo "tee_status=unknown" ;;
    esac
  else
    echo "tee_status=error"
  fi

  if [ -f "$TEMP_DIR/tee_hash" ]; then
    echo "tee_bhash=$(cat "$TEMP_DIR/tee_hash")"
  fi

  if [ -f "$TEMP_DIR/tee_tier" ]; then
    echo "tee_tier=$(cat "$TEMP_DIR/tee_tier" | tr -d ' \n')"
  fi

  # Update cached files so device info reflects fresh results
  mkdir -p "$SPECTER_DIR" 2>/dev/null || true
  for _f in tee_status tee_hash tee_tier tee_keymaster_version; do
    [ -f "$TEMP_DIR/$_f" ] && cp "$TEMP_DIR/$_f" "$SPECTER_DIR/$_f"
  done
  unset _f
else
  echo "tee_status=error (no classes.dex)"
fi

# Computed from partition (independent of TEE)
_vbmeta_slot=$(getprop ro.boot.slot_suffix 2>/dev/null || echo "")
_vbmeta_dev="/dev/block/by-name/vbmeta${_vbmeta_slot}"
[ -b "$_vbmeta_dev" ] || _vbmeta_dev="/dev/block/by-name/vbmeta"
_vbmeta_hash=$(vbmeta_digest "$_vbmeta_dev" 2>/dev/null || true)
[ -n "$_vbmeta_hash" ] && echo "vbmeta_hash=$_vbmeta_hash"
unset _vbmeta_slot _vbmeta_dev _vbmeta_hash

# Prop value
_bh=$(getprop ro.boot.vbmeta.digest 2>/dev/null || echo "")
[ -n "$_bh" ] && echo "boot_hash=$_bh"
unset _bh

rm -rf "$TEMP_DIR"
