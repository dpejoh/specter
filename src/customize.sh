# shellcheck shell=sh
. "$MODPATH/lib/common.sh"
. "$MODPATH/lib/urls.sh"
. "$MODPATH/lib/paths.sh"

_vol() {
  while true; do
    _vol_key=$(getevent -qlc 1 2>/dev/null)
    case "$_vol_key" in
      *KEY_VOLUMEUP*)   unset _vol_key; return 0 ;;
      *KEY_VOLUMEDOWN*) unset _vol_key; return 1 ;;
    esac
    unset _vol_key
  done
}

ui_print ""
ui_print "____                  _            "
ui_print "/ ___| _ __   ___  ___| |_ ___ _ __ "
ui_print "\\___ \\| '_ \\ / _ \\/ __| __/ _ \\ '__|"
ui_print " ___) | |_) |  __/ (__| ||  __/ |   "
ui_print "|____/| .__/ \\___|\\___|\\__\\___|_|   "
ui_print "      |_|                           "
ui_print ""

detect_root_solution
case "$ROOT_SOL" in
  kernelsu) ui_print "- KernelSU root detected" ;;
  apatch)   ui_print "- APatch root detected"   ;;
  magisk)   ui_print "- Magisk root detected"   ;;
  legacy)   ui_print "- Legacy root detected"   ;;
esac

_ts_found=false
if [ -d "/data/adb/modules/tricky_store" ] || [ -d "/data/adb/modules_update/tricky_store" ]; then
  _ts_found=true
fi

if [ "$_ts_found" = true ]; then
  ui_print "- Tricky Store found"

  DECODE_FILE="$TRICKY_DIR/keybox_decode"
  TEMP_FILE="$MODPATH/keybox.tmp"

  ui_print ""
  ui_print " Install a keybox?"
  ui_print "  Vol Up   = Yes"
  ui_print "  Vol Down = No (install later)"
  ui_print ""

  _vol; _choice=$?
  case $_choice in
    0)
      ui_print "- Installing keybox..."
      if check_network; then
        download "$KEYBOX_URL" > "$TEMP_FILE"

        if [ ! -f "$TEMP_FILE" ] || [ ! -s "$TEMP_FILE" ]; then
            ui_print "- Error: Keybox download failed. You can upload a keybox manually via the WebUI."
            rm -f "$TEMP_FILE"
        else
            mkdir -p "$TRICKY_DIR"

            if ! decode_keybox_blob "$TEMP_FILE" "$DECODE_FILE" 2>/dev/null; then
                ui_print "- Error: Downloaded keybox is corrupted or invalid. Try again later."
                rm -f "$TEMP_FILE"
            else
                if [ -f "$TARGET_FILE" ]; then
                    if cmp -s "$TARGET_FILE" "$DECODE_FILE"; then
                        ui_print "- Current keybox is already up to date. No changes needed."
                        rm -f "$TEMP_FILE" "$DECODE_FILE"
                    else
                        ui_print "- Backing up previous keybox..."
                        cp "$TARGET_FILE" "$BACKUP_FILE"
                        mv "$DECODE_FILE" "$TARGET_FILE"
                        rm -f "$TEMP_FILE"
                        ui_print "- Keybox installed successfully"
                    fi
                else
                    ui_print "- No keybox found! Creating a new one..."
                    mv "$DECODE_FILE" "$TARGET_FILE"
                    rm -f "$TEMP_FILE"
                    ui_print "- Keybox installed successfully"
                fi
            fi
        fi
      else
        ui_print "- No internet connection detected. Skipping keybox download."
        ui_print "- You can download a keybox later from the action button or WebUI."
      fi
      ;;
    1)
      ui_print "- Skipping keybox installation."
      ui_print "- Install from the action button or WebUI later."
      rm -f "$TEMP_FILE" "$DECODE_FILE" 2>/dev/null
      ;;

  esac
  unset _choice

  ui_print ""
  ui_print " Updating target file..."
  sh "$MODPATH/features/target.sh"
  ui_print "- Target file updated"
fi
unset _ts_found

mkdir -p "$MODPATH/webroot/json"
RUNTIME_DIR=$(printf '%s' "$MODPATH" | sed 's|/modules_update/|/modules/|')

return 0
