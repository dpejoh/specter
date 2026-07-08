# shellcheck shell=sh
# Move a staged update into the live dir and re-apply without a reboot.

specter_hot_install() {
  # KernelSU family only; the live-move trick relies on ksu mount internals.
  [ "$ROOT_SOL" = "kernelsu" ] || return 0

  _hi_modid="$(basename "${MODPATH:-}")"
  [ -n "$_hi_modid" ] || return 0
  _hi_live="$MODULES_BASE/$_hi_modid"
  _hi_stage="${MODULES_BASE}_update/$_hi_modid"

  # Updates only; first install still needs a reboot.
  [ -d "$_hi_live" ] || return 0
  [ -d "$_hi_stage" ] || return 0

  ui_print "- Hot install requested ($ROOT_TYPE)"

  rm -rf "$_hi_live"
  mv "$_hi_stage" "$_hi_live"

  # Clear the token so the next reboot won't re-run first_boot_setup over this.
  rm -f "$SPECTER_DIR/.first_boot_pending" 2>/dev/null || true

  _specter_hot_done=1

  ui_print "- Applying update (TEE refresh + scheduler + integrity pipeline)..."
  rm -f "$SPECTER_DIR/.hotinstall_failed"
  sh "$_hi_live/hotinstall.sh" 2>&1 | while IFS= read -r _hiline; do
    [ -n "$_hiline" ] && ui_print "    $_hiline"
  done
  if [ -f "$SPECTER_DIR/.hotinstall_failed" ]; then
    rm -f "$SPECTER_DIR/.hotinstall_failed"
    _hi_apply_failed=1
  fi
  unset _hiline

  # Recreate a stub module.prop so ksu bookkeeping finds it, then clean up later.
  _hi_delay="${SPECTER_HOT_CLEANUP_DELAY:-3}"
  mkdir -p "$_hi_stage"
  cp "$_hi_live/module.prop" "$_hi_stage/module.prop" 2>/dev/null || true
  ( sleep "$_hi_delay"; rm -rf "$_hi_live/update" 2>/dev/null; rm -rf "$_hi_stage" 2>/dev/null ) &

  ui_print "- Refresh module page after installation"
  if [ "${_hi_apply_failed:-0}" = "1" ]; then
    ui_print "- WARNING: live-apply failed; run action.sh from WebUI or reboot"
  else
    ui_print "- No need to reboot"
  fi

  unset _hi_modid _hi_live _hi_stage _hi_apply_failed _hi_delay
}
