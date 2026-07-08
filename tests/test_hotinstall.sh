plan "lib/hotinstall.sh — specter_hot_install gating, move, cleanup dance, messaging"

# Helpers --------------------------------------------------------------------
_hi_setup() {
  # $1 = modid (defaults to "specter")
  _modid="${1:-specter}"
  ROOT_SOL="kernelsu"
  ROOT_TYPE="KernelSU"
  _mods_update="${MODULES_BASE}_update"
  MODPATH="$_mods_update/$_modid"
  STAGE="$MODPATH"
  LIVE="$MODULES_BASE/$_modid"

  # Pre-existing live dir (this is an update, not first install)
  rm -rf "$LIVE" "$_mods_update"
  mkdir -p "$LIVE"
  printf 'id=%s\nname=OldVersion\nversionCode=1\n' "$_modid" > "$LIVE/module.prop"

  # Staging dir the manager runs customize.sh from
  mkdir -p "$STAGE"
  printf 'id=%s\nname=NewVersion\nversionCode=2\n' "$_modid" > "$STAGE/module.prop"
  # Executor stub: $2 controls exit code (default 0). Writes a marker next to
  # itself (in the live dir, post-move) so we can prove the live copy ran.
  # Also prints a line so we can assert the streaming-pipe reaches ui_print.
  # On failure (rc!=0) writes the status marker the real hotinstall.sh would.
  _hi_exec_rc="${2:-0}"
  if [ "$_hi_exec_rc" = "0" ]; then
    printf '#!/bin/sh\necho stub-running\necho ran > "$(dirname "$0")/hi.ran"\nexit 0\n' > "$STAGE/hotinstall.sh"
  else
    printf '#!/bin/sh\necho stub-running\necho ran > "$(dirname "$0")/hi.ran"\n: > "$SPECTER_DIR/.hotinstall_failed"\nexit %s\n' "$_hi_exec_rc" > "$STAGE/hotinstall.sh"
  fi
  chmod +x "$STAGE/hotinstall.sh"

  # First-boot token present (customize.sh touches it on every install)
  : > "$SPECTER_DIR/.first_boot_pending"

  # ui_print mock
  UI_LOG="$TEST_ROOT/ui.log"; : > "$UI_LOG"
  ui_print() { echo "$@" >> "$UI_LOG"; }

  # Fast cleanup delay so tests don't sleep 3s
  SPECTER_HOT_CLEANUP_DELAY=0
  export SPECTER_HOT_CLEANUP_DELAY

  unset _modid
}

. "$REPO_ROOT/src/lib/hotinstall.sh"

# ---- gate: APatch skipped ----
bootstrap
source_libs
_hi_setup
ROOT_SOL="apatch"
specter_hot_install
assert_file_eq "apatch: live unchanged (old prop)" "$LIVE/module.prop" "$(printf 'id=specter\nname=OldVersion\nversionCode=1\n')"
assert_eq "apatch: no hot-done marker" "" "${_specter_hot_done:-}"
assert_not_contains "apatch: ui silent on hot install" "$(cat "$UI_LOG")" "Hot install requested"
# staging still intact (move did not happen)
assert_file_exists "apatch: staging intact" "$STAGE/module.prop"

# ---- gate: first install skipped (no live dir) ----
bootstrap
source_libs
_hi_setup
rm -rf "$LIVE"   # first install: live not present yet
specter_hot_install
assert_file_exists "first-install: staging intact" "$STAGE/module.prop"
assert_eq "first-install: no hot-done marker" "" "${_specter_hot_done:-}"

# ---- gate: missing staging skipped ----
bootstrap
source_libs
_hi_setup
rm -rf "${MODULES_BASE}_update"
specter_hot_install
assert_file_eq "no-staging: live unchanged" "$LIVE/module.prop" "$(printf 'id=specter\nname=OldVersion\nversionCode=1\n')"

# ---- happy path: ksu update moves staging -> live ----
bootstrap
source_libs
_hi_setup
specter_hot_install
assert_file_eq "ksu: live has new module.prop" "$LIVE/module.prop" "$(printf 'id=specter\nname=NewVersion\nversionCode=2\n')"
assert_file_exists "ksu: executor ran from live dir" "$LIVE/hi.ran"
assert_file_not_exists "ksu: first_boot_pending removed" "$SPECTER_DIR/.first_boot_pending"
assert_eq "ksu: hot-done marker set" "1" "${_specter_hot_done:-}"
_ui="$(cat "$UI_LOG")"
assert_contains "ksu: ui announces hot install" "$_ui" "Hot install requested"
assert_contains "ksu: ui says no reboot" "$_ui" "No need to reboot"
assert_not_contains "ksu: no apply-fail warning" "$_ui" "WARNING"
assert_contains "ksu: executor output streamed to ui" "$_ui" "stub-running"
assert_contains "ksu: ui pre-announces apply" "$_ui" "Applying update"

