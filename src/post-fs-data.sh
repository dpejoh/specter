#!/system/bin/sh
set -e
MODDIR=${0%/*}

. "$MODDIR/lib/common.sh"

detect_root_solution
export ROOT_SOL
log_d "POSTFS" "detected $ROOT_TYPE ($ROOT_SOL), resolving conflicts"
resolve_conflicts
log_d "POSTFS" "conflicts resolved"
