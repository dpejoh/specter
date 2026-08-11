#!/system/bin/sh
set -e
MODDIR=${0%/*}
. "$MODDIR/../lib/common.sh"
. "$MODDIR/../lib/constants.sh"

detect_keystore_manager
[ "$KSM" = "teesim" ] || die "teesim_mode.sh requires JingMatrix TEESimulator (teesim)"

case "${1:-}" in
  --get)
    ksm_get_mode
    exit 0
    ;;
  --set)
    case "${2:-}" in
      patch|generation) ;;
      *) die "teesim_mode.sh --set requires patch or generation" ;;
    esac
    ksm_available || die "No TEESimulator data directory found"
    ksm_set_mode "$2" || die "Failed to set mode"
    log_i "TEESIM_MODE" "Profile mode set to $2"
    exit 0
    ;;
  *)
    die "teesim_mode.sh --get | --set patch|generation"
    ;;
esac
