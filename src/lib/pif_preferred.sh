# shellcheck shell=sh

pif_product_in_list() {
  [ -n "$2" ] || return 1
  case "$1" in *"\"$2\""*) return 0 ;; esac
  return 1
}

# $1 = live --list JSON, $2 = preferred lines "MODEL|PRODUCT"
# Prints one surviving "MODEL|PRODUCT" line; return 1 if none remain.
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
    pif_product_in_list "$_cpp_list" "$_cpp_product" || continue
    _cpp_ok="${_cpp_ok}${_cpp_model}|${_cpp_product}
"
    _cpp_n=$((_cpp_n + 1))
  done <<EOF
$_cpp_prefs
EOF
  [ "$_cpp_n" -gt 0 ] || { unset _cpp_list _cpp_prefs _cpp_ok _cpp_n _cpp_model _cpp_product _cpp_pick _cpp_line; return 1; }
  _cpp_pick=$(($$ % _cpp_n))
  _cpp_n=0
  while IFS= read -r _cpp_line || [ -n "$_cpp_line" ]; do
    [ -n "$_cpp_line" ] || continue
    if [ "$_cpp_n" -eq "$_cpp_pick" ]; then
      printf '%s\n' "$_cpp_line"
      unset _cpp_list _cpp_prefs _cpp_ok _cpp_n _cpp_model _cpp_product _cpp_pick _cpp_line
      return 0
    fi
    _cpp_n=$((_cpp_n + 1))
  done <<EOF
$_cpp_ok
EOF
  unset _cpp_list _cpp_prefs _cpp_ok _cpp_n _cpp_model _cpp_product _cpp_pick _cpp_line
  return 1
}