# ---- cleanup dance: stub module.prop recreated, then staging removed ----
bootstrap
source_libs
_hi_setup
specter_hot_install
assert_file_exists "dance: stub module.prop in staging" "${STAGE}/module.prop"
sleep 1
assert_file_not_exists "dance: staging removed after delay" "${STAGE}/module.prop"
assert_file_not_exists "dance: live/update marker removed" "$LIVE/update"

# ---- apply failure: warning printed, install still considered done ----
bootstrap
source_libs
_hi_setup "specter" 1   # executor exits 1
specter_hot_install
assert_file_eq "fail: live still got new code" "$LIVE/module.prop" "$(printf 'id=specter\nname=NewVersion\nversionCode=2\n')"
assert_eq "fail: hot-done marker still set" "1" "${_specter_hot_done:-}"
_ui="$(cat "$UI_LOG")"
assert_contains "fail: ui warns about apply failure" "$_ui" "WARNING: live-apply failed"
assert_not_contains "fail: ui does not promise no-reboot" "$_ui" "No need to reboot"

# ---- non-specter module id is respected (no hardcoding) ----
bootstrap
source_libs
_hi_setup "myfork"
specter_hot_install
assert_file_eq "modid: myfork live updated" "$MODULES_BASE/myfork/module.prop" "$(printf 'id=myfork\nname=NewVersion\nversionCode=2\n')"
assert_file_exists "modid: myfork executor ran" "$MODULES_BASE/myfork/hi.ran"

# Helpers for real-executor tests: use the actual src/hotinstall.sh, but stub
# its siblings so the test runs without an Android runtime.
_hi_setup_real_executor() {
  bootstrap
  source_libs
  _hi_setup
  rm -f "$STAGE/hotinstall.sh"
  cp "$REPO_ROOT/src/hotinstall.sh" "$STAGE/hotinstall.sh"
  chmod +x "$STAGE/hotinstall.sh"
  mkdir -p "$STAGE/features" "$STAGE/lib"
  printf '#!/bin/sh\necho tee_ok > "$SPECTER_DIR/tee.ran"\n' > "$STAGE/features/tee.sh"
  chmod +x "$STAGE/features/tee.sh"
  printf '#!/bin/sh\nexit 0\n' > "$STAGE/lib/scheduler.sh"
  cat > "$STAGE/lib/common.sh" << 'COMMON_EOF'
log_d() { :; }
log_i() { echo "$2"; }
log_w() { echo "Warning: $2"; }
log_e() { echo "Error: $2" >&2; }
log_rotate() { :; }
cfg_get() { echo "${2:-}"; }
ensure_dir() { mkdir -p "$1" 2>/dev/null; }
COMMON_EOF
  # Pre-seed the scheduler pid file so the kill path runs (proves it tolerates
  # a missing process: kill on a non-existent pid just fails silently).
  echo "99999" > "$SPECTER_DIR/scheduler.pid"
}

# ---- real executor: src/hotinstall.sh invokes tee.sh + action.sh, streams to ui_print ----
_hi_setup_real_executor
printf '#!/bin/sh\necho ACTION-OK\necho ran > "$SPECTER_DIR/act.ran"\nexit 0\n' > "$STAGE/action.sh"
chmod +x "$STAGE/action.sh"
specter_hot_install
assert_file_exists "real-exec: tee.sh ran (TEE cache refresh)" "$SPECTER_DIR/tee.ran"
assert_file_exists "real-exec: action.sh ran" "$SPECTER_DIR/act.ran"
assert_file_not_exists "real-exec: no failure marker on success" "$SPECTER_DIR/.hotinstall_failed"
_ui="$(cat "$UI_LOG")"
assert_contains "real-exec: HOT line streamed" "$_ui" "Hot-install live-apply starting"
assert_contains "real-exec: tee refresh announced" "$_ui" "Refreshing TEE status"
assert_contains "real-exec: action.sh announced" "$_ui" "Running action.sh"
assert_contains "real-exec: action.sh child output streamed (ACTION-OK)" "$_ui" "ACTION-OK"
assert_contains "real-exec: done line streamed" "$_ui" "Hot-install live-apply done"

# ---- real executor: action.sh failure writes status marker, hot install warns ----
_hi_setup_real_executor
printf '#!/bin/sh\necho ACTION-FAIL\nexit 7\n' > "$STAGE/action.sh"
chmod +x "$STAGE/action.sh"
specter_hot_install
assert_file_exists "real-exec-fail: tee.sh still ran" "$SPECTER_DIR/tee.ran"
assert_file_not_exists "real-exec-fail: no stale failure marker" "$SPECTER_DIR/.hotinstall_failed"
_ui="$(cat "$UI_LOG")"
assert_contains "real-exec-fail: ui warns about apply failure" "$_ui" "WARNING: live-apply failed"
assert_not_contains "real-exec-fail: ui does not promise no-reboot" "$_ui" "No need to reboot"

done_testing