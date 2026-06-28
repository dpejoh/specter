# shellcheck shell=sh disable=SC2034

# -- URL definitions --
KEYBOX_URL="https://rawbin.dpejoh.com/key"
ATTESTATION_URL="https://rawbin.dpejoh.com/clips/attestation"
HMA_CONFIG_URL="https://rawbin.dpejoh.com/clips/hma"
CATALOG_URL="https://rawbin.dpejoh.com/catalog"
GOOGLE_REVOCATION_URL="https://android.googleapis.com/attestation/status?encrypted=0"
FALLBACK_KEYBOXES="Yuri/8"

# -- Paths (defaults, overridable by env) --
: "${MODULES_BASE:=/data/adb/modules}"
: "${SPECTER_DIR:=/data/adb/specter}"
: "${TRICKY_DIR:=/data/adb/tricky_store}"
: "${PIF_DIR:=$MODULES_BASE/playintegrityfix}"
: "${ZYNEXT_DIR:=$MODULES_BASE/zygisksu}"
: "${TARGET_FILE:=$TRICKY_DIR/keybox.xml}"
: "${BACKUP_FILE:=$SPECTER_DIR/backup/keybox.xml.bak}"
: "${LOCKED_FILE:=$TRICKY_DIR/locked.xml}"
: "${LOCKED_BACKUP:=$SPECTER_DIR/backup/locked.xml.bak}"
: "${TARGET_TXT:=$TRICKY_DIR/target.txt}"
: "${SECURITY_PATCH_FILE:=$TRICKY_DIR/security_patch.txt}"
: "${TEE_STATUS:=$SPECTER_DIR/tee_status}"
: "${TEE_BHASH:=$SPECTER_DIR/tee_hash}"
: "${TEE_TIER:=$SPECTER_DIR/tee_tier}"
: "${TEE_KEYMASTER_VER:=$SPECTER_DIR/tee_keymaster_version}"
: "${TEE_CHALLENGE:=$SPECTER_DIR/tee_challenge}"
: "${VBMETA_DIGEST:=$SPECTER_DIR/vbmeta_digest}"
: "${HMA_DIR:=/data/user/0/org.frknkrc44.hma_oss/files}"
: "${HMA_FILE:=$HMA_DIR/config.json}"
: "${GMS_PROPS_FILE:=/data/system/gms_certified_props.json}"
: "${BACKUP_DIR:=$SPECTER_DIR/backup}"

# -- Package lists --
GMS_APPS="com.android.vending com.google.android.gsf com.google.android.gms com.google.android.contactkeys com.google.android.ims com.google.android.safetycore com.google.android.apps.walletnfcrel com.google.android.apps.nbu.paisa.user"
FIXED_TARGETS="android $GMS_APPS"
GMS_KILL_LIST="$GMS_APPS com.google.android.gms.persistent com.google.android.gms.unstable com.google.android.rkpdapp com.android.chrome com.google.android.googlequicksearchbox"
TOOL_APPS="bin.mt.plus bin.mt.plus.canary com.omarea.vtools moe.shizuku.privileged.api com.estrongs.android.pop com.coolapk.market com.sevtinge.hyperceiler com.coderstory.toolkit"

# -- Decode substitution --
STD_ALPHABET="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
SHUFFLED_ALPHABET="1dgWnocayqxU3r6vA5lCIPYfHmkV08b4tz+KMsp2NQ9LRXihODwSj7BEFJ/ZuGTe"

decode_substitution() {
  tr "$SHUFFLED_ALPHABET" "$STD_ALPHABET" < "$1" > "$2"
}

# -- Config env --
cfg_get() {
  _cg_key="$1" _cg_default="$2"
  _cg_val=$(cat "$CONFIG_DIR/$_cg_key.val" 2>/dev/null || true)
  printf '%s' "${_cg_val:-$_cg_default}"
  unset _cg_key _cg_default _cg_val
}

cfg_set() {
  mkdir -p "$CONFIG_DIR" 2>/dev/null
  printf '%s' "$2" > "$CONFIG_DIR/$1.val"
}

# -- Utilities --
ensure_dir() { mkdir -p "$1" 2>/dev/null; }

_escape_json() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }

version_ge() {
  _v_a="$1" _v_b="$2"
  _v_saved_ifs="$IFS"; IFS='.'; set -- $_v_a; _v_a1=${1:-0} _v_a2=${2:-0} _v_a3=${3:-0}
  set -- $_v_b; _v_b1=${1:-0} _v_b2=${2:-0} _v_b3=${3:-0}
  IFS="$_v_saved_ifs"
  [ "$_v_a1" -gt "$_v_b1" ] && unset _v_a _v_b _v_saved_ifs _v_a1 _v_a2 _v_a3 _v_b1 _v_b2 _v_b3 && return 0
  [ "$_v_a1" -lt "$_v_b1" ] && unset _v_a _v_b _v_saved_ifs _v_a1 _v_a2 _v_a3 _v_b1 _v_b2 _v_b3 && return 1
  [ "$_v_a2" -gt "$_v_b2" ] && unset _v_a _v_b _v_saved_ifs _v_a1 _v_a2 _v_a3 _v_b1 _v_b2 _v_b3 && return 0
  [ "$_v_a2" -lt "$_v_b2" ] && unset _v_a _v_b _v_saved_ifs _v_a1 _v_a2 _v_a3 _v_b1 _v_b2 _v_b3 && return 1
  [ "$_v_a3" -ge "$_v_b3" ] && unset _v_a _v_b _v_saved_ifs _v_a1 _v_a2 _v_a3 _v_b1 _v_b2 _v_b3 && return 0
  unset _v_a _v_b _v_saved_ifs _v_a1 _v_a2 _v_a3 _v_b1 _v_b2 _v_b3
  return 1
}

run_device_info() {
  for _rdi_root in "$@"; do
    [ -n "$_rdi_root" ] || continue
    [ -f "$_rdi_root/webroot/common/device-info.sh" ] && sh "$_rdi_root/webroot/common/device-info.sh" && return 0
  done
  return 1
}
