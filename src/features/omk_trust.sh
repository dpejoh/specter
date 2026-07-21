#!/system/bin/sh
set -e
MODDIR=${0%/*}
. "$MODDIR/../lib/common.sh"
. "$MODDIR/../lib/constants.sh"

detect_keystore_manager
[ "$KSM" = "omk" ] || die "OhMyKeymint is not active"

case "${1:-}" in
  --list)
    for _key in os_version security_patch vb_key vb_hash; do
      printf '%s=' "$_key"
      ksm_get_trust_field "$_key"
    done
    unset _key
    exit 0
    ;;
  --get)
    [ -n "${2:-}" ] || die "omk_trust.sh --get requires a key (os_version|vb_key)"
    ksm_get_trust_field "$2"
    exit 0
    ;;
  --set)
    [ -n "${2:-}" ] || die "omk_trust.sh --set requires key=value arguments"
    shift
    for _kv in "$@"; do
      _key="${_kv%%=*}"
      _val="${_kv#*=}"
      [ -n "$_key" ] || continue
      ksm_set_trust_field "$_key" "$_val" || die "Failed to set $_key"
      log_i "OMK_TRUST" "Set $_key = $_val"
    done
    unset _kv _key _val
    exit 0
    ;;
  *)
    die "Usage: omk_trust.sh --list|--get <key>|--set <key>=<value> [...]"
    ;;
esac
