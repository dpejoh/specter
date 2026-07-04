#!/system/bin/sh
set -e
MODDIR=${0%/*}
. "$MODDIR/../lib/common.sh"
. "$MODDIR/../lib/constants.sh"

ZN_DATA_DIR="/data/adb/zygisksu"
ZN_MODULE_DIR="$MODULES_BASE/zygisksu"
[ ! -d "$ZN_MODULE_DIR" ] && ZN_MODULE_DIR="${MODULES_BASE}_update/zygisksu"

ZN_PROPFILE="$ZN_MODULE_DIR/module.prop"

if [ ! -f "$ZN_PROPFILE" ]; then
  log_e "ZYGISK_NEXT" "Zygisk Next module not found at $ZN_MODULE_DIR"
  exit 1
fi

ZN_NAME=$(grep "^name=" "$ZN_PROPFILE" | cut -d= -f2)
log_i "ZYGISK_NEXT" "Detected: $ZN_NAME"

case "$ZN_NAME" in
  *Zygisk*Next*)
    ;;
  *)
    log_e "ZYGISK_NEXT" "Unknown module '$ZN_NAME'"
    exit 1
    ;;
esac

ensure_dir "$ZN_DATA_DIR"

printf '1' > "$ZN_DATA_DIR/denylist_enforce" && log_d "ZYGISK_NEXT" "denylist_enforce → 1"
printf '1' > "$ZN_DATA_DIR/denylist_policy" && log_d "ZYGISK_NEXT" "denylist_policy → 1"

log_i "ZYGISK_NEXT" "Applied denylist config"
log_i "ZYGISK_NEXT" "Zygisk Next config complete"
exit 0
