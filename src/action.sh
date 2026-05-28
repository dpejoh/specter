#!/system/bin/sh
# shellcheck shell=sh
MODDIR=${0%/*}

# only BusyBox ash supports 'standalone' option
# shellcheck disable=SC3040
case "$(readlink /proc/$$/exe 2>/dev/null)" in
  *busybox) set +o standalone; unset ASH_STANDALONE ;;
esac

. "$MODDIR/lib/common.sh"
. "$MODDIR/lib/paths.sh"
. "$MODDIR/lib/config_env.sh"

_action_feature_enabled() {
  key="$1" default="${2:-1}"
  [ "$(cfg_get "$key" "$default")" != "0" ]
}

log "ACTION" "Running full integrity pipeline"

_action_feature_enabled toggle_action_gms && sh "$MODDIR/features/kill_play_store.sh" 2>/dev/null || true
_action_feature_enabled toggle_action_target && sh "$MODDIR/features/target_merge.sh" 2>/dev/null || true
_action_feature_enabled toggle_action_security_patch && sh "$MODDIR/features/security_patch.sh" 2>/dev/null || true
_action_feature_enabled toggle_action_keybox && sh "$MODDIR/features/keybox.sh" 2>/dev/null || true
_action_feature_enabled toggle_action_pif 0 && sh "$MODDIR/features/pif.sh" 2>/dev/null || true

run_device_info "$MODDIR"
sh "$MODDIR/features/keybox_info.sh" >/dev/null 2>&1 || true

# Refresh module description for manager apps
[ -f "$MODDIR/module.prop.bak" ] && cp "$MODDIR/module.prop.bak" "$MODDIR/module.prop"
. "$MODDIR/lib/desc.sh"
refresh_module_description

log "ACTION" "Full integrity pipeline completed"

[ "${0##*/}" = "action.sh" ] && exit 0 || return 0
