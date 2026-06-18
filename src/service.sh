#!/system/bin/sh
set -e
MODDIR=${0%/*}
. "$MODDIR/lib/common.sh"
. "$MODDIR/lib/package_list.sh"
. "$MODDIR/lib/config_env.sh"
export ROOT_SOL

while [ "$(getprop sys.boot_completed)" != "1" ]; do sleep 2; done

BOOT_LOG="$SPECTER_DIR/log/boot.log"
mkdir -p "$SPECTER_DIR/log" 2>/dev/null || true
log_rotate "$BOOT_LOG"
exec >>"$BOOT_LOG" 2>&1

log "SERVICE" "Running Specter boot tasks"

for _bf in boot_hardening adb_disabler rom_fingerprint vbmeta; do
  case "$_bf" in *[!a-zA-Z0-9_-]*) log "SERVICE" "Skipping invalid feature: $_bf"; continue ;; esac
  _bf_default=1
  case "$_bf" in adb_disabler|rom_fingerprint) _bf_default=0 ;; esac
  _feature_should_run "$_bf" $_bf_default || { log "SERVICE" "Skipping $_bf (disabled by config)"; continue; }
  sh "$MODDIR/features/$_bf.sh" >"$SPECTER_DIR/log/boot_${_bf}.log" 2>&1 || log "SERVICE" "$_bf failed (exit $?)"
done
unset _bf _bf_default

if _feature_should_run "prop_handler"; then
  [ "$(cfg_get boot_state_props 1)" != "0" ] && ! _conflict_claimed "boot_state_props" && apply_boot_props
  [ "$(cfg_get spoof_build_props 1)" != "0" ] && ! _conflict_claimed "spoof_build_props" && spoof_build_props
  [ "$(cfg_get region_props 1)" != "0" ] && ! _conflict_claimed "region_props" && apply_region_props
  sh "$MODDIR/features/boot_state_props.sh" >"$SPECTER_DIR/log/boot_state_props.log" 2>&1
else
  log "SERVICE" "Skipping prop_handler (disabled by config)"
fi

log "SERVICE" "Boot-time features done"

sh "$MODDIR/features/tee.sh" >"$SPECTER_DIR/log/boot_tee.log" 2>&1 || true

[ -f "$SPECTER_DIR/rom_spoof_reported" ] && {
  sh "$MODDIR/features/rom_spoof_cleanup.sh" >/dev/null 2>&1 || true
  rm -f "$SPECTER_DIR/rom_spoof_reported"
}

ensure_dir "$SPECTER_DIR/backup" 2>/dev/null || true
if [ -f "$MODDIR/.first_boot_pending" ]; then
  log "SERVICE" "First-boot setup pending, running..."
  sh "$MODDIR/features/first_boot_setup.sh" >"$SPECTER_DIR/log/first_boot_setup.log" 2>&1 || log "SERVICE" "First-boot setup failed"
  rm -f "$MODDIR/.first_boot_pending"
  log "SERVICE" "First-boot setup complete"
fi

. "$MODDIR/lib/desc.sh"
refresh_module_description

[ "$(cfg_get toggle_scheduler 1)" != "0" ] && {
  sh "$MODDIR/lib/scheduler.sh" >"$SPECTER_DIR/log/scheduler.log" 2>&1 &
  log "SERVICE" "Scheduler launched (PID $!)"
}

# Delayed TEE check — runs after phone is fully on so PM is available
(
  sleep 60
  [ -f "$SPECTER_DIR/tee_reported" ] || exit 0

  _pkg="com.dpejoh.specter"
  _apk="$MODDIR/apk/specter.apk"
  . "$MODDIR/lib/vbmeta.sh"

  # Query TEE status
  for _i in 1 2 3 4 5; do
    _t=$(content query --uri content://$_pkg/check 2>/dev/null \
      | grep -o 'status=[a-z]*' | cut -d= -f2) || true
    [ -n "$_t" ] && break
    sleep 0.5
  done

  # Query TEE hash
  _h=$(content query --uri content://$_pkg/hash 2>/dev/null \
    | grep -oE '[a-f0-9]{64}|unavailable') || true
  [ "$_h" = "0000000000000000000000000000000000000000000000000000000000000000" ] && _h="unavailable"
  unset _i

  # Cache results
  case "$_t" in
    normal) echo "tee_broken=false" > "$TEE_STATUS"; log "TEE" "Status: normal" ;;
    broken) echo "tee_broken=true"  > "$TEE_STATUS"; log "TEE" "Status: broken" ;;
    *)      echo "tee_broken=unknown" > "$TEE_STATUS"; log "TEE" "Status: unavailable ($_t)" ;;
  esac
  unset _t

  if [ "$_h" != "unavailable" ] && [ -n "$_h" ]; then
    echo "$_h" > "$TEE_HASH"
    [ -z "$(cfg_get custom_boot_hash "")" ] && echo "$_h" > "$VBMETA_DIGEST"
    log "TEE" "Hash: $_h (tee)"
  else
    _slot=$(getprop ro.boot.slot_suffix 2>/dev/null || echo "")
    _dev="/dev/block/by-name/vbmeta${_slot}"
    [ -b "$_dev" ] || _dev="/dev/block/by-name/vbmeta"
    _ph=$(vbmeta_digest "$_dev" || true)
    unset _slot _dev
    if [ -n "$_ph" ]; then
      echo "$_ph" > "$TEE_HASH"
      [ -z "$(cfg_get custom_boot_hash "")" ] && echo "$_ph" > "$VBMETA_DIGEST"
      echo "tee_fallback=true" >> "$TEE_STATUS"
      log "TEE" "Hash: $_ph (fallback)"
    else
      log "TEE" "Hash: unavailable"
    fi
    unset _ph
  fi
  unset _h

  # Uninstall APK and clean up
  pm uninstall "$_pkg" >/dev/null 2>&1 || true
  rm -f "$SPECTER_DIR/tee_reported" "$_apk"
  log "TEE" "Done"
  unset _pkg _apk
) &

log "SERVICE" "Specter boot tasks complete"
