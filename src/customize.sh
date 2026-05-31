# shellcheck shell=sh
# shellcheck disable=SC2034
MODDIR="$MODPATH"
. "$MODPATH/lib/common.sh"
. "$MODPATH/lib/urls.sh"
. "$MODPATH/lib/paths.sh"
. "$MODPATH/lib/config_env.sh"

_vol() {
    _vt="${1:-5}" _vw=0
    while [ "$_vw" -lt "$_vt" ]; do
        _vk=$(timeout 1 getevent -qlc 1 2>/dev/null)
        if [ -n "$_vk" ]; then
            case "$_vk" in
                *KEY_VOLUMEUP*)   unset _vt _vw _vk; return 0 ;;
                *KEY_VOLUMEDOWN*) unset _vt _vw _vk; return 1 ;;
            esac
        fi
        _vw=$((_vw + 1))
    done
    unset _vt _vw _vk
    return 2
}

ui_print ""
ui_print "____                  _            "
ui_print "/ ___| _ __   ___  ___| |_ ___ _ __ "
ui_print "\\___ \\| '_ \\ / _ \\/ __| __/ _ \\ '__|"
ui_print " ___) | |_) |  __/ (__| ||  __/ |   "
ui_print "|____/| .__/ \\___|\\___|\\__\\___|_|   "
ui_print "      |_|                           "
ui_print ""

ui_print "- Checking device info..."
detect_root_solution
[ "$ROOT_TYPE" != "Unknown" ] && ui_print "- $ROOT_TYPE detected"

_ts_found=false
_ts_name=$(_ts_prop)
case "$_ts_name" in
  TEESimulator-RS) _ts_found=true; ui_print "- TEESimulator-RS found" ;;
  TEESimulator)    _ts_found=true; ui_print "- TEESimulator found" ;;
  *Tricky*)        _ts_found=true; ui_print "- Tricky Store found" ;;
  "")              ;;
  *)               _ts_found=true; ui_print "- $_ts_name found" ;;
esac
unset _ts_name

_pif_name=$(_pif_prop)
[ -n "$_pif_name" ] && ui_print "- $_pif_name found"
unset _pif_name

# TEE status check, read from cache only
_tee=
if [ -f "$TEE_STATUS" ]; then
  _tee_val=$(grep -E '^(teeBroken|tee_broken)=' "$TEE_STATUS" 2>/dev/null | cut -d= -f2)
  case "$_tee_val" in
    true)  _tee="broken" ;;
    false) _tee="normal" ;;
  esac
  unset _tee_val
fi
case "$_tee" in
  normal|broken)
    ui_print "- TEE: $_tee"
    ;;
esac
unset _tee

if [ "$_ts_found" = true ]; then
  DECODE_FILE="$TRICKY_DIR/keybox_decode"
  TEMP_FILE="$MODPATH/keybox.tmp"

  ui_print ""
  ui_print " Install a keybox?"
  ui_print "  Vol Up   = Yes (5s)"
  ui_print "  Vol Down = No"
  ui_print ""

  _vol; _choice=$?
  case $_choice in
    1)
      ui_print "- Skipping keybox installation."
      ui_print "- Install from the action button or WebUI later."
      rm -f "$TEMP_FILE" "$DECODE_FILE" 2>/dev/null
      ;;
    *)
      ui_print "- Installing keybox..."
      if check_network; then
        ( download "$KEYBOX_URL" > "$TEMP_FILE" ) & _dl_pid=$!
        _dl_i=0; while kill -0 $_dl_pid 2>/dev/null && [ $_dl_i -lt 30 ]; do sleep 1; _dl_i=$((_dl_i + 1)); done
        kill $_dl_pid 2>/dev/null || true; wait $_dl_pid 2>/dev/null || true

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
  esac
  unset _choice
fi
unset _ts_found

ui_print ""
ui_print " Generate target.txt?"
ui_print "  Vol Up   = Yes (5s)"
ui_print "  Vol Down = No"
ui_print ""
_vol; _tg_choice=$?
case $_tg_choice in
  1)
    ui_print "- Skipping target.txt."
    ;;
  *)
    ui_print "- Generating target.txt..."
    sh "$MODPATH/features/target.sh" && \
      ui_print "- target.txt generated" || \
      ui_print "- target.txt generation failed"
    ;;
esac
unset _tg_choice

mkdir -p "$MODPATH/webroot/json"

# Backup module.prop for description override system
cp "$MODPATH/module.prop" "$MODPATH/module.prop.bak"

# Mark TEE for first-boot check (removed by boot_core.sh after running)
mkdir -p "$SPECTER_DIR"
echo "1" > "$SPECTER_DIR/tee_reported"
echo "1" > "$SPECTER_DIR/rom_spoof_reported"

# Conflicts are resolved automatically at boot, no interactive prompts needed

# Generate fresh keybox info for description
if [ -d "/data/adb/modules/tricky_store" ] || [ -d "/data/adb/modules_update/tricky_store" ]; then
  sh "$MODPATH/features/keybox_info.sh" >/dev/null 2>&1 || true
fi

# Refresh module description so manager shows dynamic status immediately
. "$MODPATH/lib/desc.sh"
refresh_module_description

return 0
