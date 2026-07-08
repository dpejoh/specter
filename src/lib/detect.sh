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
  module_detect "tricky_store"
}

_omk_prop() {
  module_detect "${OMK_MODULE##*/}" && return 0
}

_is_teesimulator() {
  case "$(_ts_prop)" in
    *TEESimulator*) return 0 ;;
  esac
  [ -f "$TRICKY_DIR/spoof_build_vars" ] && return 0
  return 1
}
