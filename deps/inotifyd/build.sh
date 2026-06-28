#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
MODULE_DEPS="$PROJECT_ROOT/src/deps"

ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
NDK_DIR="${ANDROID_HOME}/ndk"

if [ -z "$NDK_VERSION" ]; then
  NDK_VERSION=$(ls -1 "$NDK_DIR" 2>/dev/null | sort -V | tail -1)
fi

NDK="$NDK_DIR/$NDK_VERSION"
TC="$NDK/toolchains/llvm/prebuilt/linux-x86_64/bin"

echo "=== Using NDK: $NDK ==="
echo "=== Building inotifyd ==="

"$TC/aarch64-linux-android21-clang" \
  -Os -s -Wall -Wextra \
  "$SCRIPT_DIR/inotifyd.c" \
  -o "$SCRIPT_DIR/inotifyd_arm64"
echo "  arm64: $SCRIPT_DIR/inotifyd_arm64 ($(stat -c%s "$SCRIPT_DIR/inotifyd_arm64") bytes)"

"$TC/armv7a-linux-androideabi21-clang" \
  -Os -s -Wall -Wextra \
  "$SCRIPT_DIR/inotifyd.c" \
  -o "$SCRIPT_DIR/inotifyd_arm"
echo "  arm:   $SCRIPT_DIR/inotifyd_arm ($(stat -c%s "$SCRIPT_DIR/inotifyd_arm") bytes)"

"$TC/x86_64-linux-android21-clang" \
  -Os -s -Wall -Wextra \
  "$SCRIPT_DIR/inotifyd.c" \
  -o "$SCRIPT_DIR/inotifyd_x86_64"
echo "  x86_64: $SCRIPT_DIR/inotifyd_x86_64 ($(stat -c%s "$SCRIPT_DIR/inotifyd_x86_64") bytes)"

"$TC/i686-linux-android21-clang" \
  -Os -s -Wall -Wextra \
  "$SCRIPT_DIR/inotifyd.c" \
  -o "$SCRIPT_DIR/inotifyd_x86"
echo "  x86:   $SCRIPT_DIR/inotifyd_x86 ($(stat -c%s "$SCRIPT_DIR/inotifyd_x86") bytes)"

echo "=== Cleaning module deps ==="
rm -f "$MODULE_DEPS/inotifyd" "$MODULE_DEPS/inotifyd64" "$MODULE_DEPS/inotifyd32" \
      "$MODULE_DEPS/inotifyd_x86_64" "$MODULE_DEPS/inotifyd_x86"

echo "=== Copying to module deps ==="
mkdir -p "$MODULE_DEPS"
cp "$SCRIPT_DIR/inotifyd_arm64"     "$MODULE_DEPS/inotifyd64"
cp "$SCRIPT_DIR/inotifyd_arm"       "$MODULE_DEPS/inotifyd32"
cp "$SCRIPT_DIR/inotifyd_x86_64"    "$MODULE_DEPS/inotifyd_x86_64"
cp "$SCRIPT_DIR/inotifyd_x86"       "$MODULE_DEPS/inotifyd_x86"

for _f in "$MODULE_DEPS/inotifyd64" "$MODULE_DEPS/inotifyd32" \
          "$MODULE_DEPS/inotifyd_x86_64" "$MODULE_DEPS/inotifyd_x86"; do
  echo "  -> $_f ($(stat -c%s "$_f") bytes)"
done

echo "=== Done ==="
