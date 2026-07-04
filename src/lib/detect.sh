# shellcheck shell=sh
ROOT_SOL="${ROOT_SOL:-}"

detect_root_solution() {
    ROOT_TYPE="Unknown"; export ROOT_TYPE
    if [ -d "/data/adb/ap" ]; then
        ROOT_SOL="apatch"; ROOT_TYPE="APatch"
        PATH="/data/adb/ap/bin:$PATH"
    elif [ -d "/data/adb/ksu" ]; then
        ROOT_SOL="kernelsu"
        PATH="/data/adb/ksu/bin:$PATH"
        if [ -f "/data/adb/ksu/.dynamic_sign" ]; then
            ROOT_TYPE="SukiSU-Ultra"
        elif [ -f "/sys/module/kernelsu/parameters/expected_manager_size" ]; then
            ROOT_TYPE="KernelSU-Next"
        else
            ROOT_TYPE="KernelSU"
        fi
    elif [ -f "/data/adb/magisk" ] || [ -f "/data/adb/magisk.db" ]; then
        ROOT_SOL="magisk"; ROOT_TYPE="Magisk"
        PATH="/data/adb/magisk:$PATH"
    elif [ -f "/data/adb/ksud" ]; then
        ROOT_SOL="kernelsu"; ROOT_TYPE="KernelSU"
        PATH="/data/adb/ksu/bin:$PATH"
    elif [ -f "/data/adb/apd" ]; then
        ROOT_SOL="apatch"; ROOT_TYPE="APatch"
        PATH="/data/adb/ap/bin:$PATH"
    elif command -v resetprop >/dev/null 2>&1; then
        ROOT_SOL="magisk"; ROOT_TYPE="Magisk"
    else
        ROOT_SOL="magisk"; ROOT_TYPE="Unknown"
    fi
    export PATH
}

_pif_prop() {
  module_detect "playintegrityfix"
}

_zygisk_variant() {
  for _zd in /data/adb/modules/* /data/adb/modules_update/*; do
    [ -d "$_zd" ] || continue
    [ -f "$_zd/lib32/libzygisk.so" ] || [ -f "$_zd/lib64/libzygisk.so" ] || continue
    grep "^name=" "$_zd/module.prop" 2>/dev/null | cut -d= -f2
    return 0
  done
  if [ -d "/data/adb/magisk" ]; then
    _z=$(magisk --sqlite "SELECT value FROM settings WHERE key='zygisk';" 2>/dev/null)
    [ "$_z" = "value=1" ] && echo "Magisk built-in" && return 0
  fi
  echo ""
}

_ts_prop() {
  for _ts_dir in "$MODULES_BASE/tricky_store" "${MODULES_BASE}_update/tricky_store"; do
    [ -f "$_ts_dir/module.prop" ] || continue
    grep "^name=" "$_ts_dir/module.prop" 2>/dev/null | cut -d= -f2
    return 0
  done
  echo ""
}

# Case-insensitive scan: OMK's installed folder name isn't guaranteed to be
# exactly "OhMyKeymint" across forks/manual installs.
_omk_prop() {
  for _omk_base in "$MODULES_BASE" "${MODULES_BASE}_update"; do
    [ -d "$_omk_base" ] || continue
    for _omk_dir in "$_omk_base"/*; do
      [ -f "$_omk_dir/module.prop" ] || continue
      case "$(basename "$_omk_dir")" in
        [Oo]h[Mm]y[Kk]eymint|omk|OMK)
          grep "^name=" "$_omk_dir/module.prop" 2>/dev/null | cut -d= -f2
          return 0
          ;;
      esac
    done
  done
  [ -f "$OMK_MODULE/module.prop" ] && { grep "^name=" "$OMK_MODULE/module.prop" 2>/dev/null | cut -d= -f2; return 0; }
  echo ""
}

_is_teesimulator() {
  case "$(_ts_prop)" in
    *TEESimulator*) return 0 ;;
  esac
  [ -f "$TRICKY_DIR/spoof_build_vars" ] && return 0
  return 1
}
