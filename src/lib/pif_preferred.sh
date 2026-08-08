# shellcheck shell=sh

# Keep in sync with webroot/js/pif-device-ui.ts DEVICE_LIST_URLS
PIF_BOT_MIRRORS="\
https://fastly.jsdelivr.net/gh/KOWX712/PlayIntegrityFix@bot/
https://raw.githubusercontent.com/KOWX712/PlayIntegrityFix/bot/
https://gh.sevencdn.com/https://raw.githubusercontent.com/KOWX712/PlayIntegrityFix/bot/"

pif_prop_get() {
  [ -f "$1" ] && [ -n "$2" ] || return 1
  sed -n "s/^$2=//p" "$1" 2>/dev/null | head -1
}

pif_prop_valid() {
  [ -n "$(pif_prop_get "$1" FINGERPRINT)" ] || return 1
  [ -n "$(pif_prop_get "$1" MODEL)" ] || return 1
  return 0
}

pif_product_in_list() {
  [ -n "$2" ] || return 1
  case "$1" in *"\"$2\""*) return 0 ;; esac
  return 1
}

# $1 = module name (from module.prop name=)
pif_prop_dest() {
  case "$1" in
    *Fork*) printf '%s\n' "${PIF_DIR:-/data/adb/modules/playintegrityfix}/custom.pif.prop" ;;
    *) printf '%s\n' "/data/adb/pif.prop" ;;
  esac
}

# Prints device_list.json body; return 1 if all mirrors fail.
pif_fetch_device_list() {
  for _pfdl_base in $PIF_BOT_MIRRORS; do
    _pfdl_body=$(download "${_pfdl_base}device_list.json" 2>/dev/null) || _pfdl_body=""
    case "$_pfdl_body" in
      '['*)
        printf '%s\n' "$_pfdl_body"
        unset _pfdl_body _pfdl_base
        return 0
        ;;
    esac
  done
  unset _pfdl_body _pfdl_base
  return 1
}

# $1 = device list JSON, $2 = preferred lines "MODEL|PRODUCT" or "MODEL|imported:ID"
# Prints one surviving line; return 1 if none remain.
pif_choose_preferred() {
  _cpp_list="$1"
  _cpp_prefs="$2"
  _cpp_ok=""
  _cpp_n=0
  while IFS= read -r _cpp_line || [ -n "$_cpp_line" ]; do
    [ -n "$_cpp_line" ] || continue
    _cpp_model="${_cpp_line%%|*}"
    _cpp_product="${_cpp_line#*|}"
    [ -n "$_cpp_product" ] || continue
    case "$_cpp_product" in
      imported:*)
        _cpp_id="${_cpp_product#imported:}"
        [ -n "$_cpp_id" ] && [ -f "${SPECTER_DIR}/pif_imported/${_cpp_id}.prop" ] || continue
        ;;
      *)
        pif_product_in_list "$_cpp_list" "$_cpp_product" || continue
        ;;
    esac
    _cpp_ok="${_cpp_ok}${_cpp_model}|${_cpp_product}
"
    _cpp_n=$((_cpp_n + 1))
  done <<EOF
$_cpp_prefs
EOF
  [ "$_cpp_n" -gt 0 ] || { unset _cpp_list _cpp_prefs _cpp_ok _cpp_n _cpp_model _cpp_product _cpp_pick _cpp_line _cpp_id; return 1; }
  _cpp_pick=$(($$ % _cpp_n))
  _cpp_n=0
  while IFS= read -r _cpp_line || [ -n "$_cpp_line" ]; do
    [ -n "$_cpp_line" ] || continue
    if [ "$_cpp_n" -eq "$_cpp_pick" ]; then
      printf '%s\n' "$_cpp_line"
      unset _cpp_list _cpp_prefs _cpp_ok _cpp_n _cpp_model _cpp_product _cpp_pick _cpp_line _cpp_id
      return 0
    fi
    _cpp_n=$((_cpp_n + 1))
  done <<EOF
$_cpp_ok
EOF
  unset _cpp_list _cpp_prefs _cpp_ok _cpp_n _cpp_model _cpp_product _cpp_pick _cpp_line _cpp_id
  return 1
}

# $1 = imported id, $2 = destination path (default /data/adb/pif.prop)
pif_apply_imported() {
  _pai_src="${SPECTER_DIR}/pif_imported/${1}.prop"
  _pai_dst="${2:-/data/adb/pif.prop}"
  [ -f "$_pai_src" ] || { unset _pai_src _pai_dst; return 1; }
  cp "$_pai_src" "$_pai_dst" || { unset _pai_src _pai_dst; return 1; }
  unset _pai_src _pai_dst
  return 0
}

# $1 = product (e.g. oriole_beta), $2 = destination path — writes as-is
pif_apply_github_prop() {
  _pag_product="$1"
  _pag_dst="${2:-/data/adb/pif.prop}"
  [ -n "$_pag_product" ] || { unset _pag_product _pag_dst; return 1; }
  _pag_tmp=$(mktemp 2>/dev/null || echo "/data/local/tmp/.specter_pif_${$}")
  for _pag_base in $PIF_BOT_MIRRORS; do
    if download "${_pag_base}device_prop/${_pag_product}.prop" "$_pag_tmp" 2>/dev/null && pif_prop_valid "$_pag_tmp"; then
      cp "$_pag_tmp" "$_pag_dst" || { rm -f "$_pag_tmp"; unset _pag_product _pag_dst _pag_tmp _pag_base; return 1; }
      rm -f "$_pag_tmp"
      unset _pag_product _pag_dst _pag_tmp _pag_base
      return 0
    fi
  done
  rm -f "$_pag_tmp"
  unset _pag_product _pag_dst _pag_tmp _pag_base
  return 1
}
