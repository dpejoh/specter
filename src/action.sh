#!/system/bin/sh
set -e
MODDIR=${0%/*}

# shellcheck disable=SC3040
case "$(readlink /proc/$$/exe 2>/dev/null)" in *busybox) set +o standalone; unset ASH_STANDALONE ;; esac

. "$MODDIR/lib/common.sh"

ACTION_LOG="$SPECTER_DIR/log/action.log"
ensure_dir "$SPECTER_DIR/log" 2>/dev/null
log_rotate "$ACTION_LOG"

_pif_validate_fingerprint() {
  for _f in "$SPECTER_DIR/pif.prop" "$PIF_DIR/custom.pif.prop" /data/adb/pif.prop "$PIF_DIR/pif.prop" "$PIF_DIR/custom.pif.json" "$PIF_DIR/pif.json"; do
    [ -f "$_f" ] || continue
    _fp=""
    case "$_f" in
      *.json) _fp=$(grep -o '"FINGERPRINT"[[:space:]]*:[[:space:]]*"[^"]*"' "$_f" 2>/dev/null | head -1 | sed 's/.*"FINGERPRINT"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/') ;;
      *) _fp=$(sed -n 's/^FINGERPRINT=//p' "$_f" 2>/dev/null | head -1) ;;
    esac
    [ -z "$_fp" ] && continue
    case "$_fp" in *google*/*release-keys*) unset _f _fp; return 0 ;; esac
  done
  unset _f _fp; return 1
}

_first_boot=0
[ "$SPECTER_FIRST_BOOT" = "1" ] && _first_boot=1
[ -f "$SPECTER_DIR/.first_boot_pending" ] && _first_boot=1
_force_target=$(cfg_get toggle_action_force_target 0)
_force_hma=$(cfg_get toggle_action_force_hma 0)
_force_keybox=$(cfg_get toggle_action_force_keybox 0)

# The action is intentionally non-interactive. Volume-key prompts blocked the
# WebUI for 10/7 seconds; setup choices live in the WebUI settings instead.
{
  log_i "ACTION" "Running full integrity pipeline"

  _feature_should_run "gms" && {
    log_u "ACTION" ""
    log_u "ACTION" "-> Play Store:"
    if [ "$_first_boot" = "1" ]; then
      log_i "ACTION" "First boot, skipping Play Store data clear"
    else
      sh "$MODDIR/features/kill_play_store.sh" || true
    fi
  }

  if _feature_should_run "target"; then
    log_u "ACTION" ""
    log_u "ACTION" "-> App Targeting:"
    if [ "$_first_boot" = "1" ] || [ "$_force_target" = "1" ] || [ "$(cfg_get toggle_auto_target 1)" != "1" ]; then
      sh "$MODDIR/features/target.sh" --merge || true
    else
      log_i "ACTION" "Auto-targeting is enabled, skipping target generation"
    fi
  fi

  _feature_should_run "security_patch" && {
    log_u "ACTION" ""
    log_u "ACTION" "-> Security Patch:"
    SPECTER_FIRST_BOOT=$_first_boot sh "$MODDIR/features/security_patch.sh" || true
  }

  _feature_should_run "keybox" && {
    log_u "ACTION" ""
    log_u "ACTION" "-> Keybox:"
    if [ "$_force_keybox" = "1" ]; then
      log_i "ACTION" "Always install keybox enabled, bypassing healthy check"
      sh "$MODDIR/features/keybox.sh" || true
    else
      sh "$MODDIR/features/keybox.sh" --if-needed || true
    fi
  }

  if _feature_should_run "pif"; then
    log_u "ACTION" ""
    log_u "ACTION" "-> Play Integrity Fix:"
    _pif_name=$(_pif_prop) || _pif_name=""
    if [ -z "$_pif_name" ]; then
      if [ "$_first_boot" = "1" ]; then
        log_i "ACTION" "PIF not found, first boot suppress"
      else
        log_w "ACTION" "PIF not installed, skipping fingerprint update"
      fi
      _pif_skip=1
    elif [ "$_first_boot" = "1" ]; then
      log_u "ACTION" ""
      log_u "ACTION" "PIF found, first boot - checking existing fingerprint validity"
      if _pif_validate_fingerprint; then
        log_i "ACTION" "Existing fingerprint valid, skipping fetch"
      else
        log_i "ACTION" "Fingerprint invalid or missing, fetching new"
        sh "$MODDIR/features/pif.sh" || true
      fi
      _pif_skip=1
    fi
    unset _pif_name
    if [ -z "$_pif_skip" ] && [ -f "$MODDIR/features/pif.sh" ]; then
      sh "$MODDIR/features/pif.sh" || true
    fi
  fi

  if _feature_should_run "hma" 0; then
    log_u "ACTION" ""
    log_u "ACTION" "-> HMA-OSS Config:"
    _hma_config_ok=0
    for _hma_config in "$HMAOSS_BASE"/hide_my_applist*/config.json; do
      [ -s "$_hma_config" ] && { _hma_config_ok=1; break; }
    done
    if [ "$_first_boot" = "1" ] || [ "$_force_hma" = "1" ] || [ "$_hma_config_ok" != "1" ] || [ "$(cfg_get toggle_auto_hma 0)" != "1" ]; then
      [ "$_hma_config_ok" != "1" ] && log_w "ACTION" "HMA config missing, regenerating"
      sh "$MODDIR/features/hma.sh" || true
      log_u "ACTION" "HMA-OSS configuration complete"
    else
      log_i "ACTION" "Auto-HMA is enabled, skipping HMA generation"
    fi
    unset _hma_config _hma_config_ok
  fi
  unset _force_target _force_hma _force_keybox

  run_device_info "$MODDIR"
  sh "$MODDIR/features/keybox_info.sh" --if-needed >/dev/null 2>&1 || true
  sh "$MODDIR/features/keystore_info.sh" >/dev/null 2>&1 || true
  sh "$MODDIR/features/modules_state.sh" >/dev/null 2>&1 || true
  write_webui_state
  # Build the setup snapshot in a detached background process; the WebUI
  # serves the previous copy immediately and replaces it when this finishes.
  if command -v setsid >/dev/null 2>&1; then
    setsid sh "$MODDIR/features/setup_info.sh" >/dev/null 2>&1 &
  else
    sh "$MODDIR/features/setup_info.sh" >/dev/null 2>&1 &
  fi

  [ -f "$MODDIR/module.prop.bak" ] && cp "$MODDIR/module.prop.bak" "$MODDIR/module.prop"
  . "$MODDIR/lib/desc.sh"
  refresh_module_description

  log_u "ACTION" ""
  log_i "ACTION" "Full integrity pipeline completed"
} 2>&1 | tee -a "$ACTION_LOG"

if [ "$_first_boot" = "0" ]; then
  printf '{"script":"action.sh","output":"Full integrity pipeline completed","time":"%s","code":0}\n' "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)" >> "$SPECTER_DIR/log/history.jsonl"
fi

echo "Action has ended, please exit"
exit 0
