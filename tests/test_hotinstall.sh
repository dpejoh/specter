plan "lib/hotinstall.sh — gates, happy path, cleanup, apply failure"

_hi_setup() {
  _modid="${1:-specter}"
  ROOT_SOL="kernelsu"
  ROOT_TYPE="KernelSU"
  _mods_update="${MODULES_BASE}_update"
  MODPATH="$_mods_update/$_modid"
  STAGE="$MODPATH"
  LIVE="$MODULES_BASE/$_modid"

  rm -rf "$LIVE" "$_mods_update"
  mkdir -p "$LIVE"
  printf 'id=%s\nname=OldVersion\nversionCode=1\n' "$_modid" > "$LIVE/module.prop"

  mkdir -p "$STAGE"
  printf 'id=%s\nname=NewVersion\nversionCode=2\n' "$_modid" > "$STAGE/module.prop"
  _hi_exec_rc="${2:-0}"
  if [ "$_hi_exec_rc" = "0" ]; then
    printf '#!/bin/sh\necho stub-running\necho ran > "$(dirname "$0")/hi.ran"\nexit 0\n' > "$STAGE/hotinstall.sh"
  else
    printf '#!/bin/sh\necho stub-running\necho ran > "$(dirname "$0")/hi.ran"\n: > "$SPECTER_DIR/.hotinstall_failed"\nexit %s\n' "$_hi_exec_rc" > "$STAGE/hotinstall.sh"
  fi
  chmod +x "$STAGE/hotinstall.sh"

  : > "$SPECTER_DIR/.first_boot_pending"

  UI_LOG="$TEST_ROOT/ui.log"; : > "$UI_LOG"
  ui_print() { echo "$@" >> "$UI_LOG"; }

  SPECTER_HOT_CLEANUP_DELAY=0
  export SPECTER_HOT_CLEANUP_DELAY
  unset _modid
}

. "$REPO_ROOT/src/lib/hotinstall.sh"

# ---- APatch happy path: swap, no stub ----
bootstrap
source_libs
_hi_setup
unset _specter_hot_done
ROOT_SOL="apatch"
ROOT_TYPE="APatch"
specter_hot_install
assert_file_eq "apatch: live updated" "$LIVE/module.prop" "$(printf 'id=specter\nname=NewVersion\nversionCode=2\n')"
assert_file_exists "apatch: executor ran" "$LIVE/hi.ran"
assert_file_not_exists "apatch: no stub in staging" "$STAGE/module.prop"
assert_eq "apatch: hot-done set" "1" "${_specter_hot_done:-}"

# ---- first install skipped ----
bootstrap
source_libs
_hi_setup
unset _specter_hot_done
rm -rf "$LIVE"
specter_hot_install
assert_file_exists "first-install: staging intact" "$STAGE/module.prop"
assert_eq "first-install: no hot-done" "" "${_specter_hot_done:-}"

# ---- KSU happy path ----
bootstrap
source_libs
_hi_setup
KSU_VER="1.0"; export KSU_VER
specter_hot_install
assert_file_eq "ksu: live updated" "$LIVE/module.prop" "$(printf 'id=specter\nname=NewVersion\nversionCode=2\n')"
assert_file_exists "ksu: executor ran" "$LIVE/hi.ran"
assert_file_not_exists "ksu: first_boot_pending cleared" "$SPECTER_DIR/.first_boot_pending"
assert_eq "ksu: hot-done set" "1" "${_specter_hot_done:-}"
_ui="$(cat "$UI_LOG")"
assert_contains "ksu: announces hot install" "$_ui" "Hot install requested"
assert_contains "ksu: no reboot promised" "$_ui" "No need to reboot"
assert_not_contains "ksu: no warning" "$_ui" "WARNING"
unset KSU_VER

# ---- KSU native path: request recorded, nothing swapped by hand ----
bootstrap
source_libs
_hi_setup
unset _specter_hot_done
KSU_HAS_HOT_INSTALL=true
specter_hot_install
assert_eq "native: request set" "true" "${MODULE_HOT_INSTALL_REQUEST:-}"
assert_eq "native: run script" "hotinstall-launcher.sh" "${MODULE_HOT_RUN_SCRIPT:-}"
assert_file_eq "native: live untouched" "$LIVE/module.prop" "$(printf 'id=specter\nname=OldVersion\nversionCode=1\n')"
assert_file_exists "native: staging intact" "$STAGE/module.prop"
assert_file_not_exists "native: executor not run" "$STAGE/hi.ran"
assert_file_not_exists "native: first_boot_pending cleared" "$SPECTER_DIR/.first_boot_pending"
assert_eq "native: hot-done set" "1" "${_specter_hot_done:-}"
unset KSU_HAS_HOT_INSTALL MODULE_HOT_INSTALL_REQUEST MODULE_HOT_RUN_SCRIPT

# ---- KSU with mountify: request recorded for the metamodule ----
bootstrap
source_libs
_hi_setup
unset _specter_hot_done
MOUNTIFY_HAS_HOT_INSTALL=true
specter_hot_install
assert_eq "mountify-ksu: request set" "true" "${MODULE_HOT_INSTALL_REQUEST:-}"
assert_eq "mountify-ksu: run script" "hotinstall-launcher.sh" "${MODULE_HOT_RUN_SCRIPT:-}"
assert_file_eq "mountify-ksu: live untouched" "$LIVE/module.prop" "$(printf 'id=specter\nname=OldVersion\nversionCode=1\n')"
assert_file_exists "mountify-ksu: staging intact" "$STAGE/module.prop"
assert_file_not_exists "mountify-ksu: executor not run" "$STAGE/hi.ran"
assert_file_not_exists "mountify-ksu: first_boot_pending cleared" "$SPECTER_DIR/.first_boot_pending"
assert_eq "mountify-ksu: hot-done set" "1" "${_specter_hot_done:-}"
unset MOUNTIFY_HAS_HOT_INSTALL MODULE_HOT_INSTALL_REQUEST MODULE_HOT_RUN_SCRIPT

