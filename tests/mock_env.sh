# shellcheck shell=sh
REPO_ROOT="${REPO_ROOT:-${SPECTER_REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/.." && pwd 2>/dev/null || pwd)}}"
TEST_ROOT="${SPECTER_TEST_ROOT:-$(mktemp -d /tmp/specter_test_XXXX)}"
export TEST_ROOT REPO_ROOT

cleanup() { [ -n "$TEST_ROOT" ] && rm -rf "$TEST_ROOT" 2>/dev/null || true; }

bootstrap() {
  cleanup 2>/dev/null
  TEST_ROOT=$(mktemp -d /tmp/specter_test_XXXX)
  export TEST_ROOT
  MOCK_DIR="$TEST_ROOT/mock"; PROPS_DIR="$MOCK_DIR/props"; LOGS_DIR="$MOCK_DIR/logs"
  BIN_DIR="$TEST_ROOT/bin"; CONFIG_DIR="$TEST_ROOT/config"
  SPECTER_DIR="$TEST_ROOT/specter"; TRICKY_DIR="$TEST_ROOT/tricky_store"
  MODDIR="$TEST_ROOT"
  MODULES_BASE="$TEST_ROOT/modules"
  OMK_MODULE="$MODULES_BASE/oh_my_keymint"
  OMK_DIR="$TEST_ROOT/omk"
  OMK_KEYBOX="$OMK_DIR/keybox.xml"
  OMK_INJECTOR="$OMK_DIR/injector.toml"
  OMK_CONFIG="$OMK_DIR/config.toml"
  OMK_RESTART_DIR="$TEST_ROOT/omk_restart"
  mkdir -p "$PROPS_DIR" "$LOGS_DIR" "$BIN_DIR" "$CONFIG_DIR/val" "$SPECTER_DIR" "$TRICKY_DIR" "$MODULES_BASE"
  export MOCK_DIR PROPS_DIR LOGS_DIR BIN_DIR CONFIG_DIR SPECTER_DIR TRICKY_DIR MODDIR
  export MODULES_BASE OMK_MODULE OMK_DIR OMK_KEYBOX OMK_INJECTOR OMK_CONFIG OMK_RESTART_DIR

  cat > "$BIN_DIR/resetprop" << 'MOCK'
#!/bin/sh
PROPS_DIR="${MOCK_DIR}/props"; LOGS_DIR="${MOCK_DIR}/logs"; mkdir -p "$PROPS_DIR" "$LOGS_DIR"
case "${1:-}" in
  --delete) rm -f "$PROPS_DIR/$2"; echo "DELETE $2" >> "$LOGS_DIR/resetprop.log" ;;
  -n) printf '%s' "$3" > "$PROPS_DIR/$2"; echo "SET $2=$3" >> "$LOGS_DIR/resetprop.log" ;;
  -p) [ "$2" = "--delete" ] && rm -f "$PROPS_DIR/$3" && echo "DELETE $3" >> "$LOGS_DIR/resetprop.log" || { printf '%s' "$3" > "$PROPS_DIR/$2"; echo "SET_PERSIST $2=$3" >> "$LOGS_DIR/resetprop.log"; } ;;
  -d) rm -f "$PROPS_DIR/$2"; echo "DELETE $2" >> "$LOGS_DIR/resetprop.log" ;;
  -Z) echo "u:object_r:properties_serial:0:c260,c256,c512,c768 c0e8e35c" ;;
  "")  for f in "$PROPS_DIR"/*; do [ -f "$f" ] && printf '[%s]: [%s]\n' "$(basename "$f")" "$(cat "$f")"; done ;;
  *)  [ -f "$PROPS_DIR/$1" ] && cat "$PROPS_DIR/$1" && echo "GET $1=$(cat "$PROPS_DIR/$1")" >> "$LOGS_DIR/resetprop.log" || { echo "GET $1=(missing)" >> "$LOGS_DIR/resetprop.log"; exit 1; } ;;
esac
MOCK
  chmod +x "$BIN_DIR/resetprop"

  cat > "$BIN_DIR/getprop" << 'MOCK'
#!/bin/sh
PROPS_DIR="${MOCK_DIR}/props"
[ -n "$1" ] && { [ -f "$PROPS_DIR/$1" ] && cat "$PROPS_DIR/$1" || exit 1; } || for f in "$PROPS_DIR"/*; do [ -f "$f" ] && printf '[%s]: [%s]\n' "$(basename "$f")" "$(cat "$f")"; done
MOCK
  chmod +x "$BIN_DIR/getprop"

  cat > "$BIN_DIR/pm" << 'MOCK'
#!/bin/sh
case "$*" in
  *list*packages*) echo "package:com.android.vending"; echo "package:com.google.android.gms"; echo "package:com.dpejoh.specter" ;;
  *) echo "mock pm $*" ;;
esac
MOCK
  chmod +x "$BIN_DIR/pm"

  cat > "$BIN_DIR/setprop" << 'MOCK'
#!/bin/sh
LOGS_DIR="${MOCK_DIR}/logs"; mkdir -p "$LOGS_DIR"
echo "SETPROP $1=$2" >> "$LOGS_DIR/resetprop.log"
case "$1" in ctl.stop) echo "CTL_STOP $2" >> "$LOGS_DIR/resetprop.log" ;; *) printf '%s' "$2" > "${MOCK_DIR}/props/$1" ;; esac
MOCK
  chmod +x "$BIN_DIR/setprop"

  for _cmd in content settings am pgrep sha256sum dd blockdev od kill; do
    printf '#!/bin/sh\necho "mock %s"\n' "$_cmd" > "$BIN_DIR/$_cmd"
    chmod +x "$BIN_DIR/$_cmd"
  done

  cat > "$BIN_DIR/find" << 'MOCK'
#!/bin/sh
echo "FIND $*" >> "$LOGS_DIR/find.log"
echo "$*" | grep -q "install-recovery.sh" && [ -f "$MOCK_DIR/fake_recovery" ] && echo "$MOCK_DIR/fake_recovery"
MOCK
  chmod +x "$BIN_DIR/find"
}

source_libs() {
  PATH="$BIN_DIR:/usr/bin:/bin"
  . "$REPO_ROOT/src/lib/log.sh" 2>/dev/null
  . "$REPO_ROOT/src/lib/constants.sh" 2>/dev/null
  . "$REPO_ROOT/src/lib/network.sh" 2>/dev/null
  . "$REPO_ROOT/src/lib/modules.sh" 2>/dev/null
  . "$REPO_ROOT/src/lib/detect.sh" 2>/dev/null
  . "$REPO_ROOT/src/lib/props.sh" 2>/dev/null
  . "$REPO_ROOT/src/lib/keybox.sh" 2>/dev/null
  . "$REPO_ROOT/src/lib/keystore.sh" 2>/dev/null
  . "$REPO_ROOT/src/lib/conflicts.sh" 2>/dev/null
  SPECTER_DIR="$TEST_ROOT/specter"
  GMS_PROPS_FILE="$TEST_ROOT/gms_certified_props.json"
  CONFLICT_BACKUP_FILE="$SPECTER_DIR/conflict_backups.txt"
  VBMETA_DIGEST="$SPECTER_DIR/vbmeta_digest"
  TEE_STATUS="$SPECTER_DIR/tee_status"
  TEE_BHASH="$SPECTER_DIR/tee_hash"
  # constants.sh only sets these on first use (:=), so re-derive them from
  # the current TRICKY_DIR/OMK_DIR on every call — otherwise they stick to
  # whichever TEST_ROOT was active the first time source_libs ran.
  TARGET_FILE="$TRICKY_DIR/keybox.xml"
  BACKUP_FILE="$SPECTER_DIR/backup/keybox.xml.bak"
  LOCKED_FILE="$TRICKY_DIR/locked.xml"
  LOCKED_BACKUP="$SPECTER_DIR/backup/locked.xml.bak"
  TARGET_TXT="$TRICKY_DIR/target.txt"
  SECURITY_PATCH_FILE="$TRICKY_DIR/security_patch.txt"
  BACKUP_DIR="$SPECTER_DIR/backup"
  OMK_KEYBOX="$OMK_DIR/keybox.xml"
  OMK_INJECTOR="$OMK_DIR/injector.toml"
  OMK_CONFIG="$OMK_DIR/config.toml"
}

# Fakes an installed module by writing $MODULES_BASE/<id>/module.prop.
mk_module() {
  _mkm_id="$1" _mkm_name="$2"
  mkdir -p "$MODULES_BASE/$_mkm_id"
  printf 'name=%s\n' "$_mkm_name" > "$MODULES_BASE/$_mkm_id/module.prop"
  unset _mkm_id _mkm_name
}

run_feature() {
  _feature="$1"; shift
  PATH="$BIN_DIR:/usr/bin:/bin" MODDIR="$TEST_ROOT" SPECTER_DIR="$SPECTER_DIR" CONFIG_DIR="$CONFIG_DIR" TRICKY_DIR="$TRICKY_DIR" sh "$REPO_ROOT/src/features/$_feature" "$@" 2>&1
}

source_feature() {
  PATH="$BIN_DIR:/usr/bin:/bin" MODDIR="$TEST_ROOT" SPECTER_DIR="$SPECTER_DIR" CONFIG_DIR="$CONFIG_DIR" . "$REPO_ROOT/src/features/$1" 2>/dev/null || true
}

set_cfg() { mkdir -p "$CONFIG_DIR/val" && printf '%s' "$2" > "$CONFIG_DIR/val/$1.val"; }
set_prop() { printf '%s' "$2" > "$PROPS_DIR/$1"; }
get_log() { [ -f "$LOGS_DIR/${1:-resetprop}.log" ] && tail -"${2:-999}" "$LOGS_DIR/$1"; }
prop_was_set() { [ -f "$PROPS_DIR/$1" ] && [ -n "$(cat "$PROPS_DIR/$1")" ]; }
prop_value() { [ -f "$PROPS_DIR/$1" ] && cat "$PROPS_DIR/$1" || echo ""; }
log_contains() { [ -f "$LOGS_DIR/$1" ] && grep -q "$2" "$LOGS_DIR/$1"; }
