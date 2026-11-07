# shellcheck shell=ksh

if [ -n "$MODDIR" ]; then
  case "$MODDIR" in */features) _root="${MODDIR%/*}" ;; *) _root="$MODDIR" ;; esac
elif [ -n "$MODULE_ROOT" ]; then
  _root="$MODULE_ROOT"
else
  _d="${0%/*}"
  case "$_d" in */lib) _root="${_d%/lib}" ;; */features) _root="${_d%/features}" ;; */webroot/common) _root="${_d%/webroot/common}" ;; *) _root="$_d" ;; esac
  unset _d
fi

. "$_root/lib/log.sh"
case "${1:-}" in --list|--list-raw|--get) export SPECTER_LOG_FD=2 ;; esac
. "$_root/lib/constants.sh"
. "$_root/lib/network.sh"
. "$_root/lib/modules.sh"
. "$_root/lib/detect.sh"
. "$_root/lib/props.sh"
. "$_root/lib/keybox.sh"
. "$_root/lib/teesim.sh"
. "$_root/lib/keystore_toml.sh"
. "$_root/lib/keystore_txt.sh"
. "$_root/lib/keystore_ini.sh"
. "$_root/lib/keystore.sh"
. "$_root/lib/conflicts.sh"
. "$_root/lib/hma.sh"

[ "$(cfg_get dev_mode false 2>/dev/null)" = "true" ] && export SPECTER_LOG_LEVEL=debug

# One WebUI state read is much faster than four root-shell reads.
write_webui_state() {
  _ws_root="${MODULE_ROOT:-${MODDIR:-}}"
  case "$_ws_root" in
    */features|*/lib|*/webroot/common) _ws_root="${_ws_root%/*}" ;;
  esac
  [ -n "$_ws_root" ] || return 0
  _ws_dir="$_ws_root/webroot/json"
  [ -d "$_ws_dir" ] || return 0

  _ws_info=$(cat "$_ws_dir/info.json" 2>/dev/null || true)
  _ws_modules=$(cat "$_ws_dir/modules_state.json" 2>/dev/null || true)
  _ws_keybox=$(cat "$_ws_dir/keybox_info.json" 2>/dev/null || true)
  _ws_keystore=$(cat "$_ws_dir/keystore_manager.json" 2>/dev/null || true)
  _ws_monet=$(cat "$_ws_dir/monet.json" 2>/dev/null || true)
  [ -n "$_ws_info" ] || _ws_info=null
  [ -n "$_ws_modules" ] || _ws_modules=null
  [ -n "$_ws_keybox" ] || _ws_keybox=null
  [ -n "$_ws_keystore" ] || _ws_keystore=null
  [ -n "$_ws_monet" ] || _ws_monet=null

  # Snapshot config too, avoiding a startup shell read.
  _ws_cfg='{'
  _ws_sep=''
  for _ws_f in "$SPECTER_DIR/config/val"/*.val; do
    [ -f "$_ws_f" ] || continue
    _ws_k="${_ws_f##*/}"; _ws_k="${_ws_k%.val}"
    _ws_v=''
    IFS= read -r _ws_v < "$_ws_f" || true
    if [ -n "$_ws_v" ]; then
      # Avoid one command-substitution subshell per config value.
      _ws_esc="$_ws_v"
      _ws_esc=${_ws_esc//\\/\\\\}
      _ws_esc=${_ws_esc//\"/\\\"}
      _ws_cfg="${_ws_cfg}${_ws_sep}\"${_ws_k}\":\"${_ws_esc}\""
    else
      _ws_cfg="${_ws_cfg}${_ws_sep}\"${_ws_k}\":null"
    fi
    _ws_sep=','
  done
  _ws_cfg="${_ws_cfg}}"

  _ws_tmp="$_ws_dir/.state.json.tmp"
  if printf '{"info":%s,"modules":%s,"keybox":%s,"keystore":%s,"monet":%s,"config":%s,"config_ts":%s}\n' \
      "$_ws_info" "$_ws_modules" "$_ws_keybox" "$_ws_keystore" "$_ws_monet" "$_ws_cfg" "$(date +%s)" > "$_ws_tmp" 2>/dev/null; then
    mv "$_ws_tmp" "$_ws_dir/state.json" 2>/dev/null || rm -f "$_ws_tmp" 2>/dev/null
    chmod 644 "$_ws_dir/state.json" 2>/dev/null || true
  fi
  unset _ws_root _ws_dir _ws_info _ws_modules _ws_keybox _ws_keystore _ws_monet _ws_cfg _ws_sep _ws_f _ws_k _ws_v _ws_esc _ws_tmp
}

# Pick the bundled inotifyd binary for this architecture and install it as
# deps/inotifyd. Fresh installs run this from customize.sh; hot installs must
# call it too because they never execute customize.sh.
install_inotifyd() {
  _ii_root="${1:-${MODULE_ROOT:-${MODDIR:-}}}"
  case "$_ii_root" in
    */features|*/lib|*/webroot/common) _ii_root="${_ii_root%/*}" ;;
  esac
  [ -n "$_ii_root" ] && [ -d "$_ii_root/deps" ] || return 0

  _ii_arch=$(uname -m 2>/dev/null || echo "")
  _ii_src=""
  case "$_ii_arch" in
    aarch64) _ii_src="inotifyd64" ;;
    armv7l|armv8l) _ii_src="inotifyd32" ;;
    x86_64) _ii_src="inotifyd_x86_64" ;;
    i686|i386) _ii_src="inotifyd_x86" ;;
  esac

  if [ -n "$_ii_src" ] && [ -f "$_ii_root/deps/$_ii_src" ]; then
    mv -f "$_ii_root/deps/$_ii_src" "$_ii_root/deps/inotifyd" 2>/dev/null || true
  fi

  if [ -f "$_ii_root/deps/inotifyd" ]; then
    chmod 0755 "$_ii_root/deps/inotifyd" 2>/dev/null || true
    for _ii_f in inotifyd64 inotifyd32 inotifyd_x86_64 inotifyd_x86; do
      [ -f "$_ii_root/deps/$_ii_f" ] && rm -f "$_ii_root/deps/$_ii_f" 2>/dev/null || true
    done
  fi
  unset _ii_root _ii_arch _ii_src _ii_f
}

unset _root
