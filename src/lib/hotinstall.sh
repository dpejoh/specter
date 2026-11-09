# shellcheck shell=sh
# Make a freshly installed update live without a reboot.
#
# Every manager resolves a module's scripts, WebUI and config from the
# live dir by path, at use time; only mounted payload is bound to the
# boot-time state, so the gate below refuses hot install when the staged
# tree carries any. The live-apply (src/hotinstall.sh) is shared; what
# differs per manager is the swap and the install bookkeeping.

# Updates only (both dirs present; the staged dir exists solely for
# boot-mode installs), module not disabled or pending removal, and a
# userspace-only payload: no partition dirs, sepolicy, props or zygisk.
_specter_hot_gate() {
  [ -d "$1" ] && [ -d "$2" ] || return 1
  [ ! -e "$1/disable" ] && [ ! -e "$1/remove" ] || return 1
  for _hg_part in system vendor product system_ext sepolicy.rule system.prop zygisk; do
    [ ! -e "$2/$_hg_part" ] || return 1
  done
  unset _hg_part
  return 0
}

specter_hot_install() {
  _hi_modid="$(basename "${MODPATH:-}")"
  [ -n "$_hi_modid" ] || return 0
  _hi_live="$MODULES_BASE/$_hi_modid"
  _hi_stage="${MODULES_BASE}_update/$_hi_modid"

  if ! _specter_hot_gate "$_hi_live" "$_hi_stage"; then
    unset _hi_modid _hi_live _hi_stage
    return 0
  fi

  # Delegate when a consumer for the request exists, and let it own the
  # swap: ksud itself when it has native hot install, or a metamodule
  # that performs the swap after the install script (mountify exports
  # MOUNTIFY_HAS_HOT_INSTALL into the install shell on KernelSU and
  # APatch). The manual swap below is the last resort, for installs
  # with neither. The run script is a launcher: ksud bounds it to 30s,
  # the live-apply does not fit in that window.
  _hi_delegate=0
  case "$ROOT_SOL" in
    kernelsu)
      [ "${KSU_HAS_HOT_INSTALL:-}" = "true" ] && _hi_delegate=1
      [ "${MOUNTIFY_HAS_HOT_INSTALL:-}" = "true" ] && _hi_delegate=1
      ;;
    apatch)
      [ "${MOUNTIFY_HAS_HOT_INSTALL:-}" = "true" ] && _hi_delegate=1
      ;;
  esac
  if [ "$_hi_delegate" = "1" ]; then
    # Read by the installer's shell after customize.sh returns.
    # shellcheck disable=SC2034
    MODULE_HOT_INSTALL_REQUEST=true
    # shellcheck disable=SC2034
    MODULE_HOT_RUN_SCRIPT="hotinstall-launcher.sh"
    rm -f "$SPECTER_DIR/.first_boot_pending" 2>/dev/null || true
    _specter_hot_done=1
    ui_print "- Hot install requested ($ROOT_TYPE)"
    unset _hi_modid _hi_live _hi_stage _hi_delegate
    return 0
  fi
  unset _hi_delegate

  case "$ROOT_SOL" in
    kernelsu|magisk|apatch) ;;
    *) unset _hi_modid _hi_live _hi_stage; return 0 ;;
  esac

  ui_print "- Hot install requested ($ROOT_TYPE)"

  # Stash the old live dir instead of deleting it: running processes may
  # still reference it. The delayed cleanup removes the stash once the
  # new code is live; a leftover stash is swept at the top of the next
  # run. If the swap itself fails, the stash is put back and the staged
  # update is left for the normal reboot flow.
  _hi_trash="$SPECTER_DIR/hot_trash"
  rm -rf "$_hi_trash" 2>/dev/null || true
  mkdir -p "$_hi_trash" 2>/dev/null || true
  if ! mv "$_hi_live" "$_hi_trash/$_hi_modid" 2>/dev/null; then
    unset _hi_modid _hi_live _hi_stage _hi_trash
    return 0
  fi
  if ! mv "$_hi_stage" "$_hi_live" 2>/dev/null; then
    mv "$_hi_trash/$_hi_modid" "$_hi_live" 2>/dev/null || true
    unset _hi_modid _hi_live _hi_stage _hi_trash
    return 0
  fi

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

  # KernelSU's installer copies module.prop out of the staged dir after
  # customize.sh returns; leave a stub for it. Only do this for a genuine
  # KernelSU install: a stale /data/adb/ksu on a Magisk device would leave a
  # bare module.prop in modules_update, and Magisk renames that stub over the
  # live module on the next boot. The delayed cleanup removes the stub (if
  # any), the `update` flag the installers write into the live dir after
  # customize.sh returns, and the stash.
  if [ "$ROOT_SOL" = "kernelsu" ] && [ -n "${KSU_VER:-}${KSU_VER_CODE:-}" ]; then
    mkdir -p "$_hi_stage"
    cp "$_hi_live/module.prop" "$_hi_stage/module.prop" 2>/dev/null || true
  fi
  _hi_delay="${SPECTER_HOT_CLEANUP_DELAY:-3}"
  ( sleep "$_hi_delay"; rm -rf "$_hi_live/update" 2>/dev/null; rm -rf "$_hi_stage" 2>/dev/null; rm -rf "$_hi_trash" 2>/dev/null ) &

  ui_print "- Refresh module page after installation"
  if [ "${_hi_apply_failed:-0}" = "1" ]; then
    ui_print "- WARNING: live-apply failed; run action.sh from WebUI or reboot"
  else
    ui_print "- No need to reboot"
  fi

  unset _hi_modid _hi_live _hi_stage _hi_trash _hi_apply_failed _hi_delay
}
