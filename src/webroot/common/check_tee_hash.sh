#!/system/bin/sh
MODULE_ROOT="${0%/*}"
MODULE_ROOT="${MODULE_ROOT%/webroot/common}"
. "$MODULE_ROOT/lib/vbmeta.sh"

TEMP_DIR="/data/local/tmp/.specter_tee_check"
rm -rf "$TEMP_DIR" && mkdir -p "$TEMP_DIR"

_dex="$MODULE_ROOT/deps/classes.dex"
if [ -f "$_dex" ]; then
  /system/bin/app_process -Djava.class.path="$_dex" / com.dpejoh.specter.Main "$TEMP_DIR" 2>/dev/null || true

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
    echo "tee_hash=$(cat "$TEMP_DIR/tee_hash")"
  fi
else
  echo "tee_status=error (no classes.dex)"
fi

# Run boot_hash.sh to resolve the boot hash via its priority chain
sh "$MODULE_ROOT/features/boot_hash.sh" 2>/dev/null || true
_bh=$(getprop ro.boot.vbmeta.digest 2>/dev/null || echo "")
[ -n "$_bh" ] && echo "boot_hash=$_bh"

rm -rf "$TEMP_DIR"
