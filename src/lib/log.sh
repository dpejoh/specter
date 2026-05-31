# shellcheck shell=sh
log() { echo "[$1] $2"; }

die() { log "ERROR" "$1"; exit 1; }
