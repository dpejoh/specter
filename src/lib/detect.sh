# shellcheck shell=sh
ROOT_SOL="${ROOT_SOL:-}"

detect_root_solution() {
    ROOT_TYPE="Unknown"; export ROOT_TYPE
    if [ -d "/data/adb/ap" ]; then
        ROOT_SOL="apatch"; ROOT_TYPE="APatch"
    elif [ -d "/data/adb/ksu" ]; then
        ROOT_SOL="kernelsu"
        if [ -f "/data/adb/ksu/.dynamic_sign" ]; then
            ROOT_TYPE="SukiSU-Ultra"
        elif [ -f "/sys/module/kernelsu/parameters/expected_manager_size" ]; then
            ROOT_TYPE="KernelSU-Next"
        else
            ROOT_TYPE="KernelSU"
        fi
    elif [ -f "/data/adb/magisk" ] || [ -f "/data/adb/magisk.db" ]; then
        ROOT_SOL="magisk"; ROOT_TYPE="Magisk"
    elif [ -f "/data/adb/ksud" ]; then
        ROOT_SOL="kernelsu"; ROOT_TYPE="KernelSU"
    elif [ -f "/data/adb/apd" ]; then
        ROOT_SOL="apatch"; ROOT_TYPE="APatch"
    elif command -v resetprop >/dev/null 2>&1; then
        ROOT_SOL="magisk"; ROOT_TYPE="Magisk"
    else
        ROOT_SOL="legacy"; ROOT_TYPE="Legacy"
    fi
}

_pif_prop() {
  [ ! -d "/data/adb/Box-Brain" ] || return 1
  [ -f "/data/adb/modules/playintegrityfix/module.prop" ] || return 1
  grep "^name=" "/data/adb/modules/playintegrityfix/module.prop" 2>/dev/null | cut -d= -f2
}

_ts_prop() {
  for _ts_dir in /data/adb/modules/tricky_store /data/adb/modules_update/tricky_store; do
    [ -f "$_ts_dir/module.prop" ] || continue
    grep "^name=" "$_ts_dir/module.prop" 2>/dev/null | cut -d= -f2
    return 0
  done
  echo ""
}

_is_teesimulator() {
  case "$(_ts_prop)" in
    *TEESimulator*) return 0 ;;
  esac
  [ -f "/data/adb/tricky_store/spoof_build_vars" ] && return 0
  return 1
}
