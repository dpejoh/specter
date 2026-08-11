#!/system/bin/sh
set -e
MODDIR=${0%/*}
. "$MODDIR/../lib/common.sh"
. "$MODDIR/../lib/constants.sh"

[ "$(cfg_get toggle_rom_fingerprint 1)" = "0" ] && exit 0
[ "$(cfg_get toggle_custom_rom_props 1)" = "0" ] && exit 0

log_i "CROM_PROPS" "Cleaning custom ROM props"

_crom="lineage|infinity|evolution|crdroid|arrow|mistos|axion|pixelos|rising|lunaris|halcyon|havoc|alphadroid|avium|bliss|calyx|derpfest|graphene|lmodroid|lumine|matrixx|superior|clover|yaap"
_cleaned=0

_props=$(resetprop 2>/dev/null | grep -iE "$_crom" | cut -d'[' -f2 | cut -d']' -f1 || true)
for _prop in $_props; do
  [ -z "$_prop" ] && continue
  resetprop --delete "$_prop" 2>/dev/null || true
  _cleaned=$((_cleaned + 1))
done
unset _prop _props

_rm=$(resetprop ro.modversion 2>/dev/null || echo "")
resetprop --delete "ro.modversion" 2>/dev/null || true
[ -n "$_rm" ] && _cleaned=$((_cleaned + 1))
unset _rm

if [ "$_cleaned" -gt 0 ]; then
  log_i "CROM_PROPS" "Cleaned $_cleaned custom ROM props"
else
  log_i "CROM_PROPS" "No custom ROM props found"
fi
unset _cleaned _crom
