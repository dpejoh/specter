#!/system/bin/sh
set -e
MODDIR=${0%/*}
. "$MODDIR/../lib/common.sh"
. "$MODDIR/../lib/paths.sh"
. "$MODDIR/../lib/package_list.sh"
. "$MODDIR/../lib/config_env.sh"

log "AUTO_TARGET" "Starting daemon"

PID_FILE="$SPECTER_DIR/auto_target.pid"
if [ -f "$PID_FILE" ]; then
  OLD_PID=$(cat "$PID_FILE" 2>/dev/null || echo "")
  if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
    log "AUTO_TARGET" "Already running (PID $OLD_PID), exiting"
    exit 0
  fi
fi
echo "$$" > "$PID_FILE"
trap 'rm -f "$PID_FILE"; exit' EXIT TERM INT HUP

BLACKLIST="$SPECTER_DIR/blacklist.txt"
BLACKLIST_ENABLED="$SPECTER_DIR/blacklist_enabled"
TEMP_LIST="$SPECTER_DIR/auto_target_pkgs.txt"
TEMP_EXIST="$SPECTER_DIR/auto_target_existing.txt"
TEMP_NEW="$SPECTER_DIR/auto_target_new.txt"
DEFAULT_INTERVAL=15

INTERVAL=$(cfg_get auto_target_interval "$DEFAULT_INTERVAL")
[ "$INTERVAL" -lt 3 ] && INTERVAL=3

log "AUTO_TARGET" "Daemon started (PID $$, interval: ${INTERVAL}s)"

while true; do
  [ -d "$MODDIR" ] || exit 0
  ENABLED=$(cfg_get toggle_auto_target 0)
  if [ "$ENABLED" != "1" ]; then
    log "AUTO_TARGET" "Disabled via config, exiting"
    exit 0
  fi

  CURRENT_INTERVAL=$(cfg_get auto_target_interval "$INTERVAL")
  [ "$CURRENT_INTERVAL" -lt 3 ] && CURRENT_INTERVAL=3

  pkgs=$(pm list packages -3 2>/dev/null) || {
    sleep "$CURRENT_INTERVAL"
    continue
  }
  echo "$pkgs" | cut -d ":" -f 2 | sort -u > "$TEMP_LIST"
  [ ! -s "$TEMP_LIST" ] && { sleep "$CURRENT_INTERVAL"; continue; }

  # Extract existing package names from target.txt (strip ? and ! suffixes)
  if [ -f "$TARGET_TXT" ] && [ -s "$TARGET_TXT" ]; then
    awk '!/^\[/ && NF { sub(/[!?]$/, "", $0); print }' "$TARGET_TXT" > "$TEMP_EXIST"
    grep -Fxvf "$TEMP_EXIST" "$TEMP_LIST" > "$TEMP_NEW" || true
  else
    mv "$TEMP_LIST" "$TEMP_NEW"
    : > "$TEMP_EXIST"
  fi

  if [ -s "$TEMP_NEW" ]; then
    if [ -f "$BLACKLIST_ENABLED" ] && [ -s "$BLACKLIST" ]; then
      grep -Fvxf "$BLACKLIST" "$TEMP_NEW" > "${TEMP_NEW}.filtered" 2>/dev/null && mv "${TEMP_NEW}.filtered" "$TEMP_NEW" || true
    fi
    [ ! -s "$TEMP_NEW" ] && { rm -f "$TEMP_LIST" "$TEMP_EXIST" "$TEMP_NEW"; sleep "$CURRENT_INTERVAL"; continue; }

    teeBroken="false"
    [ -f "$TEE_STATUS" ] && teeBroken=$(grep -E '^(teeBroken|tee_broken)=' "$TEE_STATUS" 2>/dev/null | cut -d= -f2 || echo "false")

    NEW_COUNT=0
    while read -r pkg; do
      [ -z "$pkg" ] && continue
      if [ "$teeBroken" = "true" ]; then
        echo "${pkg}?" >> "$TARGET_TXT"
      else
        echo "$pkg" >> "$TARGET_TXT"
      fi
      NEW_COUNT=$((NEW_COUNT + 1))
    done < "$TEMP_NEW"

    rm -f "${TEMP_NEW}.filtered"
    log "AUTO_TARGET" "Added $NEW_COUNT new package(s) to target.txt"
  fi

  rm -f "$TEMP_LIST" "$TEMP_EXIST" "$TEMP_NEW"
  sleep "$CURRENT_INTERVAL"
done
