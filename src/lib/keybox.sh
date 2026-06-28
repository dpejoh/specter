# shellcheck shell=sh
# Alphabet variables are defined in decode.sh (sourced via common.sh)

decode_keybox_blob() {
  _dkb_in="$1" _dkb_out="$2"
  _dkb_tmp="/data/local/tmp/_dkb_$$.tmp"
  decode_substitution "$_dkb_in" "$_dkb_tmp" 2>/dev/null || { rm -f "$_dkb_tmp"; return 1; }
  base64 -d < "$_dkb_tmp" > "$_dkb_out" 2>/dev/null || { rm -f "$_dkb_tmp"; return 1; }
  rm -f "$_dkb_tmp"
  unset _dkb_in _dkb_out _dkb_tmp
}

# shellcheck disable=SC3057,SC3052
_parse_serial() {
  _h="$1"
  case "${_h:0:1}" in "") return 1 ;; esac 2>/dev/null || { log_w "KEYBOX" "Shell lacks string slicing, skipping serial decode"; return 1; }
  case "$_h" in 30*) _h="${_h#30}" ;; *) return 1 ;; esac
  _l_hex="${_h:0:2}" _l_dec=$((16#$_l_hex))
  [ $_l_dec -ge 128 ] && _h="${_h:2 + ($_l_dec - 128) * 2}" || _h="${_h:2}"

  case "$_h" in 30*) _h="${_h#30}" ;; *) return 1 ;; esac
  _l_hex="${_h:0:2}" _l_dec=$((16#$_l_hex))
  [ $_l_dec -ge 128 ] && _h="${_h:2 + ($_l_dec - 128) * 2}" || _h="${_h:2}"

  case "$_h" in
    a0*)
      _ctx_len_hex="${_h:2:2}"
      _ctx_len=$((16#$_ctx_len_hex))
      _h="${_h:4 + _ctx_len * 2}"
      ;;
  esac

  case "$_h" in 02*) _h="${_h#02}" ;; *) return 1 ;; esac
  _l_hex="${_h:0:2}" _l_dec=$((16#$_l_hex))
  if [ $_l_dec -ge 128 ]; then
    _n=$((_l_dec - 128))
    _sl=$((16#${_h:2:_n * 2}))
    _serial_hex="${_h:2 + _n * 2:$_sl * 2}"
  else
    _serial_hex="${_h:2:$_l_dec * 2}"
  fi

  _serial=$(echo "$_serial_hex" | sed 's/^0*//')
  [ -z "$_serial" ] && _serial="0"
  return 0
}

decode_keybox_serial() {
  _b64=$(sed -n '/-----BEGIN CERTIFICATE-----/,/-----END CERTIFICATE-----/p; /-----END CERTIFICATE-----/q' "$1" | grep -v 'CERTIFICATE' | sed 's/^[[:space:]]*//' | tr -d '\n')
  [ -z "$_b64" ] && return 1
  _hex=$(echo "$_b64" | base64 -d 2>/dev/null | od -v -tx1 | awk 'BEGIN{ORS=""} {for(i=2;i<=NF;i++) printf "%s", $i}')
  [ -z "$_hex" ] && return 1
  _parse_serial "$_hex" || return 1
  echo "$_serial"
}

check_google_revocation() {
  _gr_serial="$1"
  _gr_resp=$(download "$GOOGLE_REVOCATION_URL" 2>/dev/null)
  [ -z "$_gr_resp" ] && return 1

  echo "$_gr_resp" | grep -q "\"$_gr_serial\"" && return 0

  if command -v bc >/dev/null 2>&1; then
    _gr_dec=$(echo "ibase=16; $(echo "$_gr_serial" | tr 'a-f' 'A-F')" | bc 2>/dev/null)
    [ -n "$_gr_dec" ] && echo "$_gr_resp" | grep -q "\"$_gr_dec\"" && return 0
  fi

  return 1
}

find_kmInstallKeybox() {
  _fk_abi=$(getprop ro.product.cpu.abi 2>/dev/null || echo "arm64")
  _fk_lib_dir="/vendor/lib64"
  [ "$_fk_abi" != "arm64" ] && [ "$_fk_abi" != "x86_64" ] && _fk_lib_dir="/vendor/lib"
  _fk_bin=""
  for _fk_dir in "$_fk_lib_dir/hw" "$_fk_lib_dir" "/vendor/bin"; do
    _fk_bin=$(find "$_fk_dir" -iname "*kmInstallKeybox*" 2>/dev/null | head -1)
    [ -n "$_fk_bin" ] && break
  done
  echo "${_fk_bin:-}"
  unset _fk_abi _fk_lib_dir _fk_bin _fk_dir
}
