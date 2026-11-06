#!/system/bin/sh
# Generate the setup snapshot through the native app_process helper.
# The shell implementation is kept as a compatibility fallback.
set -e
MODDIR=${0%/*}
DEX="${SPECTER_DEX:-$MODDIR/../deps/classes.dex}"
OUT="${SPECTER_SETUP_INFO:-$MODDIR/../webroot/json/setup_info.json}"
SPECTER_DATA="${SPECTER_DIR:-/data/adb/specter}"
# app_process can crash when the caller cwd was deleted (KSU installer).
cd / 2>/dev/null || true

if [ -f "$DEX" ] && command -v app_process >/dev/null 2>&1; then
  if CLASSPATH="$DEX" app_process / com.dpejoh.specter.SetupProbe "$MODDIR/.." "$SPECTER_DATA" "$OUT"; then
    chmod 644 "$OUT" 2>/dev/null || true
    mkdir -p "$SPECTER_DATA/cache" 2>/dev/null || true
    touch "$SPECTER_DATA/cache/setup_info.stamp" 2>/dev/null || true
    exit 0
  fi
  echo "Warning: native setup probe failed, falling back to shell" >&2
fi

sh "$MODDIR/setup_info_shell.sh"
mkdir -p "$SPECTER_DATA/cache" 2>/dev/null || true
touch "$SPECTER_DATA/cache/setup_info.stamp" 2>/dev/null || true
exit 0
