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

  _feature_should_run "target" && {
    log_u "ACTION" ""
    log_u "ACTION" "-> App Targeting:"
    sh "$MODDIR/features/target.sh" --merge || true
  }

  _feature_should_run "security_patch" && {
    log_u "ACTION" ""
    log_u "ACTION" "-> Security Patch:"
    sh "$MODDIR/features/security_patch.sh" || true
  }

  _feature_should_run "keybox" && {
    log_u "ACTION" ""
    log_u "ACTION" "-> Keybox:"
    sh "$MODDIR/features/keybox.sh" || true
  }

  if _feature_should_run "pif"; then
    log_u "ACTION" ""
    log_u "ACTION" "-> Play Integrity Fix:"
    _pif_name=$(_pif_prop) || _pif_name=""
    if [ -z "$_pif_name" ]; then
      if [ "$_first_boot" = "1" ]; then
        log_i "ACTION" "PIF not found, first boot suppress"
      elif [ -t 1 ]; then
        log_u "ACTION" ""
        log_u "ACTION" "PIF not found — Press Volume UP to install, DOWN to skip..."
        _ap_key=$(timeout 10 getevent -l 2>/dev/null | grep -oE "KEY_VOLUME(UP|DOWN)" | head -1)
        if [ "$_ap_key" = "KEY_VOLUMEUP" ]; then
          install_module_from_github "KOWX712/PlayIntegrityFix" "Play Integrity Fix" || \
            log_e "ACTION" "PIF install failed"
          echo "PIF installed — reboot before running autopif"
          _pif_installed=1
        else
          echo "PIF install skipped"
        fi
        unset _ap_key
      else
        log_w "ACTION" "PIF not found, auto-install skipped (run from terminal or install manually)"
      fi
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
    if [ -z "$_pif_installed" ] && [ -z "$_pif_skip" ] && [ -f "$MODDIR/features/pif.sh" ]; then
      sh "$MODDIR/features/pif.sh" || true
    fi
  fi

  run_device_info "$MODDIR"
  sh "$MODDIR/features/keybox_info.sh" >/dev/null 2>&1 || true
  sh "$MODDIR/features/keystore_info.sh" >/dev/null 2>&1 || true

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
