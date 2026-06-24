#!/bin/bash
# Build and push module directly to device
# Usage: ./scripts/push.sh [zip-path] [device-dir]
#   zip-path: path to zip file (default: latest Specter-*.zip in project root)
#   device-dir: destination on device (default: /storage/emulated/0/specter-update)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ZIP="${1:-}"
SDIR="${2:-/storage/emulated/0/specter-update}"

if [ -z "$ZIP" ]; then
  ZIP=$(ls "$SCRIPT_DIR"/Specter-*.zip 2>/dev/null | sort | tail -1)
fi

if [ -z "$ZIP" ] || [ ! -f "$ZIP" ]; then
  echo "No zip found. Run 'npm run build' first or provide a path."
  echo "Usage: $0 [zip-path] [device-dir]"
  exit 1
fi

echo "Pushing: $ZIP"
echo "Device destination: $SDIR"

adp_push() {
  adb push "$1" /data/local/tmp/ 2>/dev/null || return 1
  adb shell "su -c \"mkdir -p $SDIR && cp /data/local/tmp/$(basename "$1") $SDIR/ && rm /data/local/tmp/$(basename "$1")\"" 2>/dev/null
}

adp_push "$ZIP" || { echo "adb push failed"; exit 1; }
adp_push "$SCRIPT_DIR/scripts/deploy-module.sh" 2>/dev/null || true

echo "Deploying..."
adb shell su -c sh "$SDIR/deploy-module.sh" "$SDIR/$(basename "$ZIP")"
echo "Done. Hard-refresh the webui page."
