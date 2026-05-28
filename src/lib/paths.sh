# shellcheck shell=sh disable=SC2034
# Tricky Store paths
TRICKY_DIR="/data/adb/tricky_store"
TARGET_FILE="$TRICKY_DIR/keybox.xml"
BACKUP_FILE="$TRICKY_DIR/keybox.xml.bak"
LOCKED_FILE="$TRICKY_DIR/locked.xml"
LOCKED_BACKUP="$TRICKY_DIR/locked.xml.bak"
TARGET_TXT="$TRICKY_DIR/target.txt"
SECURITY_PATCH_FILE="$TRICKY_DIR/security_patch.txt"
TEE_STATUS="$SPECTER_DIR/tee_status"
TEE_HASH="$SPECTER_DIR/tee_hash"

# Other system paths
SPECTER_DIR="/data/adb/Specter"
HMA_DIR="/data/user/0/org.frknkrc44.hma_oss/files"
HMA_FILE="$HMA_DIR/config.json"
GMS_PROPS_FILE="/data/system/gms_certified_props.json"

# Module-local paths - derived from MODDIR (set by caller before sourcing)
# Handles both feature scripts (MODDIR ends with /features) and root scripts
if [ -n "$MODDIR" ]; then
  case "$MODDIR" in
    */features) _root="${MODDIR%/*}" ;;
    *)          _root="$MODDIR" ;;
  esac
  BBIN="$_root/bin"
  CONFIG_DIR="$_root/config"
  MIGRATION_MARKER="$_root/.migrated"
  unset _root
fi
