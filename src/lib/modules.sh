# shellcheck shell=sh

module_detect() {
  _md_id="$1"
  for _md_dir in "$MODULES_BASE/$_md_id" "${MODULES_BASE}_update/$_md_id"; do
    [ -f "$_md_dir/module.prop" ] || continue
    grep "^name=" "$_md_dir/module.prop" 2>/dev/null | cut -d= -f2
    return 0
  done
  return 1
}

install_module_from_github() {
  _mg_repo="$1"
  _mg_name="${2:-$_mg_repo}"

  [ -n "$ROOT_SOL" ] || detect_root_solution
  check_network 2>/dev/null || return 1

  _mg_json=$(download "https://api.github.com/repos/${_mg_repo}/releases/latest" "" 2>/dev/null) || return 1

  _mg_urls=$(echo "$_mg_json" | grep '"browser_download_url":' | sed 's/.*"browser_download_url": *"\([^"]*\)".*/\1/')
  [ -z "$_mg_urls" ] && return 1

  _mg_dl_url=""
  _mg_debug_url=""
  _mg_old_ifs="$IFS"; IFS='
'
  for _mg_url in $_mg_urls; do
    case "$_mg_url" in
      *Debug*) [ -z "$_mg_debug_url" ] && _mg_debug_url="$_mg_url" ;;
      *)       _mg_dl_url="$_mg_url"; break ;;
    esac
  done
  IFS="$_mg_old_ifs"

  if [ -z "$_mg_dl_url" ]; then
    [ -n "$_mg_debug_url" ] || return 1
    _mg_dl_url="$_mg_debug_url"
    log_w "MODULE_INSTALL" "Only Debug release available for $_mg_name, using it"
  fi

  _mg_tmp="/data/local/tmp/.mg_install_$$.zip"
  download "$_mg_dl_url" "$_mg_tmp" 2>/dev/null || {
    rm -f "$_mg_tmp"
    return 1
  }

  _mg_rc=1
  case "$ROOT_SOL" in
    magisk)  magisk --install-module "$_mg_tmp" >/dev/null 2>&1 && _mg_rc=0 ;;
    kernelsu) ksud module install "$_mg_tmp" >/dev/null 2>&1 && _mg_rc=0 ;;
    apatch)  apd module install "$_mg_tmp" >/dev/null 2>&1 && _mg_rc=0 ;;
  esac
  rm -f "$_mg_tmp"

  _mg_rc_final=$_mg_rc
  unset _mg_repo _mg_name _mg_json _mg_urls _mg_dl_url _mg_debug_url _mg_url _mg_tmp _mg_rc _mg_old_ifs
  return $_mg_rc_final
}
