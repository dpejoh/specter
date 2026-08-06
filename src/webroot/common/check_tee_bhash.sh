#!/system/bin/sh
set -e
MODULE_ROOT="${0%/*}"
MODULE_ROOT="${MODULE_ROOT%/webroot/common}"
. "$MODULE_ROOT/lib/common.sh"
. "$MODULE_ROOT/lib/vbmeta.sh"
. "$MODULE_ROOT/lib/tee_apk.sh"

TEMP_DIR="/data/local/tmp/.specter_tee_check"
rm -rf "$TEMP_DIR" && mkdir -p "$TEMP_DIR"

_apk="$MODULE_ROOT/deps/specter.apk"
_bundled_vc=$(tr -d ' \n' < "$MODULE_ROOT/deps/specter.apk.vc" 2>/dev/null || echo 0)
_via_provider=

if pm path "$SPECTER_PKG" >/dev/null 2>&1; then
  _inst_vc=$(dumpsys package "$SPECTER_PKG" 2>/dev/null | grep -m1 'versionCode=' | sed 's/.*versionCode=\([0-9]*\).*/\1/')
  if [ -n "$_inst_vc" ] && specter_vc_newer "$_bundled_vc" "$_inst_vc" && [ -f "$_apk" ]; then
    pm install -r "$_apk" >/dev/null 2>&1 || true
  fi
  ensure_specter_target

  _st=$(content query --uri "content://${SPECTER_PKG}/check" 2>/dev/null | tr ',' '\n' | grep -m1 'status=' | cut -d= -f2 | tr -d ' \r')
  _hash=$(content query --uri "content://${SPECTER_PKG}/hash" 2>/dev/null | tr ',' '\n' | grep -m1 'hash=' | cut -d= -f2 | tr -d ' \r')
  if [ -n "$_st" ]; then
    case "$_st" in
      normal) echo "tee_status=normal"; _broken=false ;;
      broken) echo "tee_status=broken"; _broken=true ;;
      *)      echo "tee_status=unknown"; _broken= ;;
    esac
    mkdir -p "$SPECTER_DIR" 2>/dev/null || true
    if [ -n "$_broken" ]; then
      printf 'tee_broken=%s\n' "$_broken" > "$SPECTER_DIR/tee_status"
    fi
    if [ -n "$_hash" ] && [ "$_hash" != "unavailable" ]; then
      echo "tee_bhash=$_hash"
      printf '%s\n' "$_hash" > "$SPECTER_DIR/tee_bhash"
    fi
    _via_provider=1
  fi
  unset _st _hash _broken _inst_vc
fi

if [ -z "$_via_provider" ]; then
  _dex="$MODULE_ROOT/deps/classes.dex"
  if [ -f "$_dex" ]; then
    su -c "/system/bin/app_process -Djava.class.path='$_dex' / com.dpejoh.specter.Main '$TEMP_DIR'" 2>/dev/null || true

    if [ -f "$TEMP_DIR/tee_status" ]; then
      _val=$(grep -E '^(teeBroken|tee_broken)=' "$TEMP_DIR/tee_status" 2>/dev/null | cut -d= -f2)
      case "$_val" in
        true)  echo "tee_status=broken" ;;
        false) echo "tee_status=normal" ;;
        *)     echo "tee_status=unknown" ;;
      esac
    else
      echo "tee_status=error"
    fi

    if [ -f "$TEMP_DIR/tee_bhash" ]; then
      echo "tee_bhash=$(cat "$TEMP_DIR/tee_bhash")"
    fi

    if [ -f "$TEMP_DIR/tee_tier" ]; then
      echo "tee_tier=$(cat "$TEMP_DIR/tee_tier" | tr -d ' \n')"
    fi

    mkdir -p "$SPECTER_DIR" 2>/dev/null || true
    for _f in tee_status tee_bhash tee_tier tee_keymaster_version; do
      [ -f "$TEMP_DIR/$_f" ] && cp "$TEMP_DIR/$_f" "$SPECTER_DIR/$_f"
    done
    unset _f _val
  else
    echo "tee_status=error (no classes.dex)"
  fi
  unset _dex
fi

_vbmeta_slot=$(getprop ro.boot.slot_suffix 2>/dev/null || echo "")
_vbmeta_dev="/dev/block/by-name/vbmeta${_vbmeta_slot}"
[ -b "$_vbmeta_dev" ] || _vbmeta_dev="/dev/block/by-name/vbmeta"
_vbmeta_hash=$(vbmeta_digest "$_vbmeta_dev" 2>/dev/null || true)
[ -n "$_vbmeta_hash" ] && echo "vbmeta_hash=$_vbmeta_hash"
unset _vbmeta_slot _vbmeta_dev _vbmeta_hash

_bh=$(getprop ro.boot.vbmeta.digest 2>/dev/null || echo "")
[ -n "$_bh" ] && echo "boot_hash=$_bh"
unset _bh _apk _bundled_vc _via_provider

rm -rf "$TEMP_DIR"
