# shellcheck shell=sh
# shellcheck disable=SC2034
MODDIR="$MODPATH"
. "$MODPATH/lib/common.sh"

# Clean up old uppercase paths (module id + data dir)
rm -rf /data/adb/modules/Specter /data/adb/Specter

ui_print ""
ui_print " ____                  _            "
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

# Tricky Store / TEESimulator-RS (id=tricky_store)
_ts_name=$(_ts_prop)
if [ -n "$_ts_name" ]; then
  ui_print "- $_ts_name"
else
  ui_print "- Tricky Store: none"
fi

# JingMatrix TEESimulator 4.0 (id=teesim)
_teesim_name=$(_teesim_prop)
if [ -n "$_teesim_name" ]; then
  ui_print "- $_teesim_name"
else
  ui_print "- TEESimulator: none"
fi

# OhMyKeymint version
_omk_name=$(_omk_prop)
if [ -n "$_omk_name" ]; then
  ui_print "- $_omk_name"
else
  ui_print "- OhMyKeymint: none"
fi

# PIF version
_pif_name=$(_pif_prop)
if [ -n "$_pif_name" ]; then
  ui_print "- $_pif_name"
else
  ui_print "- Play Integrity Fix: none"
fi

ui_print ""

unset _zygisk_name

ksm_enforce_singleton | while IFS= read -r _ksm_id; do
  [ -n "$_ksm_id" ] && ui_print "- Disabled $_ksm_id (keystore conflict)"
done

if ! module_enabled teesim >/dev/null \
  && ! module_enabled tricky_store >/dev/null \
  && ! module_enabled "${OMK_MODULE##*/}" >/dev/null; then
  ui_print "- Installing TEESimulator-RS.."
  if install_module_from_github "Enginex0/TEESimulator-RS" "TEESimulator-RS"; then
    ui_print "- TEESimulator-RS installed"
  else
    ui_print "- TEESimulator-RS not available"
  fi
else
  ui_print "- Keystore backend present, skipping TEESimulator-RS"
fi
unset _ts_name _teesim_name _omk_name

# Mark first-boot setup as pending (runs once after reboot in service.sh)
mkdir -p "$SPECTER_DIR"
touch "$SPECTER_DIR/.first_boot_pending"

mkdir -p "$MODPATH/webroot/json"
echo "{\"MODDIR\": \"$MODPATH\", \"SPECTER_DIR\": \"$SPECTER_DIR\"}" > "$MODPATH/webroot/json/module_paths.json"

# Backup module.prop for description override system
cp "$MODPATH/module.prop" "$MODPATH/module.prop.bak"

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
[ -f "$MODPATH/deps/classes.dex" ] && set_perm "$MODPATH/deps/classes.dex" 0 0 0644
unset _arch _src _f

# Copy shipped config files to data dir
mkdir -p "$SPECTER_DIR/config"
cp "$MODPATH/config/conflicts.txt" "$SPECTER_DIR/config/conflicts.txt" 2>/dev/null || true

# Hot install — ksu-only, update-already-present: move staging into the
# live dir and re-apply without a reboot. no-op on apatch/magisk/first install.
. "$MODPATH/lib/hotinstall.sh"
specter_hot_install

# The "next reboot" message only applies when we didn't just live-apply.
if [ -z "${_specter_hot_done:-}" ]; then
  ui_print ""
  ui_print " >> First-boot setup: backup, target, security patch, keybox (next reboot)"
fi

return 0
