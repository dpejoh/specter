#!/system/bin/sh
MODULE_ROOT="${0%/*}"
MODULE_ROOT="${MODULE_ROOT%/webroot/common}"
MODDIR="$MODULE_ROOT"
: "${MODDIR}"
. "$MODULE_ROOT/lib/constants.sh"
. "$MODULE_ROOT/lib/common.sh"

_cmd="$1"

case "$_cmd" in
  ""|status)
    conflict_status_json
    ;;
  set)
    _key="$2"
    _choice="$3"
    if [ -z "$_key" ] || [ -z "$_choice" ]; then
      echo "Missing args" >&2
      exit 1
    fi
    if ! conflict_set_choice "$_key" "$_choice"; then
      echo "Invalid module or choice" >&2
      exit 1
    fi
    ;;
  resolve_feature)
    _rf_feature="$2"
    if [ -z "$_rf_feature" ]; then
      echo "Missing feature name" >&2
      exit 1
    fi
    conflict_resolve_for_feature "$_rf_feature"
    ;;
  *)
    echo "Usage: conflicts.sh status | conflicts.sh set <module> <priority_specter|priority_module> | conflicts.sh resolve_feature <feature>" >&2
    exit 1
    ;;
esac
