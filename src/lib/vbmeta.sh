# shellcheck shell=bash
# Read big-endian integer (N bytes, default 8) from file/device at offset
_val() {
  _h=$(dd if="$1" bs=1 skip="$2" count="${3:-8}" 2>/dev/null \
    | od -An -tx1 -v | tr -d ' \n')
  echo $((16#${_h:-0}))
}

# Get size of a device or file
_size() {
  blockdev --getsize64 "$1" 2>/dev/null || stat -c%s "$1" 2>/dev/null || return 1
}

# Emit VBMeta blob from a partition (handles AVB footer + raw VBMeta)
emit_vbmeta() {
  _sz=$(_size "$1") || return 1

  # Check last 64 bytes for AVB footer ("AVBf" = hex 41564266)
  _tail=$(dd if="$1" bs=1 skip=$((_sz - 64)) count=64 2>/dev/null \
    | od -An -tx1 -v | tr -d ' \n')
  case "$_tail" in
    *41564266*)
      _prefix="${_tail%%41564266*}"
      _pos=$((_sz - 64 + ${#_prefix} / 2))
      _vb_off=$(_val "$1" $((_pos + 20)))
      _vb_sz=$(_val "$1" $((_pos + 28)))
      dd if="$1" bs=1 skip="$_vb_off" count="$_vb_sz" 2>/dev/null
      return 0
      ;;
  esac

  # Raw VBMeta
  [ "$(dd if="$1" bs=1 count=4 2>/dev/null)" = "AVB0" ] || return 1
  _auth=$(_val "$1" 12)
  _aux=$(_val "$1" 20)
  dd if="$1" bs=$((256 + _auth + _aux)) count=1 2>/dev/null
}

# Calculate full VBMeta digest including chain partitions
vbmeta_digest() {
  _part="$1"

  _auth=$(_val "$_part" 12)
  _aux=$(_val "$_part" 20)
  _desc_off=$(_val "$_part" 96)
  _desc_sz=$(_val "$_part" 104)
  _total=$((256 + _auth + _aux))
  _aux_start=$((256 + _auth))

  _digest=$({
    dd if="$_part" bs=$_total count=1 2>/dev/null
    _pos=$((_aux_start + _desc_off))
    _end=$((_aux_start + _desc_off + _desc_sz))
    while [ "$_pos" -lt "$_end" ]; do
      _tag=$(_val "$_part" "$_pos")
      _nbf=$(_val "$_part" $((_pos + 8)))
      if [ "$_tag" -eq 4 ]; then
        _name_sz=$(_val "$_part" $((_pos + 20)) 4)
        _name=$(dd if="$_part" bs=1 skip=$((_pos + 92)) count="$_name_sz" 2>/dev/null)
        _found=false
        for _d in "/dev/block/by-name/$_name" "/dev/block/bootdevice/by-name/$_name"; do
          if [ -b "$_d" ]; then (emit_vbmeta "$_d") && _found=true && break; fi
        done
        $_found || { _f="$(dirname "$_part")/$_name.img"; [ -f "$_f" ] && (emit_vbmeta "$_f"); }
      fi
      _pos=$((_pos + 16 + _nbf))
    done
  } | sha256sum | cut -d' ' -f1)

  [ -n "$_digest" ] && log_d "VBMETA" "Digest from $_part: $_digest"
  printf '%s' "$_digest"
}
