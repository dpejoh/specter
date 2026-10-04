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

# Android has no bc, and a certificate serial does not fit in $(( )).
_dec_mul_add() {
  _dma_n=$1 _dma_mul=$2 _dma_add=$3
  _dma_out="" _dma_carry=$_dma_add
  while [ -n "$_dma_n" ]; do
    _dma_d=${_dma_n#"${_dma_n%?}"}
    _dma_n=${_dma_n%?}
    _dma_prod=$((_dma_d * _dma_mul + _dma_carry))
    _dma_out="$((_dma_prod % 10))${_dma_out}"
    _dma_carry=$((_dma_prod / 10))
  done
  while [ "$_dma_carry" -gt 0 ]; do
    _dma_out="$((_dma_carry % 10))${_dma_out}"
    _dma_carry=$((_dma_carry / 10))
  done
  printf '%s' "${_dma_out:-0}"
  unset _dma_n _dma_mul _dma_add _dma_out _dma_carry _dma_d _dma_prod
}

hex_to_dec() {
  _htd=$(printf '%s' "$1" | tr 'A-F' 'a-f' | sed 's/^0*//')
  [ -n "$_htd" ] || { printf '%s' 0; unset _htd; return 0; }
  _htd_dec=0
  while [ -n "$_htd" ]; do
    _htd_c=${_htd%"${_htd#?}"}
    _htd=${_htd#?}
    case $_htd_c in
      a) _htd_c=10 ;; b) _htd_c=11 ;; c) _htd_c=12 ;;
      d) _htd_c=13 ;; e) _htd_c=14 ;; f) _htd_c=15 ;;
    esac
    _htd_dec=$(_dec_mul_add "$_htd_dec" 16 "$_htd_c")
  done
  printf '%s' "$_htd_dec"
  unset _htd _htd_dec _htd_c
}

check_google_revocation() {
  _gr_serial=$1
  _gr_resp=$(download "$GOOGLE_REVOCATION_URL" 2>/dev/null) || _gr_resp=""
  _gr_list=/tmp/gr_$$.lst
  [ -d /data/local/tmp ] && _gr_list=/data/local/tmp/gr_$$.lst
  cat > "$_gr_list" <<EOF
$_gr_resp
EOF
  if ! grep -q '"entries"' "$_gr_list"; then
    rm -f "$_gr_list"
    unset _gr_serial _gr_resp _gr_list
    return 1
  fi
  _gr_dec=$(hex_to_dec "$_gr_serial")
  _gr_rc=1
  tr '"' '\n' < "$_gr_list" | grep -Fxq "$_gr_dec" && _gr_rc=0
  rm -f "$_gr_list"
  unset _gr_serial _gr_resp _gr_dec _gr_list
  return $_gr_rc
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

# True if catalog entry for SOURCE/VERSION is softbanned.
keybox_is_softbanned() {
  echo "$1" | grep -o '"entries":\[[^]]*\]' | grep -o '{[^}]*"source":"'"$2"'"[^}]*"version":"'"$3"'"[^}]*}' | head -1 | grep -q '"softbanned":true'
}

# Prefer active (non-softbanned) candidates. stdin: one JSON object per line
# with source/version. $1 = full catalog JSON. stdout: preferred pool.
keybox_prefer_active() {
  _kpa_hist="$1"
  _kpa_active=""
  _kpa_soft=""
  while IFS= read -r _kpa_entry || [ -n "$_kpa_entry" ]; do
    [ -z "$_kpa_entry" ] && continue
    _kpa_src=$(echo "$_kpa_entry" | sed 's/.*"source":"\([^"]*\)".*/\1/')
    _kpa_ver=$(echo "$_kpa_entry" | sed 's/.*"version":"\([^"]*\)".*/\1/')
    if keybox_is_softbanned "$_kpa_hist" "$_kpa_src" "$_kpa_ver"; then
      _kpa_soft="${_kpa_soft}${_kpa_entry}
"
    else
      _kpa_active="${_kpa_active}${_kpa_entry}
"
    fi
  done
  if [ -n "$_kpa_active" ]; then
    printf '%s' "$_kpa_active"
  else
    printf '%s' "$_kpa_soft"
  fi
  unset _kpa_hist _kpa_active _kpa_soft _kpa_entry _kpa_src _kpa_ver
}

# Latest version for PROVIDER from catalog, preferring non-softbanned and non-revoked.
keybox_latest_for_provider() {
  _klp_hist="$1"
  _klp_prov="$2"
  _klp_entries=$(echo "$_klp_hist" | grep -o '"entries":\[[^]]*\]' | grep -o '{[^}]*"source":"'"$_klp_prov"'"[^}]*}' | grep -v '"revoked":true')
  _klp_ver=$(printf '%s\n' "$_klp_entries" | grep -v '"softbanned":true' | sed 's/.*"version":"\([^"]*\)".*/\1/' | sort -rn | head -1)
  [ -z "$_klp_ver" ] && _klp_ver=$(printf '%s\n' "$_klp_entries" | grep '"softbanned":true' | sed 's/.*"version":"\([^"]*\)".*/\1/' | sort -rn | head -1)
  echo "$_klp_ver"
  unset _klp_hist _klp_prov _klp_entries _klp_ver
}
