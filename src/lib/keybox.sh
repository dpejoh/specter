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

hex_to_dec() {
  # Certificate serials are wider than 64 bits, so keep the big-integer
  # conversion in awk instead of a per-digit shell loop with subshells.
  awk -v h="$1" '
    BEGIN {
      h = tolower(h)
      out = "0"
      for (i = 1; i <= length(h); i++) {
        d = index("0123456789abcdef", substr(h, i, 1)) - 1
        if (d < 0) { print ""; exit 1 }
        carry = d
        res = ""
        for (j = length(out); j >= 1; j--) {
          x = (substr(out, j, 1) + 0) * 16 + carry
          res = (x % 10) res
          carry = int(x / 10)
        }
        while (carry > 0) {
          res = (carry % 10) res
          carry = int(carry / 10)
        }
        out = res
      }
      print out
    }
  '
}

# Shared catalog fetch. keybox.sh and keybox_info.sh run back to back in the
# action pipeline; a short cache keeps them from downloading it twice.
keybox_catalog() {
  _kc_cache="$SPECTER_DIR/cache/keybox_catalog.json"
  _kc_ttl="${KEYBOX_CATALOG_TTL:-300}"
  if [ -s "$_kc_cache" ]; then
    _kc_age=$(( $(date +%s) - $(stat -c %Y "$_kc_cache" 2>/dev/null || echo 0) ))
    if [ "$_kc_age" -ge 0 ] && [ "$_kc_age" -lt "$_kc_ttl" ]; then
      cat "$_kc_cache"
      unset _kc_cache _kc_ttl _kc_age
      return 0
    fi
  fi
  _kc_json=$(download "$CATALOG_URL" 2>/dev/null) || _kc_json=""
  if [ -n "$_kc_json" ]; then
    ensure_dir "$SPECTER_DIR/cache"
    printf '%s' "$_kc_json" > "$_kc_cache" 2>/dev/null || true
    printf '%s' "$_kc_json"
    unset _kc_cache _kc_ttl _kc_age _kc_json
    return 0
  fi
  unset _kc_cache _kc_ttl _kc_age _kc_json
  return 1
}

check_google_revocation() {
  _gr_serial=$1
  _gr_cache="$SPECTER_DIR/cache/google_revocation.json"
  _gr_ttl="${GOOGLE_REVOCATION_TTL:-3600}"
  _gr_file=""
  if [ -s "$_gr_cache" ]; then
    _gr_age=$(( $(date +%s) - $(stat -c %Y "$_gr_cache" 2>/dev/null || echo 0) ))
    if [ "$_gr_age" -ge 0 ] && [ "$_gr_age" -lt "$_gr_ttl" ]; then
      _gr_file="$_gr_cache"
    fi
  fi
  if [ -z "$_gr_file" ]; then
    _gr_resp=$(download "$GOOGLE_REVOCATION_URL" 2>/dev/null) || _gr_resp=""
    if [ -n "$_gr_resp" ]; then
      ensure_dir "$SPECTER_DIR/cache"
      cat > "$_gr_cache" <<EOF
$_gr_resp
EOF
      _gr_file="$_gr_cache"
    fi
  fi
  if [ -z "$_gr_file" ] || ! grep -q '"entries"' "$_gr_file"; then
    unset _gr_serial _gr_cache _gr_ttl _gr_file _gr_resp _gr_age
    return 1
  fi
  _gr_dec=$(hex_to_dec "$_gr_serial")
  _gr_rc=1
  grep -Fq "\"$_gr_dec\"" "$_gr_file" && _gr_rc=0
  unset _gr_serial _gr_cache _gr_ttl _gr_file _gr_resp _gr_age _gr_dec
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

# True if an RKP catalog entry has reached its X.509 expiry.
# $1 = one JSON entry, $2 = optional fixed now (UTC ISO) for tests.
keybox_rkp_expired() {
  _kre_entry="$1"
  _kre_now="${2:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}"

  printf '%s' "$_kre_entry" | grep -Eq '"rkp"[[:space:]]*:[[:space:]]*true' || {
    unset _kre_entry _kre_now
    return 1
  }

  _kre_exp=$(printf '%s' "$_kre_entry" | sed -n 's/.*"expires_at"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
  if [ -z "$_kre_exp" ]; then
    unset _kre_entry _kre_now _kre_exp
    return 0
  fi

  _kre_exp=$(printf '%s' "$_kre_exp" | sed 's/\.[0-9]*Z$/Z/')
  case "$_kre_exp" in *Z) ;; *) _kre_exp="${_kre_exp}Z" ;; esac
  _kre_now=$(printf '%s' "$_kre_now" | sed 's/\.[0-9]*Z$/Z/')
  case "$_kre_now" in *Z) ;; *) _kre_now="${_kre_now}Z" ;; esac

  awk -v expiry="$_kre_exp" -v now="$_kre_now" 'BEGIN { exit !(expiry <= now) }'
  _kre_rc=$?
  unset _kre_entry _kre_now _kre_exp
  return $_kre_rc
}

