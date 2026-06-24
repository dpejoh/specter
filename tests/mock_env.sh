# shellcheck shell=sh
# Mock environment for Specter boot script tests.
# Usage: . ./mock_env.sh  (from tests/ dir)

_self="${BASH_SOURCE[0]:-$0}"
REPO_ROOT="${SPECTER_REPO_ROOT:-$(cd "$(dirname "$_self")/.." && pwd 2>/dev/null || pwd)}"
unset _self
TEST_ROOT="${SPECTER_TEST_ROOT:-$(mktemp -d /tmp/specter_test_XXXX)}"

export TEST_ROOT REPO_ROOT

die() { echo "FATAL: $*" >&2; exit 1; }

cleanup() { [ -n "$TEST_ROOT" ] && rm -rf "$TEST_ROOT" 2>/dev/null || true; }

# Per-test setup – creates fresh temp dirs and mock state
bootstrap() {
  cleanup 2>/dev/null
  TEST_ROOT=$(mktemp -d /tmp/specter_test_XXXX)
  export TEST_ROOT

  MOCK_DIR="$TEST_ROOT/mock"
  PROPS_DIR="$MOCK_DIR/props"
  LOGS_DIR="$MOCK_DIR/logs"
  BIN_DIR="$TEST_ROOT/bin"
  CONFIG_DIR="$TEST_ROOT/config"
  SPECTER_DIR="$TEST_ROOT/specter"
  TRICKY_DIR="$TEST_ROOT/tricky_store"
  MODDIR="$TEST_ROOT"
  MOCK_STATE_DIR="$MOCK_DIR"

  mkdir -p "$PROPS_DIR" "$LOGS_DIR" "$BIN_DIR" "$CONFIG_DIR" "$SPECTER_DIR" "$TRICKY_DIR"

  export MOCK_DIR PROPS_DIR LOGS_DIR BIN_DIR CONFIG_DIR SPECTER_DIR TRICKY_DIR MODDIR MOCK_STATE_DIR

  _install_mock_bins
}

