# Unified boot logic for both Magisk (via service.sh) and KSU/APatch (via boot-completed.sh).
# Sourced after sys.boot_completed=1 and basic common libs are loaded.
# Single source of truth for all boot-time features — no more platform fork drift.

[ -n "$MODDIR" ] || { echo "[BOOT] MODDIR not set" >&2; exit 1; }
# Requires: caller has sourced common.sh, paths.sh, config_env.sh and called detect_root_solution

log "BOOT" "Running unified boot core"

# Boot props (idempotent — safe to re-apply if service.sh already did)
apply_boot_props

# Protect SELinux policy files
if [ "$(toybox cat /sys/fs/selinux/enforce 2>/dev/null)" = "0" ]; then
  chmod 640 /sys/fs/selinux/enforce 2>/dev/null || true
  chmod 440 /sys/fs/selinux/policy 2>/dev/null || true
fi

# Boot-time features — single authoritative list, all dispatched as scripts
for _bf in recovery boot_hardening security_patch suspicious_props rom_spoof bootloader_spoofer lsposed; do
  case "$_bf" in *[!a-zA-Z0-9_-]*) log "BOOT" "Skipping invalid feature: $_bf"; continue ;; esac
  _feature_should_run "$_bf" || continue
  if [ "$_bf" = "rom_spoof" ]; then
    ( sh "$MODDIR/features/rom_spoof.sh" >/dev/null 2>&1 ) &
  else
    sh "$MODDIR/features/$_bf.sh" >/dev/null 2>&1 || true
  fi
done
unset _bf
log "BOOT" "Boot-time features done"

# Module description — rich status line

if [ ! -d "/data/adb/modules/tricky_store" ] && [ ! -d "/data/adb/modules_update/tricky_store" ]; then
  cfg_set "override.description" "🚨 Tricky Store not installed"

else
  _cf=""
  while IFS='|' read -r _id _name _rem; do
    [ -z "$_id" ] && continue
    _conflict_detect "$_id" || continue
    _cf="$_name"
    break
  done <<CF_EOF
$(_conflict_registry)
CF_EOF

  if [ -n "$_cf" ]; then
    cfg_set "override.description" "🚨 Conflict: $_cf"
    unset _cf _id _name _rem
  else
    unset _cf _id _name _rem

    # Keybox dashboard
    _kb_src=$(grep -o '"source":"[^"]*"' "$MODDIR/webroot/json/keybox_info.json" 2>/dev/null | cut -d'"' -f4)
    _kb_ver=$(grep -o '"text":"[^"]*"' "$MODDIR/webroot/json/keybox_info.json" 2>/dev/null | cut -d'"' -f4)
    _kb_rev=$(grep -o '"revoked":true' "$MODDIR/webroot/json/keybox_info.json" 2>/dev/null)

    [ -z "$_kb_src" ] && _kb_src=$(cfg_get 'kb_provider' '')
    [ -z "$_kb_src" ] && [ "$(cfg_get 'kb_private' 'false')" = "true" ] && _kb_src="Private"

    _apps=$(wc -l < "$TARGET_TXT" 2>/dev/null || echo 0)
    _patch=$(grep '^boot=' "$SECURITY_PATCH_FILE" 2>/dev/null | cut -d= -f2) && [ -z "$_patch" ] && _patch="-"

    if [ -f "$LOCKED_FILE" ]; then
      cfg_set "override.description" "🎭 TEE Sim | $_apps apps | 🛡️ $_patch"
    elif [ -f "$TARGET_FILE" ]; then
      _title="$_kb_src${_kb_ver:+ $_kb_ver}"
      if [ -n "$_kb_rev" ]; then
        cfg_set "override.description" "🔑 $_title · ❌ | $_apps apps | 🛡️ $_patch"
      else
        cfg_set "override.description" "🔑 $_title · ✅ | $_apps apps | 🛡️ $_patch"
      fi
    else
      cfg_set "override.description" "❌ No keybox | $_apps apps | 🛡️ $_patch"
    fi
    unset _kb_src _kb_ver _kb_rev _apps _patch _title _status
  fi
fi

# Delayed spoofing — 120s delay to re-apply props that system may have overridden
(
  sleep 120
  log "BOOT" "Delayed spoofing — reapplying critical props"
  sp_try ro.crypto.state encrypted
  sp_try ro.build.tags release-keys
  hide_recovery_folders
) &

# Periodic suspicious props cleaning — re-run every hour
if [ "$(cfg_get toggle_suspicious_props 1)" != "0" ]; then
  (
    while true; do
      sleep 3600
      sh "$MODDIR/features/suspicious_props.sh" >/dev/null 2>&1 || true
    done
  ) &
fi

log "BOOT" "Unified boot core done"
