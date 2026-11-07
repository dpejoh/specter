# shellcheck shell=sh
# Alphabet variables are defined in decode.sh (sourced via common.sh)

# Report validity of every PEM certificate in a keybox. Android does not
# consistently provide openssl, so read the X.509 DER validity fields with
# standard shell tools. Unknown or malformed certificates fail closed.
keybox_cert_validity() {
  (
    _kv_dir=$(mktemp -d "${TMPDIR:-/data/local/tmp}/specter-cert.XXXXXX") || { echo unknown; exit; }
    trap 'rm -rf "$_kv_dir"; rm -f "$_kv_dir.der"' EXIT
    awk -v dir="$_kv_dir" '
      /-----BEGIN CERTIFICATE-----/ { if (inside) { bad=1; exit } inside=1; n++; next }
      /-----END CERTIFICATE-----/ { if (!inside) { bad=1; exit } close(dir "/" n); inside=0; next }
      inside { gsub(/[[:space:]]/, ""); print > (dir "/" n) }
      END { if (bad || inside || !n) exit 1 }
    ' "$1" || { echo unknown; exit; }
    _kv_now=${2:-$(date -u +%Y%m%d%H%M%S 2>/dev/null)}
    case "$_kv_now" in *[!0-9]*|"") echo unknown; exit ;; esac
    _kv_result=valid
    for _kv_file in "$_kv_dir"/*; do
      base64 -d < "$_kv_file" > "$_kv_dir.der" 2>/dev/null || { _kv_result=unknown; break; }
      _kv_status=$(od -An -v -tx1 "$_kv_dir.der" | tr -d ' \n' | awk -v now="$_kv_now" '
        function byte(p) { return index("0123456789abcdef", substr(hex,p,1))-1 }
        function number(p) { return byte(p)*16+byte(p+1) }
        function tlv(p, limit,  len,n,i) {
          if (p+3>limit || byte(p)<0 || byte(p+1)<0) return 0
          tag=substr(hex,p,2); len=number(p+2); p+=4
          if (len>=128) {
            n=len-128; if (n<1 || n>4 || p+n*2-1>limit) return 0
            len=0; for (i=0;i<n;i++) len=len*256+number(p+i*2); p+=n*2
          }
          start=p; end=p+len*2-1; nextpos=end+1
          return end<=limit
        }
        function xtime(p,e,  s,i,c,y) {
          s=""; for (i=p;i<=e;i+=2) { c=number(i); if(c<0 || c>127) return ""; s=s sprintf("%c",c) }
          if (tag=="17" && s ~ /^[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]Z$/) {
            y=substr(s,1,2)+0; return (y>=50 ? "19" : "20") substr(s,1,12)
          }
          if (tag=="18" && s ~ /^[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]Z$/) return substr(s,1,14)
          return ""
        }
        { hex=tolower($0); limit=length(hex)
          if (!tlv(1,limit) || tag!="30" || nextpos!=limit+1) exit 1
          if (!tlv(start,end) || tag!="30") exit 1
          tbsend=end; p=start
          if (!tlv(p,tbsend)) exit 1
          if (tag=="a0") { p=nextpos; if (!tlv(p,tbsend)) exit 1 }
          if (tag!="02") exit 1
          p=nextpos; if (!tlv(p,tbsend) || tag!="30") exit 1
          p=nextpos; if (!tlv(p,tbsend) || tag!="30") exit 1
          p=nextpos; if (!tlv(p,tbsend) || tag!="30") exit 1
          vend=end; p=start
          if (!tlv(p,vend)) exit 1; before=xtime(start,end); p=nextpos
          if (!tlv(p,vend)) exit 1; after=xtime(start,end)
          if (before=="" || after=="" || before>after) exit 1
          if (now<before) print "not_yet_valid"; else if (now>after) print "expired"; else print "valid"
        }
      ') || _kv_status=unknown
      case "$_kv_status" in valid) ;; expired|not_yet_valid) _kv_result=$_kv_status; break ;; *) _kv_result=unknown; break ;; esac
    done
    rm -f "$_kv_dir.der"
    echo "$_kv_result"
  )
}

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
  # Providers/softbans move slowly; Google revocation is checked separately.
  # An app-open --fresh check bypasses this cache.
  _kc_ttl="${KEYBOX_CATALOG_TTL:-1800}"
  if [ -s "$_kc_cache" ]; then
    _kc_age=$(( $(date +%s) - $(stat -c %Y "$_kc_cache" 2>/dev/null || echo 0) ))
    if [ "$_kc_age" -ge 0 ] && [ "$_kc_age" -lt "$_kc_ttl" ]; then
      cat "$_kc_cache"
      unset _kc_cache _kc_ttl _kc_age
      return 0
    fi
  fi
  _kc_json=""
  for _kc_url in "$CATALOG_URL" "$CATALOG_URL_FALLBACK"; do
    [ -n "$_kc_url" ] || continue
    _kc_try=$(download "$_kc_url" 2>/dev/null) || _kc_try=""
    case "$_kc_try" in
      *'"entries"'*) _kc_json="$_kc_try"; break ;;
    esac
  done

  if [ -n "$_kc_json" ]; then
    ensure_dir "$SPECTER_DIR/cache"
    printf '%s' "$_kc_json" > "$_kc_cache" 2>/dev/null || true
    printf '%s' "$_kc_json"
    unset _kc_cache _kc_ttl _kc_age _kc_json _kc_url _kc_try
    return 0
  fi

  # A valid stale catalog is better than an outage: never overwrite the cache
  # with an error body, and keep serving the last known good copy.
  if [ -s "$_kc_cache" ] && grep -q '"entries"' "$_kc_cache" 2>/dev/null; then
    cat "$_kc_cache"
    unset _kc_cache _kc_ttl _kc_age _kc_json _kc_url _kc_try
    return 0
  fi

  unset _kc_cache _kc_ttl _kc_age _kc_json _kc_url _kc_try
  return 1
}

# True when the catalog cache is still within its TTL, so callers can skip a
# network probe before reusing it.
keybox_catalog_fresh() {
  _kcf_cache="$SPECTER_DIR/cache/keybox_catalog.json"
  _kcf_ttl="${KEYBOX_CATALOG_TTL:-300}"
  [ -s "$_kcf_cache" ] || { unset _kcf_cache _kcf_ttl; return 1; }
  _kcf_age=$(( $(date +%s) - $(stat -c %Y "$_kcf_cache" 2>/dev/null || echo 0) ))
  if [ "$_kcf_age" -ge 0 ] && [ "$_kcf_age" -lt "$_kcf_ttl" ]; then
    unset _kcf_cache _kcf_ttl _kcf_age
    return 0
  fi
  unset _kcf_cache _kcf_ttl _kcf_age
  return 1
}

# Print the path to a fresh (or newly downloaded) Google revocation cache.
_google_revocation_cache_file() {
  _grc_cache="$SPECTER_DIR/cache/google_revocation.json"
  _grc_ttl="${GOOGLE_REVOCATION_TTL:-3600}"
  _grc_file=""
  if [ -s "$_grc_cache" ]; then
    _grc_age=$(( $(date +%s) - $(stat -c %Y "$_grc_cache" 2>/dev/null || echo 0) ))
    if [ "$_grc_age" -ge 0 ] && [ "$_grc_age" -lt "$_grc_ttl" ]; then
      _grc_file="$_grc_cache"
    fi
  fi
  if [ -z "$_grc_file" ]; then
    _grc_resp=$(download "$GOOGLE_REVOCATION_URL" 2>/dev/null) || _grc_resp=""
    if [ -n "$_grc_resp" ]; then
      ensure_dir "$SPECTER_DIR/cache"
      cat > "$_grc_cache" <<EOF
$_grc_resp
EOF
      _grc_file="$_grc_cache"
    fi
  fi
  [ -n "$_grc_file" ] && grep -q '"entries"' "$_grc_file" 2>/dev/null && printf '%s\n' "$_grc_file"
  unset _grc_cache _grc_ttl _grc_file _grc_resp _grc_age
}

# Print "STATUS|REASON" for a certificate serial, or nothing when not listed.
# Google keys are decimal; the keybox serial is hexadecimal.
google_revocation_info() {
  _gri_file=$(_google_revocation_cache_file 2>/dev/null || true)
  [ -n "$_gri_file" ] || return 1
  _gri_dec=$(hex_to_dec "$1")
  [ -n "$_gri_dec" ] || { unset _gri_file _gri_dec; return 1; }
  _gri_obj=$(tr -d '\n\r' < "$_gri_file" 2>/dev/null \
    | grep -o "\"$_gri_dec\"[[:space:]]*:[[:space:]]*{[^}]*}" 2>/dev/null \
    | head -1 || true)
  if [ -z "$_gri_obj" ]; then
    unset _gri_file _gri_dec _gri_obj
    return 1
  fi
  _gri_status=$(printf '%s' "$_gri_obj" | sed -n 's/.*"status"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
  [ -n "$_gri_status" ] || { unset _gri_file _gri_dec _gri_obj _gri_status; return 1; }
  _gri_reason=$(printf '%s' "$_gri_obj" | sed -n 's/.*"reason"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
  printf '%s|%s\n' "$_gri_status" "$_gri_reason"
  unset _gri_file _gri_dec _gri_obj _gri_status _gri_reason
}

check_google_revocation() {
  [ -n "$(google_revocation_info "$1")" ]
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

# Print the active catalog entry for SOURCE/VERSION, if one exists.
# Revoked, softbanned, and expired RKP entries are treated as inactive.
keybox_select_entry() {
  _kse_hist="$1" _kse_src="$2" _kse_ver="$3"
  printf '%s' "$_kse_hist" \
    | grep -o '"entries":\[[^]]*\]' \
    | grep -o '{[^}]*}' \
    | grep -v '"revoked":true' \
    | grep -v '"softbanned":true' \
    | keybox_filter_expired_rkp \
    | awk -v src="$_kse_src" -v ver="$_kse_ver" \
        'index($0, "\"source\":\"" src "\"") && index($0, "\"version\":\"" ver "\"") { print; exit }'
  unset _kse_hist _kse_src _kse_ver
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