# ---- APatch with mountify: request recorded for the metamodule ----
bootstrap
source_libs
_hi_setup
unset _specter_hot_done
ROOT_SOL="apatch"
ROOT_TYPE="APatch"
MOUNTIFY_HAS_HOT_INSTALL=true
specter_hot_install
assert_eq "mountify-apatch: request set" "true" "${MODULE_HOT_INSTALL_REQUEST:-}"
assert_eq "mountify-apatch: run script" "hotinstall-launcher.sh" "${MODULE_HOT_RUN_SCRIPT:-}"
assert_file_eq "mountify-apatch: live untouched" "$LIVE/module.prop" "$(printf 'id=specter\nname=OldVersion\nversionCode=1\n')"
assert_file_exists "mountify-apatch: staging intact" "$STAGE/module.prop"
assert_file_not_exists "mountify-apatch: executor not run" "$STAGE/hi.ran"
assert_eq "mountify-apatch: hot-done set" "1" "${_specter_hot_done:-}"
unset MOUNTIFY_HAS_HOT_INSTALL MODULE_HOT_INSTALL_REQUEST MODULE_HOT_RUN_SCRIPT

# ---- cleanup dance ----
bootstrap
source_libs
_hi_setup
KSU_VER="1.0"; export KSU_VER
specter_hot_install
assert_file_exists "dance: stub module.prop" "${STAGE}/module.prop"
sleep 1
assert_file_not_exists "dance: staging removed" "${STAGE}/module.prop"
assert_file_not_exists "dance: update marker gone" "$LIVE/update"
assert_file_not_exists "dance: stash removed" "$SPECTER_DIR/hot_trash/specter/module.prop"
unset KSU_VER

# ---- Magisk happy path: swap, no stub, tail flag cleaned up ----
bootstrap
source_libs
_hi_setup
unset _specter_hot_done
ROOT_SOL="magisk"
ROOT_TYPE="Magisk"
SPECTER_HOT_CLEANUP_DELAY=1
export SPECTER_HOT_CLEANUP_DELAY
specter_hot_install
assert_file_eq "magisk: live updated" "$LIVE/module.prop" "$(printf 'id=specter\nname=NewVersion\nversionCode=2\n')"
assert_file_exists "magisk: executor ran" "$LIVE/hi.ran"
assert_file_not_exists "magisk: no stub in staging" "$STAGE/module.prop"
assert_eq "magisk: hot-done set" "1" "${_specter_hot_done:-}"
: > "$LIVE/update"
sleep 2
assert_file_not_exists "magisk: tail update flag cleaned" "$LIVE/update"
assert_file_not_exists "magisk: stash removed" "$SPECTER_DIR/hot_trash/specter/module.prop"

# ---- stale KSU directory on Magisk: never leave a staging stub ----
bootstrap
source_libs
_hi_setup
unset _specter_hot_done KSU_VER KSU_VER_CODE
ROOT_SOL="kernelsu"
ROOT_TYPE="KernelSU"
specter_hot_install
assert_file_eq "misdetect: live updated" "$LIVE/module.prop" "$(printf 'id=specter\nname=NewVersion\nversionCode=2\n')"
assert_file_exists "misdetect: executor ran" "$LIVE/hi.ran"
assert_file_not_exists "misdetect: no staging stub" "$STAGE/module.prop"
assert_eq "misdetect: hot-done set" "1" "${_specter_hot_done:-}"

# ---- gate: mounted payload refused ----
bootstrap
source_libs
_hi_setup
unset _specter_hot_done
mkdir -p "$STAGE/system/bin"
specter_hot_install
assert_file_eq "gate-payload: live unchanged" "$LIVE/module.prop" "$(printf 'id=specter\nname=OldVersion\nversionCode=1\n')"
assert_eq "gate-payload: no hot-done" "" "${_specter_hot_done:-}"
assert_file_exists "gate-payload: staging intact" "$STAGE/module.prop"

# ---- gate: disabled module refused ----
bootstrap
source_libs
_hi_setup
unset _specter_hot_done
: > "$LIVE/disable"
specter_hot_install
assert_file_eq "gate-disabled: live unchanged" "$LIVE/module.prop" "$(printf 'id=specter\nname=OldVersion\nversionCode=1\n')"
assert_eq "gate-disabled: no hot-done" "" "${_specter_hot_done:-}"

# ---- apply failure ----
bootstrap
source_libs
_hi_setup "specter" 1
specter_hot_install
assert_file_eq "fail: live still updated" "$LIVE/module.prop" "$(printf 'id=specter\nname=NewVersion\nversionCode=2\n')"
assert_eq "fail: hot-done still set" "1" "${_specter_hot_done:-}"
_ui="$(cat "$UI_LOG")"
assert_contains "fail: warns" "$_ui" "WARNING: live-apply failed"
assert_not_contains "fail: no no-reboot promise" "$_ui" "No need to reboot"

done_testing
