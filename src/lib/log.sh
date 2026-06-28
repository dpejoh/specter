# shellcheck shell=sh

log_d() { [ "${SPECTER_LOG_LEVEL:-info}" = "debug" ] || return 0; printf '[%s] [D] [%s] %s\n' "$(date '+%T')" "$1" "$2"; }

log_u() { [ "${SPECTER_LOG_LEVEL:-info}" = "debug" ] && return 0 || echo "$2"; }

log_i() {
  if [ "${SPECTER_LOG_LEVEL:-info}" = "debug" ]; then
    printf '[%s] [I] [%s] %s\n' "$(date '+%T')" "$1" "$2"
  else
    echo "$2"
  fi
}

log_w() {
  if [ "${SPECTER_LOG_LEVEL:-info}" = "debug" ]; then
    printf '[%s] [W] [%s] %s\n' "$(date '+%T')" "$1" "$2"
  else
    echo "Warning: $2"
  fi
}

log_e() {
  if [ "${SPECTER_LOG_LEVEL:-info}" = "debug" ]; then
    printf '[%s] [E] [%s] %s\n' "$(date '+%T')" "$1" "$2" >&2
  else
    echo "Error: $2" >&2
  fi
}

log() { [ $# -eq 2 ] && log_i "$1" "$2"; }

die() {
  if [ "${SPECTER_LOG_LEVEL:-info}" = "debug" ]; then
    log_e "FATAL" "$1"; printf '[%s] [F] [FATAL] %s\n' "$(date '+%T')" "$1" >&2
  else
    echo "Fatal: $1" >&2
  fi
  exit 1
}

log_rotate() {
  _lr_path="$1" _lr_max="${2:-262144}" _lr_keep="${3:-3}"
  [ -f "$_lr_path" ] || return 0
  _lr_size=$(stat -c%s "$_lr_path" 2>/dev/null || echo "0")
  [ "$_lr_size" -lt "$_lr_max" ] 2>/dev/null && return 0
  if [ "${SPECTER_LOG_LEVEL:-info}" = "debug" ]; then
    _lr_i=$_lr_keep
    while [ "$_lr_i" -ge 1 ]; do
      [ -f "${_lr_path}.$((_lr_i - 1)).gz" ] && mv "${_lr_path}.$((_lr_i - 1)).gz" "${_lr_path}.$_lr_i.gz" 2>/dev/null || true
      [ -f "${_lr_path}.$((_lr_i - 1))" ] && mv "${_lr_path}.$((_lr_i - 1))" "${_lr_path}.$_lr_i" 2>/dev/null || true
      _lr_i=$((_lr_i - 1))
    done
    command -v gzip >/dev/null 2>&1 && gzip -f "$_lr_path" 2>/dev/null || true
  fi
  : > "$_lr_path"
}
