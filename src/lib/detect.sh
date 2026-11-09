# shellcheck shell=sh
ROOT_SOL="${ROOT_SOL:-}"

detect_root_solution() {
    ROOT_TYPE="Unknown"; export ROOT_TYPE
    # Installers and their runtime shells export version markers. Prefer the
    # manager that is actually running us: a stale /data/adb/ksu or
    # /data/adb/magisk directory from another root solution must not decide
    # which hot-install path we take.
    if [ -n "${KSU_VER:-}${KSU_VER_CODE:-}" ]; then
        ROOT_SOL="kernelsu"
        PATH="/data/adb/ksu/bin:$PATH"
    elif [ -n "${APATCH:-}${APATCH_VER:-}${APATCH_VER_CODE:-}" ]; then
        ROOT_SOL="apatch"; ROOT_TYPE="APatch"
        PATH="/data/adb/ap/bin:$PATH"
    elif [ -n "${MAGISK_VER:-}${MAGISK_VER_CODE:-}" ]; then
        ROOT_SOL="magisk"; ROOT_TYPE="Magisk"
        PATH="/data/adb/magisk:$PATH"
    elif [ -x "/data/adb/magisk/magisk" ] && "/data/adb/magisk/magisk" -v >/dev/null 2>&1; then
        # A live Magisk daemon is stronger evidence than any stale directory.
        ROOT_SOL="magisk"; ROOT_TYPE="Magisk"
        PATH="/data/adb/magisk:$PATH"
    elif [ -x "/data/adb/ksud" ] && "/data/adb/ksud" module list >/dev/null 2>&1; then
        # Same for a live KernelSU kernel interface: /data/adb/ksu can be
        # stale after switching managers, but only an active KSU answers this.
        ROOT_SOL="kernelsu"
        PATH="/data/adb/ksu/bin:$PATH"
    elif [ -d "/data/adb/ap" ]; then
        ROOT_SOL="apatch"; ROOT_TYPE="APatch"
        PATH="/data/adb/ap/bin:$PATH"
    elif [ -d "/data/adb/ksu" ]; then
        ROOT_SOL="kernelsu"
        PATH="/data/adb/ksu/bin:$PATH"
    elif [ -f "/data/adb/magisk" ] || [ -f "/data/adb/magisk.db" ]; then
        ROOT_SOL="magisk"; ROOT_TYPE="Magisk"
        PATH="/data/adb/magisk:$PATH"
    elif [ -f "/data/adb/ksud" ]; then
        ROOT_SOL="kernelsu"
        PATH="/data/adb/ksu/bin:$PATH"
    elif [ -f "/data/adb/apd" ]; then
        ROOT_SOL="apatch"; ROOT_TYPE="APatch"
        PATH="/data/adb/ap/bin:$PATH"
    elif command -v resetprop >/dev/null 2>&1; then
        ROOT_SOL="magisk"; ROOT_TYPE="Magisk"
    else
        ROOT_SOL="magisk"; ROOT_TYPE="Unknown"
    fi

    if [ "$ROOT_SOL" = "kernelsu" ]; then
        if [ -f "/data/adb/ksu/.dynamic_sign" ]; then
            ROOT_TYPE="SukiSU-Ultra"
        elif [ -f "/sys/module/kernelsu/parameters/expected_manager_size" ]; then
            ROOT_TYPE="KernelSU-Next"
        else
            ROOT_TYPE="KernelSU"
        fi
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

_teesim_prop() {
  module_detect "teesim"
}

