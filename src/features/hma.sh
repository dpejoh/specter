#!/system/bin/sh
set -e
MODDIR=${0%/*}

. "$MODDIR/../lib/common.sh"
. "$MODDIR/../lib/constants.sh"

log_i "HMA" "Starting HMA config install"

_installed_pkgs=$(pm list packages 2>/dev/null) || log_w "HMA" "Failed to list installed packages"

if echo "$_installed_pkgs" | grep -q "org.frknkrc44.hma_oss"; then
  _target_dir="$HMA_DIR"
  _target_file="$HMA_FILE"
  _found="HMA-OSS"
elif echo "$_installed_pkgs" | grep -q "com.tsng.hidemyapplist"; then
  _target_dir="/data/user/0/com.tsng.hidemyapplist/files"
  _target_file="$_target_dir/config.json"
  _found="HMA"
elif echo "$_installed_pkgs" | grep -q "com.google.android.hmal"; then
  _target_dir="/data/user/0/com.google.android.hmal/files"
  _target_file="$_target_dir/config.json"
  _found="HMAL"
else
  log_w "HMA" "No HMA variant installed, skipping"
  unset _installed_pkgs
  log_i "HMA" "HMA config install complete"
  exit 0
fi

log_i "HMA" "Found $_found"

TEMP_FILE="/data/local/tmp/.specter_hma_config"
_install_ok=0

if check_network; then
  if download "$HMA_CONFIG_URL" "$TEMP_FILE" 2>/dev/null && [ -s "$TEMP_FILE" ]; then

    cp "$TEMP_FILE" "/sdcard/Download/hma-oss.json" 2>/dev/null || cp "$TEMP_FILE" "/sdcard/hma-oss.json" 2>/dev/null

    _pkg=$(echo "$_target_dir" | cut -d"/" -f5)
    _uid=$(pm list packages -U 2>/dev/null | grep "^package:$_pkg uid:" | sed "s/.*uid://") || _uid=0

    # Try direct install (works on Magisk, boot, action.sh)
    mkdir -p "$_target_dir" 2>/dev/null
    if cp "$TEMP_FILE" "$_target_file" 2>/dev/null; then
      chmod 600 "$_target_file" 2>/dev/null
      chown "$_uid:$_uid" "$_target_file" 2>/dev/null
      chown "$_uid:$_uid" "$_target_dir" 2>/dev/null
      _install_ok=1
    else
      # Sandboxed (KSU/APatch WebUI) — use su to escape namespace
      su -c "mkdir -p '$_target_dir' && cp '$TEMP_FILE' '$_target_file' && chmod 600 '$_target_file' && chown $_uid:$_uid '$_target_file' && chown $_uid:$_uid '$_target_dir'" 2>/dev/null && _install_ok=1
    fi

    if [ "$_install_ok" = "1" ]; then
      log_i "HMA" "Config installed for $_found"
    else
      log_e "HMA" "Config download succeeded but install failed"
    fi
    rm -f "$TEMP_FILE"
  else
    log_w "HMA" "Download returned empty"
  fi
fi

unset _installed_pkgs _target_dir _target_file _found _uid _pkg _install_ok TEMP_FILE
log_i "HMA" "HMA config install complete"
exit 0
