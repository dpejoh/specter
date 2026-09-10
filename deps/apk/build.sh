#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
MODULE_DEPS="$PROJECT_ROOT/src/deps"
ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"

PLATFORM_JAR=$(ls -v "$ANDROID_HOME/platforms"/android-*/android.jar 2>/dev/null | tail -1)
D8=$(ls -v "$ANDROID_HOME/build-tools"/*/d8 2>/dev/null | tail -1)

if [ -z "$PLATFORM_JAR" ] || [ -z "$D8" ]; then
  echo "Error: Android SDK platform jar or d8 not found in $ANDROID_HOME"
  exit 1
fi

echo "=== Compiling classes.dex using javac + d8 ==="
BUILD_TMP=$(mktemp -d)
mkdir -p "$BUILD_TMP/classes"

javac -cp "$PLATFORM_JAR" -d "$BUILD_TMP/classes" \
  "$SCRIPT_DIR"/app/src/main/java/com/dpejoh/specter/Main.java \
  "$SCRIPT_DIR"/app/src/main/java/com/dpejoh/specter/attestation/*.java

"$D8" --output "$BUILD_TMP" \
  "$BUILD_TMP"/classes/com/dpejoh/specter/*.class \
  "$BUILD_TMP"/classes/com/dpejoh/specter/attestation/*.class

mkdir -p "$MODULE_DEPS"
cp "$BUILD_TMP/classes.dex" "$MODULE_DEPS/classes.dex"
echo "Copied classes.dex ($(stat -c%s "$MODULE_DEPS/classes.dex") bytes) to src/deps/classes.dex"

rm -rf "$BUILD_TMP"
echo "=== Done ==="
