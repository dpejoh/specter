#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
MODULE_DEPS="$PROJECT_ROOT/src/deps"

export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"

echo "=== Building release APK ==="
cd "$SCRIPT_DIR"
gradle assembleRelease

APK="$SCRIPT_DIR/app/build/outputs/apk/release/app-release.apk"
[ -f "$APK" ] && echo "APK: $APK ($(stat -c%s "$APK") bytes)" || { echo "Build failed"; exit 1; }

echo "=== Copying classes.dex + APK to module deps ==="
mkdir -p "$MODULE_DEPS"
DEX_TMP=$(mktemp -d)
unzip -o "$APK" "classes.dex" -d "$DEX_TMP" >/dev/null 2>&1
if [ -f "$DEX_TMP/classes.dex" ]; then
  cp "$DEX_TMP/classes.dex" "$MODULE_DEPS/classes.dex"
  echo "Copied classes.dex ($(stat -c%s "$MODULE_DEPS/classes.dex") bytes)"
else
  echo "Warning: classes.dex not found in APK"
fi
rm -rf "$DEX_TMP"

cp "$APK" "$MODULE_DEPS/specter.apk"
_vc=$(grep -E 'versionCode\s*=' "$SCRIPT_DIR/app/build.gradle.kts" | head -1 | grep -oE '[0-9]+' | head -1)
printf '%s\n' "${_vc:-1}" > "$MODULE_DEPS/specter.apk.vc"
unset _vc
echo "Copied specter.apk + specter.apk.vc"

echo "=== Done ==="
echo "Now run 'npm run build' from $PROJECT_ROOT to bundle it"
