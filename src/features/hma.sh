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

    cp "$TEMP_FILE" "/sdcard/Download/hma-oss.json" 2>/dev/null || cp "$TEMP_FILE" "/sdcard/hma-oss.json" 2>/dev/null || true

    mkdir -p "$_target_dir" 2>/dev/null || true
    if cat "$TEMP_FILE" > "$_target_file" 2>/dev/null; then
      _install_ok=1
    else
      su -c "mkdir -p '$_target_dir' && cat '$TEMP_FILE' > '$_target_file'" 2>/dev/null && _install_ok=1
    fi

    if [ "$_found" = "HMA-OSS" ]; then
      for _d in /data/misc/hide_my_applist_*; do
        [ -d "$_d" ] || continue
        if cat "$TEMP_FILE" > "$_d/config.json" 2>/dev/null || su -c "cat '$TEMP_FILE' > '$_d/config.json'" 2>/dev/null; then
          _install_ok=1
        fi
      done
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

unset _installed_pkgs _target_dir _target_file _found _install_ok _d TEMP_FILE
log_i "HMA" "HMA config install complete"
exit 0
