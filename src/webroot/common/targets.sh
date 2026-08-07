#!/system/bin/sh
# Target-list access for the WebUI, routed through the keystore abstraction so
# App Targeting hits injector.toml under OhMyKeymint and target.txt under
# Tricky Store instead of always writing target.txt.
MODULE_ROOT="${0%/*}"
MODULE_ROOT="${MODULE_ROOT%/webroot/common}"
MODDIR="$MODULE_ROOT"
: "${MODDIR}"
. "$MODULE_ROOT/lib/constants.sh"
. "$MODULE_ROOT/lib/common.sh"

detect_keystore_manager
[ -n "$KSM_TARGETS" ] || KSM_TARGETS="$TARGET_TXT"

_cmd="$1"

case "$_cmd" in
  ""|get)
    # Raw so per-app !/? suffixes survive on txt backends; [section] headers
    # are dropped because they are not packages and the UI would list them.
    ksm_read_targets_raw | grep -v '^[[:space:]]*\[' || true
    ;;
  set)
    _staging="$2"
    if [ -z "$_staging" ] || [ ! -f "$_staging" ]; then
      echo "Missing or unreadable staging file" >&2
      exit 1
    fi
    if ! ksm_commit_targets "$_staging"; then
      rm -f "$_staging"
      echo "Failed to commit target list" >&2
      exit 1
    fi
    rm -f "$_staging"
    ;;
  *)
    echo "Unknown command: $_cmd" >&2
    exit 1
    ;;
esac

exit 0