# Install mock executables into BIN_DIR
_install_mock_bins() {
  _dir="$BIN_DIR"

  # --- resetprop ---
  cat > "$_dir/resetprop" << 'MOCK'
#!/bin/sh
MOCK_DIR="${MOCK_STATE_DIR:-/tmp/specter_test_state}"
PROPS_DIR="$MOCK_DIR/props"
LOGS_DIR="$MOCK_DIR/logs"
mkdir -p "$PROPS_DIR" "$LOGS_DIR"

case "${1:-}" in
  --delete)
    NAME="$2"
    rm -f "$PROPS_DIR/$NAME"
    echo "DELETE $NAME" >> "$LOGS_DIR/resetprop.log"
    ;;
  -n)
    NAME="$2" VAL="$3"
    printf '%s' "$VAL" > "$PROPS_DIR/$NAME"
    echo "SET $NAME=$VAL" >> "$LOGS_DIR/resetprop.log"
    ;;
  -p)
    if [ "$2" = "--delete" ]; then
      NAME="$3"
      rm -f "$PROPS_DIR/$NAME"
      echo "DELETE $NAME" >> "$LOGS_DIR/resetprop.log"
    else
      NAME="$2" VAL="$3"
      printf '%s' "$VAL" > "$PROPS_DIR/$NAME"
      echo "SET_PERSIST $NAME=$VAL" >> "$LOGS_DIR/resetprop.log"
    fi
    ;;
  -d)
    NAME="$2"
    rm -f "$PROPS_DIR/$NAME"
    echo "DELETE $NAME" >> "$LOGS_DIR/resetprop.log"
    ;;
  -Z)
    echo "u:object_r:properties_serial:0:c260,c256,c512,c768 c0e8e35c vendor_default_prop"
    echo "GETZ $2" >> "$LOGS_DIR/resetprop.log"
    ;;
  "")
    for f in "$PROPS_DIR"/*; do
      [ -f "$f" ] && printf '[%s]: [%s]\n' "$(basename "$f")" "$(cat "$f")"
    done
    echo "LIST" >> "$LOGS_DIR/resetprop.log"
    ;;
  *)
    if [ -f "$PROPS_DIR/$1" ]; then
      cat "$PROPS_DIR/$1"
      echo "GET $1=$(cat "$PROPS_DIR/$1")" >> "$LOGS_DIR/resetprop.log"
    else
      echo "GET $1=(missing)" >> "$LOGS_DIR/resetprop.log"
      exit 1
    fi
    ;;
esac
MOCK
  chmod +x "$_dir/resetprop"

  # --- getprop ---
  cat > "$_dir/getprop" << 'MOCK'
#!/bin/sh
MOCK_DIR="${MOCK_STATE_DIR:-/tmp/specter_test_state}"
PROPS_DIR="$MOCK_DIR/props"
if [ -n "$1" ]; then
  if [ -f "$PROPS_DIR/$1" ]; then
    cat "$PROPS_DIR/$1"
  else
    exit 1
  fi
else
  for f in "$PROPS_DIR"/*; do [ -f "$f" ] && printf '[%s]: [%s]\n' "$(basename "$f")" "$(cat "$f")"; done
fi
MOCK
  chmod +x "$_dir/getprop"

  # --- setprop ---
  cat > "$_dir/setprop" << 'MOCK'
#!/bin/sh
MOCK_DIR="${MOCK_STATE_DIR:-/tmp/specter_test_state}"
PROPS_DIR="$MOCK_DIR/props"
LOGS_DIR="$MOCK_DIR/logs"
mkdir -p "$PROPS_DIR" "$LOGS_DIR"
echo "SETPROP $1=$2" >> "$LOGS_DIR/resetprop.log"
case "$1" in
  ctl.stop) echo "CTL_STOP $2" >> "$LOGS_DIR/resetprop.log" ;;
  *) printf '%s' "$2" > "$PROPS_DIR/$1" ;;
esac
MOCK
  chmod +x "$_dir/setprop"

  # --- pm ---
  cat > "$_dir/pm" << 'MOCK'
#!/bin/sh
MOCK_DIR="${MOCK_STATE_DIR:-/tmp/specter_test_state}"
LOGS_DIR="$MOCK_DIR/logs"
mkdir -p "$LOGS_DIR"
echo "PM $*" >> "$LOGS_DIR/pm.log"
case "$1" in
  list)
    if echo "$*" | grep -q "es.chiteroman.bootloaderspoofer"; then
      exit 1
    fi
    echo "package:com.android.vending"
    echo "package:com.google.android.gms"
    echo "package:com.dpejoh.specter"
    if [ -f "$MOCK_DIR/pm_extra_pkgs" ]; then
      cat "$MOCK_DIR/pm_extra_pkgs"
    fi
    ;;
  install|uninstall|clear) ;;
esac
MOCK
  chmod +x "$_dir/pm"

  # --- content ---
  cat > "$_dir/content" << 'MOCK'
#!/bin/sh
MOCK_DIR="${MOCK_STATE_DIR:-/tmp/specter_test_state}"
LOGS_DIR="$MOCK_DIR/logs"
echo "CONTENT $*" >> "$LOGS_DIR/content.log"
if echo "$*" | grep -q "/check"; then
  echo "status=normal"
elif echo "$*" | grep -q "/hash"; then
  echo "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
fi
MOCK
  chmod +x "$_dir/content"

  # --- settings ---
  cat > "$_dir/settings" << 'MOCK'
#!/bin/sh
MOCK_DIR="${MOCK_STATE_DIR:-/tmp/specter_test_state}"
LOGS_DIR="$MOCK_DIR/logs"
mkdir -p "$LOGS_DIR"
echo "SETTINGS $*" >> "$LOGS_DIR/settings.log"
MOCK
  chmod +x "$_dir/settings"

  # --- am ---
  cat > "$_dir/am" << 'MOCK'
#!/bin/sh
MOCK_DIR="${MOCK_STATE_DIR:-/tmp/specter_test_state}"
LOGS_DIR="$MOCK_DIR/logs"
echo "AM $*" >> "$LOGS_DIR/am.log"
MOCK
  chmod +x "$_dir/am"

  # --- pgrep ---
  cat > "$_dir/pgrep" << 'MOCK'
#!/bin/sh
echo "1234"
MOCK
  chmod +x "$_dir/pgrep"

  # --- toybox ---
  cat > "$_dir/toybox" << 'MOCK'
#!/bin/sh
if [ "$1" = "cat" ] && echo "$2" | grep -q "enforce"; then
  echo "1"
else
  cat "$2"
fi
MOCK
  chmod +x "$_dir/toybox"

  # --- find ---
  cat > "$_dir/find" << 'MOCK'
#!/bin/sh
MOCK_DIR="${MOCK_STATE_DIR:-/tmp/specter_test_state}"
LOGS_DIR="$MOCK_DIR/logs"
echo "FIND $*" >> "$LOGS_DIR/find.log"

# Pattern: find X -name install-recovery.sh
if echo "$*" | grep -q "install-recovery.sh"; then
  [ -f "$MOCK_DIR/fake_recovery" ] && echo "$MOCK_DIR/fake_recovery"
fi
MOCK
  chmod +x "$_dir/find"

  # --- sha256sum ---
  cat > "$_dir/sha256sum" << 'MOCK'
#!/bin/sh
if [ -n "$1" ]; then
  echo "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef  $1"
else
  echo "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  -"
fi
MOCK
  chmod +x "$_dir/sha256sum"

  # --- dd ---
  cat > "$_dir/dd" << 'MOCK'
#!/bin/sh
echo "mock dd output"
MOCK
  chmod +x "$_dir/dd"

  # --- blockdev ---
  cat > "$_dir/blockdev" << 'MOCK'
#!/bin/sh
echo "4096"
MOCK
  chmod +x "$_dir/blockdev"

  # --- od ---
  cat > "$_dir/od" << 'MOCK'
#!/bin/sh
echo "0000000 0000 0000"
MOCK
  chmod +x "$_dir/od"

  # --- kill ---
  cat > "$_dir/kill" << 'MOCK'
#!/bin/sh
exit 0
MOCK
  chmod +x "$_dir/kill"

  # --- command --- (tricky - it's a shell built-in, but we mock it)
  cat > "$_dir/command" << 'MOCK'
#!/bin/sh
case "$*" in
  -v*)
    case "$2" in
      resetprop|pm|am|settings) echo "$2" ;;
      magiskboot|curl|wget|bc|cmd) exit 1 ;;
      *) exit 1 ;;
    esac
    ;;
  *) exec "$@" ;;
esac
MOCK
  chmod +x "$_dir/command"

  unset _dir
}

# Source the real module libraries (bypass common.sh shim for MODDIR-independent sourcing)
source_libs() {
  PATH="$BIN_DIR:/usr/bin:/bin"
  . "$REPO_ROOT/src/lib/log.sh" 2>/dev/null
  . "$REPO_ROOT/src/lib/util.sh" 2>/dev/null
  . "$REPO_ROOT/src/lib/network.sh" 2>/dev/null
  . "$REPO_ROOT/src/lib/detect.sh" 2>/dev/null
  . "$REPO_ROOT/src/lib/props.sh" 2>/dev/null
  . "$REPO_ROOT/src/lib/keybox.sh" 2>/dev/null
  . "$REPO_ROOT/src/lib/conflicts.sh" 2>/dev/null
  . "$REPO_ROOT/src/lib/paths.sh" 2>/dev/null
  . "$REPO_ROOT/src/lib/config_env.sh" 2>/dev/null
  . "$REPO_ROOT/src/lib/package_list.sh" 2>/dev/null
  # Override paths that libs hardcoded to point at real system paths
  SPECTER_DIR="$TEST_ROOT/specter"
  GMS_PROPS_FILE="$TEST_ROOT/gms_certified_props.json"
  PERSIST_RESTORE_FILE="$SPECTER_DIR/persist_backup.txt"
  CONFLICT_BACKUP_FILE="$SPECTER_DIR/conflict_backups.txt"
  VBMETA_DIGEST="$SPECTER_DIR/vbmeta_digest"
  TEE_STATUS="$SPECTER_DIR/tee_status"
  TEE_BHASH="$SPECTER_DIR/tee_hash"
}

# Run a feature script in a clean subshell with mocks
run_feature() {
  _feature="$1"
  shift
  PATH="$BIN_DIR:/usr/bin:/bin" \
  MODDIR="$TEST_ROOT" \
  SPECTER_DIR="$SPECTER_DIR" \
  CONFIG_DIR="$CONFIG_DIR" \
  TRICKY_DIR="$TRICKY_DIR" \
  MOCK_STATE_DIR="$MOCK_DIR" \
  sh "$REPO_ROOT/src/features/$_feature" 2>&1; _rc=$?
  return $_rc
}

# Source a feature script directly (so its functions are available, but careful with set -e)
source_feature() {
  _feature="$1"
  PATH="$BIN_DIR:/usr/bin:/bin" \
  MODDIR="$TEST_ROOT" \
  SPECTER_DIR="$SPECTER_DIR" \
  CONFIG_DIR="$CONFIG_DIR" \
  MOCK_STATE_DIR="$MOCK_DIR" \
  . "$REPO_ROOT/src/features/$_feature" 2>/dev/null || true
}

# Set a config toggle
set_cfg() { printf '%s' "$2" > "$CONFIG_DIR/$1.val"; }

# Set a mock prop
set_prop() { printf '%s' "$2" > "$PROPS_DIR/$1"; }

# Get last N lines from a mock log
get_log() { _log="$1" _n="${2:-999}"; [ -f "$LOGS_DIR/$_log" ] && tail -"$_n" "$LOGS_DIR/$_log"; return 0; }

# Check if a prop was set (value not empty)
prop_was_set() { [ -f "$PROPS_DIR/$1" ] && [ -n "$(cat "$PROPS_DIR/$1")" ]; }

# Get the value of a set prop
prop_value() { [ -f "$PROPS_DIR/$1" ] && cat "$PROPS_DIR/$1" || echo ""; }

# Check if a log entry exists
log_contains() { _log="$1" _pattern="$2"; [ -f "$LOGS_DIR/$_log" ] && grep -q "$_pattern" "$LOGS_DIR/$_log"; }
