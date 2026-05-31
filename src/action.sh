#!/system/bin/sh
# shellcheck shell=sh
MODDIR=${0%/*}

case "$(readlink /proc/$$/exe 2>/dev/null)" in
  *busybox) set +o standalone; unset ASH_STANDALONE ;;
esac

. "$MODDIR/lib/common.sh"
. "$MODDIR/lib/paths.sh"
. "$MODDIR/lib/config_env.sh"

log "ACTION" "Running full integrity pipeline"

sh "$MODDIR/orchestrator.sh" "action_integrity" || true

run_device_info "$MODDIR"
sh "$MODDIR/features/keybox_info.sh" >/dev/null 2>&1 || true

[ -f "$MODDIR/module.prop.bak" ] && cp "$MODDIR/module.prop.bak" "$MODDIR/module.prop"
. "$MODDIR/lib/desc.sh"
refresh_module_description

log "ACTION" "Full integrity pipeline completed"

[ "${0##*/}" = "action.sh" ] && exit 0 || return 0
