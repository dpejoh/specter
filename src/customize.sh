# shellcheck shell=sh
# shellcheck disable=SC2034
MODDIR="$MODPATH"
. "$MODPATH/lib/common.sh"
. "$MODPATH/lib/paths.sh"
. "$MODPATH/lib/config_env.sh"

_vol() {
    _vt="${1:-5}"
    _start=$(date +%s)
    _printed=-1

    ui_print ">> Yes [$_vt]"

    while true; do
        _now=$(date +%s)
        _elapsed=$((_now - _start))
        [ "$_elapsed" -ge "$_vt" ] && return 0

        _vk=$(timeout 1 getevent -qlc 1 2>/dev/null) 2>/dev/null
        if [ -n "$_vk" ]; then
            case "$_vk" in
                *KEY_VOLUMEUP*)   return 0 ;;
                *KEY_VOLUMEDOWN*) ui_print ">> No"; return 1 ;;
            esac
        fi

        _remaining=$((_vt - _elapsed))
        [ "$_remaining" -le 0 ] && _remaining=0
        if [ "$_remaining" -ne "$_printed" ] 2>/dev/null; then
            ui_print ">> Yes [$_remaining]"
            _printed=$_remaining
        fi

        sleep 0.3
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
  ui_print ""
  ui_print " Run full setup (keybox + target)?"
  ui_print "  Vol Up   = Yes (5s)"
  ui_print "  Vol Down = No"
  ui_print ""

  _vol; _choice=$?
  case $_choice in
    1)
      ui_print "- Skipping full setup."
      ;;
    *)
      ui_print "- Installing keybox..."
      if ! sh "$MODPATH/features/keybox.sh"; then
        if [ ! -f "$TARGET_FILE" ]; then
          ui_print "- Error: Keybox installation failed. Upload manually via WebUI."
        fi
      fi

      ui_print "- Generating target.txt..."
      if ! sh "$MODPATH/features/target.sh"; then
        ui_print "- target.txt generation failed"
      else
        ui_print "- target.txt generated"
      fi
      ;;
  esac
  unset _choice
fi
unset _ts_found

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
