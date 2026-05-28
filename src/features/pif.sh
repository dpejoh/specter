#!/system/bin/sh
set -e
MODDIR=${0%/*}
. "$MODDIR/../lib/common.sh"
. "$MODDIR/../lib/config_env.sh"

log "PIF" "Start"

PIF_DIR="/data/adb/modules/playintegrityfix"

check_network || { log "PIF" "Error: No internet connection"; exit 1; }

if [ ! -d "$PIF_DIR" ] || [ ! -f "$PIF_DIR/module.prop" ]; then
  log "PIF" "Error: Play Integrity Fix not found at $PIF_DIR"
  exit 1
fi

# Detect variant by checking scripts on disk
if [ -f "$PIF_DIR/autopif_ota.sh" ]; then
  log "PIF" "Variant: Play Integrity Fix [INJECT]"
else
  log "PIF" "Variant: Play Integrity Fork"
fi

_pif_preflight() {
  for _ph in "https://developer.android.com/about/versions" "https://flash.android.com"; do
    _pd=$(echo "$_ph" | awk -F[/:] '{print $4}')
    if busybox wget -T 5 --no-check-certificate -qO /dev/null "$_ph" 2>/dev/null; then
      log "PIF" "Preflight: $_pd reachable via busybox wget"
    else
      log "PIF" "Preflight: $_pd UNREACHABLE via busybox wget"
      ping -c1 -W3 "$_pd" >/dev/null 2>&1 && log "PIF" "  but ping to $_pd works (v4 ICMP)"
      [ -f /proc/net/if_inet6 ] && log "PIF" "  IPv6 is enabled (possible v6 route issue)"
      command -v curl >/dev/null 2>&1 && log "PIF" "  curl IS available on this device" || log "PIF" "  curl NOT available — install curl to work around v6 issues"
    fi
    unset _pd
  done
  unset _ph
}
_pif_preflight

_ran=0

if [ -f "$PIF_DIR/autopif_ota.sh" ]; then
  log "PIF" "Running autopif_ota.sh..."
  sh "$PIF_DIR/autopif_ota.sh" && log "PIF" "autopif_ota.sh done" || log "PIF" "Warning: autopif_ota.sh failed"
  _ran=$((_ran + 1))
fi

if [ -f "$PIF_DIR/autopif.sh" ]; then
  log "PIF" "Running autopif.sh..."
  if sh "$PIF_DIR/autopif.sh"; then
    log "PIF" "autopif.sh done"
  else
    log "PIF" "Warning: autopif.sh failed"
    log "PIF" "  PIF's download() uses busybox wget which may fail on hosts with only IPv6"
    command -v curl >/dev/null 2>&1 || log "PIF" "  Install curl (or a busybox with working HTTPS) to resolve this"
  fi
  _ran=$((_ran + 1))
fi

if [ -f "$PIF_DIR/autopif4.sh" ]; then
  log "PIF" "Running autopif4.sh..."
  sh "$PIF_DIR/autopif4.sh" -m && log "PIF" "autopif4.sh done" || log "PIF" "Warning: autopif4.sh failed"
  _ran=$((_ran + 1))
fi

if [ "$_ran" -eq 0 ]; then
  log "PIF" "Error: No update scripts found in $PIF_DIR"
  exit 1
fi

unset _ran
log "PIF" "Finish"
exit 0
