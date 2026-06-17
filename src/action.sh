#!/system/bin/sh
# shellcheck shell=bash
MODDIR=${0%/*}

case "$(readlink /proc/$$/exe 2>/dev/null)" in
  *busybox) set +o standalone; unset ASH_STANDALONE ;;
esac

. "$MODDIR/lib/common.sh"
. "$MODDIR/lib/config_env.sh"

ACTION_LOG="$SPECTER_DIR/log/action.log"
ensure_dir "$SPECTER_DIR/log" 2>/dev/null
log_rotate "$ACTION_LOG"

{
  log "ACTION" "Running full integrity pipeline"

  [ "$(cfg_get toggle_action_gms 1)" != "0" ] && sh "$MODDIR/features/kill_play_store.sh" || true
  [ "$(cfg_get toggle_action_target 1)" != "0" ] && sh "$MODDIR/features/target.sh" --merge || true
  [ "$(cfg_get toggle_action_security_patch 1)" != "0" ] && sh "$MODDIR/features/security_patch.sh" || true
  [ "$(cfg_get toggle_action_keybox 1)" != "0" ] && sh "$MODDIR/features/keybox.sh" || true
  [ "$(cfg_get toggle_action_pif 1)" != "0" ] && [ -f "$MODDIR/features/pif.sh" ] && sh "$MODDIR/features/pif.sh" || true

  run_device_info "$MODDIR"
  sh "$MODDIR/features/keybox_info.sh" >/dev/null 2>&1 || true

  [ -f "$MODDIR/module.prop.bak" ] && cp "$MODDIR/module.prop.bak" "$MODDIR/module.prop"
  . "$MODDIR/lib/desc.sh"
  refresh_module_description

  log "ACTION" "Full integrity pipeline completed"
} 2>&1 | tee -a "$ACTION_LOG"

[ "${0##*/}" = "action.sh" ] && exit 0 || return 0