# Drop expired RKP entries from a newline-separated candidate list.
keybox_filter_expired_rkp() {
  while IFS= read -r _kfe_line || [ -n "$_kfe_line" ]; do
    [ -n "$_kfe_line" ] || continue
    keybox_rkp_expired "$_kfe_line" && continue
    printf '%s\n' "$_kfe_line"
  done
  unset _kfe_line
}

# Keep only the RKP entry with the latest expires_at; leave non-RKP entries.
keybox_dedupe_rkp_freshest() {
  awk '
    function field(obj, key,   r) {
      if (!match(obj, "\"" key "\":\"[^\"]*\"")) return ""
      r = substr(obj, RSTART, RLENGTH)
      sub("^\"" key "\":\"", "", r)
      sub("\"$", "", r)
      return r
    }
    {
      if ($0 ~ /"rkp":true/) {
        expiry = field($0, "expires_at")
        if (best == "" || expiry > best) {
          best = expiry
          bestline = $0
        }
      } else {
        print $0
      }
    }
    END { if (bestline != "") print bestline }
  '
}

# Prefer active (non-softbanned) candidates. stdin: one JSON object per line
# with source/version. $1 = full catalog JSON. stdout: preferred pool.
keybox_prefer_active() {
  _kpa_hist="$1"
  KEYBOX_CATALOG="$_kpa_hist" awk '
    function field(obj, key,   r) {
      if (!match(obj, "\"" key "\":\"[^\"]*\"")) return ""
      r = substr(obj, RSTART, RLENGTH)
      sub("^\"" key "\":\"", "", r)
      sub("\"$", "", r)
      return r
    }
    BEGIN {
      hist = ENVIRON["KEYBOX_CATALOG"]
      if (match(hist, /"entries":\[[^]]*\]/)) {
        hist = substr(hist, RSTART, RLENGTH)
      } else {
        hist = ""
      }
      while (match(hist, /\{[^{}]*\}/)) {
        obj = substr(hist, RSTART, RLENGTH)
        hist = substr(hist, RSTART + RLENGTH)
        src = field(obj, "source")
        ver = field(obj, "version")
        if (src != "" && ver != "") {
          soft[src SUBSEP ver] = (obj ~ /"softbanned":true/) ? 1 : 0
        }
      }
    }
    {
      src = field($0, "source")
      ver = field($0, "version")
      if (((src SUBSEP ver) in soft) && soft[src, ver]) {
        softout = softout $0 "\n"
      } else {
        activeout = activeout $0 "\n"
      }
    }
    END {
      if (activeout != "") printf "%s", activeout
      else printf "%s", softout
    }
  '
  unset _kpa_hist
}

# Latest version for PROVIDER from catalog, preferring non-softbanned and non-revoked.
keybox_latest_for_provider() {
  _klp_hist="$1"
  _klp_prov="$2"
  _klp_entries=$(echo "$_klp_hist" | grep -o '"entries":\[[^]]*\]' | grep -o '{[^}]*"source":"'"$_klp_prov"'"[^}]*}' | grep -v '"revoked":true' | keybox_filter_expired_rkp | keybox_dedupe_rkp_freshest)
  _klp_ver=$(printf '%s\n' "$_klp_entries" | grep -v '"softbanned":true' | sed 's/.*"version":"\([^"]*\)".*/\1/' | sort -rn | head -1)
  [ -z "$_klp_ver" ] && _klp_ver=$(printf '%s\n' "$_klp_entries" | grep '"softbanned":true' | sed 's/.*"version":"\([^"]*\)".*/\1/' | sort -rn | head -1)
  echo "$_klp_ver"
  unset _klp_hist _klp_prov _klp_entries _klp_ver
}
