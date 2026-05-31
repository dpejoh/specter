#!/system/bin/sh
set -e
MODDIR=${0%/*}
. "$MODDIR/../lib/common.sh"
. "$MODDIR/../lib/paths.sh"
. "$MODDIR/../lib/package_list.sh"
. "$MODDIR/../lib/config_env.sh"

[ "$(cfg_get toggle_prop_handler 1)" = "0" ] && exit 0

_boot_state=$(cfg_get boot_state_props 1)
_spoof_build=$(cfg_get spoof_build_props 1)
_sp=$(cfg_get suspicious_props 1)

[ "$_boot_state$_spoof_build$_sp" = "000" ] && exit 0

if [ "$_boot_state" != "0" ]; then
  log "PROPS" "Applying boot state props"
  apply_boot_props
fi

if [ "$_spoof_build" != "0" ]; then
  log "PROPS" "Spoofing build props"
  spoof_build_props
fi

if [ "$_sp" != "0" ]; then
  log "PROPS" "Cleaning suspicious props"
  _found_count=0
  _critical_count=0

  _old_ifs="$IFS"; IFS="$(printf '\n')"
  for _entry in $SUSPICIOUS_PROPS; do
    _prop=$(echo "$_entry" | cut -d'|' -f1)
    _severity=$(echo "$_entry" | cut -d'|' -f2)

    _value=$(resetprop "$_prop" 2>/dev/null || echo "")
    if [ -n "$_value" ]; then
      _found_count=$((_found_count + 1))
      [ "$_severity" = "critical" ] && _critical_count=$((_critical_count + 1))
      case "$_severity" in
        critical) echo "[CRITICAL] $_prop = $_value" ;;
        warning)  echo "[WARNING] $_prop = $_value" ;;
      esac
      echo "restore|$_prop|$_value" >> "$SPECTER_DIR/slain_props.prop" 2>/dev/null || true
      hexpatch_deleteprop "$_prop"
    fi
  done
  IFS="$_old_ifs"; unset _old_ifs

  if [ "$_found_count" -gt 0 ]; then
    log "PROPS" "Found $_found_count suspicious props ($_critical_count critical)"
  fi

  unset _prop _severity _value _found_count _critical_count _entry
fi

log "PROPS" "Done"
