# shellcheck shell=sh

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

# $1 = live --list JSON, $2 = preferred lines "MODEL|PRODUCT" or "MODEL|imported:ID"
# Prints one surviving line; return 1 if none remain.
# Imported entries need $SPECTER_DIR/pif_imported/ID.prop.
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
