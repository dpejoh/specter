# shellcheck shell=sh
# shellcheck disable=SC2034
MODDIR="$MODPATH"
. "$MODPATH/lib/common.sh"

# Clean up old uppercase paths (module id + data dir)
rm -rf /data/adb/modules/Specter /data/adb/Specter

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

# Zygisk variant
_zygisk_name=$(_zygisk_variant)
if [ -n "$_zygisk_name" ]; then
  ui_print "- Zygisk: $_zygisk_name"
else
  ui_print "- Zygisk: none"
fi

# Tricky Store / TEESimulator version
_ts_name=$(_ts_prop)
if [ -n "$_ts_name" ]; then
  ui_print "- $_ts_name"
else
  ui_print "- Tricky Store: none"
fi

# PIF version
_pif_name=$(_pif_prop)
if [ -n "$_pif_name" ]; then
  ui_print "- $_pif_name"
else
  ui_print "- Play Integrity Fix: none"
fi

# TEE status
_tee_val=$(grep -E '^(teeBroken|tee_broken)=' "$TEE_STATUS" 2>/dev/null | cut -d= -f2)
case "$_tee_val" in
  true)  ui_print "- TEE: broken" ;;
  false) ui_print "- TEE: normal" ;;
esac
unset _tee_val

ui_print ""

unset _zygisk_name

# Install missing: TEESimulator-RS
if [ -z "$_ts_name" ]; then
  ui_print "- Installing TEESimulator-RS.."
  if install_module_from_github "Enginex0/TEESimulator-RS" "TEESimulator-RS"; then
    ui_print "- TEESimulator-RS installed"
  else
    ui_print "- TEESimulator-RS not available"
  fi
fi
unset _ts_name

# Mark first-boot setup as pending (runs once after reboot in service.sh)
touch "$MODPATH/.first_boot_pending"

mkdir -p "$MODPATH/webroot/json"
echo "{\"MODDIR\": \"$MODPATH\", \"SPECTER_DIR\": \"$SPECTER_DIR\"}" > "$MODPATH/webroot/json/module_paths.json"

# Backup module.prop for description override system
cp "$MODPATH/module.prop" "$MODPATH/module.prop.bak"

# Mark TEE for first-boot check (removed by service.sh after running)
mkdir -p "$SPECTER_DIR"
echo "1" > "$SPECTER_DIR/tee_reported"
echo "1" > "$SPECTER_DIR/rom_spoof_reported"
echo "1" > "$SPECTER_DIR/pif_reported"
rm -f "$SPECTER_DIR/tee_status" "$SPECTER_DIR/tee_hash" "$SPECTER_DIR/tee_tier" 2>/dev/null || true
unset _pif_name

# Ensure backup dir exists for first-boot snapshot
mkdir -p "$SPECTER_DIR/backup"

# Bundled inotifyd — install the right arch, clean up the rest
_arch=$(uname -m)
case "$_arch" in
  aarch64) _src="inotifyd64" ;;
  armv7l)  _src="inotifyd32" ;;
  x86_64)  _src="inotifyd_x86_64" ;;
  i686)    _src="inotifyd_x86" ;;
esac
if [ -n "$_src" ] && [ -f "$MODPATH/deps/$_src" ]; then
  mv "$MODPATH/deps/$_src" "$MODPATH/deps/inotifyd"
  set_perm "$MODPATH/deps/inotifyd" 0 0 0755
fi
for _f in inotifyd64 inotifyd32 inotifyd_x86_64 inotifyd_x86; do
  [ -f "$MODPATH/deps/$_f" ] && rm -f "$MODPATH/deps/$_f"
done
unset _arch _src _f

# Copy shipped config files to data dir
mkdir -p "$SPECTER_DIR/config"
cp "$MODPATH/config/conflicts.txt" "$SPECTER_DIR/config/conflicts.txt" 2>/dev/null || true

ui_print ""
ui_print " >> First-boot setup: backup, target, security patch, keybox (next reboot)"

return 0
