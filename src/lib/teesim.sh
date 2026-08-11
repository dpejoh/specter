# shellcheck shell=sh
# JingMatrix TEESimulator — profiles.default in config.json via IR (awk; shell was too slow):
#   P id | K keybox | M mode | O osVersion | S/V/B patch | I field val | A pkg

_teesim_to_ir() {
  _tti_file="$1"
  [ -f "$_tti_file" ] || { unset _tti_file; return 1; }
  awk '
    BEGIN {
      while ((getline line < ARGV[1]) > 0) raw = raw line "\n"
      close(ARGV[1])
      ARGV[1] = ""
      n = split_json(raw, tok)
      i = 1
      while (i <= n) {
        if (tok[i] == "\"profiles\"" && tok[i+1] == ":") {
          i += 2
          if (tok[i] != "{") { i++; continue }
          i++
          while (i <= n && tok[i] != "}") {
            if (tok[i] ~ /^"/) {
              id = unquote(tok[i]); i++
              if (tok[i] == ":") i++
              if (tok[i] != "{") continue
              print "P " id
              i = parse_profile(++i, tok, n)
              if (tok[i] == ",") i++
              continue
            }
            i++
          }
          break
        }
        i++
      }
    }

    function unquote(s) {
      gsub(/^"/, "", s); gsub(/"$/, "", s)
      gsub(/\\"/, "\"", s); gsub(/\\\\/, "\\", s)
      return s
    }

    function parse_profile(i, tok, n,   key, val) {
      while (i <= n && tok[i] != "}") {
        if (tok[i] !~ /^"/) { i++; continue }
        key = unquote(tok[i]); i++
        if (tok[i] == ":") i++
        if (key == "apps" && tok[i] == "[") {
          i++
          while (i <= n && tok[i] != "]") {
            if (tok[i] ~ /^"/) print "A " unquote(tok[i])
            i++
          }
          if (tok[i] == "]") i++
        } else if (key == "patchLevel" && tok[i] == "{") {
          i++
          while (i <= n && tok[i] != "}") {
            if (tok[i] ~ /^"/) {
              val = unquote(tok[i]); i++
              if (tok[i] == ":") i++
              if (tok[i] ~ /^"/) {
                if (val == "system") print "S " unquote(tok[i])
                else if (val == "vendor") print "V " unquote(tok[i])
                else if (val == "boot") print "B " unquote(tok[i])
                i++
              }
            } else i++
          }
          if (tok[i] == "}") i++
        } else if (tok[i] ~ /^"/) {
          val = unquote(tok[i]); i++
          if (key == "keybox") print "K " val
          else if (key == "mode") print "M " val
          else if (key == "osVersion") print "O " val
          else if (key == "brand" || key == "device" || key == "product" ||
                   key == "manufacturer" || key == "model" || key == "serial" ||
                   key == "imei" || key == "meid" || key == "imei2")
            print "I " key " " val
        } else if (tok[i] == "{" || tok[i] == "[") {
          i = skip_value(i, tok, n)
        } else {
          i++
        }
        if (tok[i] == ",") i++
      }
      if (tok[i] == "}") i++
      return i
    }

    function skip_value(i, tok, n,   depth, t) {
      t = tok[i]
      if (t == "{") {
        depth = 1; i++
        while (i <= n && depth > 0) {
          if (tok[i] == "{") depth++
          else if (tok[i] == "}") depth--
          i++
        }
        return i
      }
      if (t == "[") {
        depth = 1; i++
        while (i <= n && depth > 0) {
          if (tok[i] == "[") depth++
          else if (tok[i] == "]") depth--
          i++
        }
        return i
      }
      return i + 1
    }

    function split_json(s, out,   i, c, n, q, esc, buf) {
      n = 0; i = 1; buf = ""
      while (i <= length(s)) {
        c = substr(s, i, 1)
        if (c ~ /[ \t\r\n]/) { i++; continue }
        if (c == "\"" ) {
          q = "\""; esc = 0; i++
          while (i <= length(s)) {
            c = substr(s, i, 1)
            q = q c
            if (esc) esc = 0
            else if (c == "\\") esc = 1
            else if (c == "\"") { i++; break }
            i++
          }
          out[++n] = q
          continue
        }
        if (c ~ /[{}\[\]:,]/) { out[++n] = c; i++; continue }
        buf = ""
        while (i <= length(s)) {
          c = substr(s, i, 1)
          if (c ~ /[ \t\r\n{}\[\]:,]/) break
          buf = buf c; i++
        }
        if (buf != "") out[++n] = buf
      }
      return n
    }
  ' "$_tti_file"
  unset _tti_file
}

_teesim_from_ir() {
  awk '
    BEGIN {
      nprof = 0
    }
    /^P / {
      id = substr($0, 3)
      nprof++
      order[nprof] = id
      keybox[id] = "keybox.xml"
      mode[id] = "patch"
      osver[id] = ""
      sys[id] = "today"; vend[id] = "YYYY-MM-05"; boot[id] = "YYYY-MM-05"
      napps[id] = 0
      next
    }
    /^K / { keybox[id] = substr($0, 3); next }
    /^M / { mode[id] = substr($0, 3); next }
    /^O / { osver[id] = substr($0, 3); next }
    /^S / { sys[id] = substr($0, 3); next }
    /^V / { vend[id] = substr($0, 3); next }
    /^B / { boot[id] = substr($0, 3); next }
    /^I / {
      rest = substr($0, 3)
      sp = index(rest, " ")
      if (sp == 0) next
      field = substr(rest, 1, sp - 1)
      val = substr(rest, sp + 1)
      ident[id, field] = val
      next
    }
    /^A / {
      napps[id]++
      apps[id, napps[id]] = substr($0, 3)
      next
    }
    END {
      nkeep = 0
      for (p = 1; p <= nprof; p++) {
        id = order[p]
        if (napps[id] < 1) continue
        keep[++nkeep] = id
      }
      if (nkeep < 1) exit 1
      print "{"
      print "  \"version\": 1,"
      print "  \"profiles\": {"
      for (p = 1; p <= nkeep; p++) {
        id = keep[p]
        printf "    \"%s\": {\n", jesc(id)
        printf "      \"keybox\": \"%s\",\n", jesc(keybox[id])
        printf "      \"mode\": \"%s\",\n", jesc(mode[id])
        printf "      \"patchLevel\": { \"system\": \"%s\", \"vendor\": \"%s\", \"boot\": \"%s\" },\n", \
          jesc(sys[id]), jesc(vend[id]), jesc(boot[id])
        printf "      \"osVersion\": \"%s\",\n", jesc(osver[id])
        n = split("brand device product manufacturer model serial imei meid imei2", fields, " ")
        for (fi = 1; fi <= n; fi++) {
          f = fields[fi]
          v = ((id SUBSEP f) in ident) ? ident[id, f] : ""
          printf "      \"%s\": \"%s\",\n", f, jesc(v)
        }
        print "      \"apps\": ["
        for (a = 1; a <= napps[id]; a++) {
          comma = (a < napps[id]) ? "," : ""
          printf "        \"%s\"%s\n", jesc(apps[id, a]), comma
        }
        printf "      ]\n"
        if (p < nkeep) print "    },"
        else print "    }"
      }
      print "  }"
      print "}"
    }
    function jesc(s) {
      gsub(/\\/, "\\\\", s)
      gsub(/"/, "\\\"", s)
      return s
    }
  '
}

_teesim_empty_ir() {
  printf 'P default\nK keybox.xml\nM patch\nO \nS today\nV YYYY-MM-05\nB YYYY-MM-05\n'
}

_teesim_repair_config() {
  _trc_cfg="${1:-$TEESIM_CONFIG}"
  _trc_seed="${MODULES_BASE}/teesim/config.default.json"
  mkdir -p "$(dirname "$_trc_cfg")" 2>/dev/null || true
  [ -f "$_trc_seed" ] || { unset _trc_cfg _trc_seed; return 0; }

  if [ ! -f "$_trc_cfg" ]; then
    cp "$_trc_seed" "$_trc_cfg" 2>/dev/null || true
    unset _trc_cfg _trc_seed
    return 0
  fi

  [ -s "$_trc_cfg" ] || { unset _trc_cfg _trc_seed; return 0; }
  grep -q '"profiles"' "$_trc_cfg" 2>/dev/null || { unset _trc_cfg _trc_seed; return 0; }

  _teesim_to_ir "$_trc_cfg" 2>/dev/null | grep -q '^P default$' && {
    unset _trc_cfg _trc_seed
    return 0
  }

  _trc_ir="${_trc_cfg}.repair.$$"
  _teesim_to_ir "$_trc_seed" | awk '/^P / { k = ($2 == "default"); if (k) print; next } k' > "$_trc_ir"
  if [ -s "$_trc_ir" ]; then
    _teesim_to_ir "$_trc_cfg" >> "$_trc_ir"
    _teesim_write_ir "$_trc_cfg" "$_trc_ir" || true
  fi
  rm -f "$_trc_ir"
  unset _trc_cfg _trc_seed _trc_ir
}

_teesim_load_ir() {
  _tli_file="$1" _tli_out="$2"
  _teesim_repair_config "$_tli_file"
  if [ -f "$_tli_file" ]; then
    _teesim_to_ir "$_tli_file" > "$_tli_out" || { unset _tli_file _tli_out; return 1; }
  else
    _teesim_empty_ir > "$_tli_out"
  fi
  if ! grep -q '^P default$' "$_tli_out" 2>/dev/null; then
    _teesim_empty_ir >> "$_tli_out"
  fi
  unset _tli_file _tli_out
}

_teesim_write_ir() {
  _twi_file="$1" _twi_ir="$2"
  _twi_tmp="${_twi_file}.new.$$"
  mkdir -p "$(dirname "$_twi_file")" 2>/dev/null
  _teesim_from_ir < "$_twi_ir" > "$_twi_tmp" || {
    rm -f "$_twi_tmp"
    unset _twi_file _twi_ir _twi_tmp
    return 1
  }
  mv -f "$_twi_tmp" "$_twi_file" || {
    rm -f "$_twi_tmp"
    unset _twi_file _twi_ir _twi_tmp
    return 1
  }
  unset _twi_file _twi_ir _twi_tmp
}

_teesim_read_apps() {
  _tra_file="$1"
  [ -f "$_tra_file" ] && [ -s "$_tra_file" ] || { unset _tra_file; return 0; }
  _teesim_to_ir "$_tra_file" | awk '/^A / { print substr($0, 3) }' | sort -u
  unset _tra_file
}

_teesim_commit_apps() {
  _tca_cfg="$1" _tca_src="$2"
  _tca_ir="${_tca_cfg}.ir.$$"
  _tca_pkgs="${_tca_cfg}.pkgs.$$"
  _teesim_load_ir "$_tca_cfg" "$_tca_ir" || {
    rm -f "$_tca_ir"
    unset _tca_cfg _tca_src _tca_ir _tca_pkgs
    return 1
  }
  : > "$_tca_pkgs"
  while IFS= read -r _tca_line || [ -n "$_tca_line" ]; do
    [ -z "$_tca_line" ] && continue
    case "$_tca_line" in \[*\]) continue ;; esac
    _tca_base=${_tca_line%!}
    _tca_base=${_tca_base%\?}
    [ -n "$_tca_base" ] && printf '%s\n' "$_tca_base" >> "$_tca_pkgs"
  done < "$_tca_src"

  awk -v pkgsfile="$_tca_pkgs" '
    BEGIN { in_def = 0 }
    /^P / {
      if (in_def) flush_def()
      in_def = ($2 == "default")
      print
      next
    }
    /^A / { next }
    { print }
    END { if (in_def) flush_def() }
    function flush_def(   p) {
      while ((getline p < pkgsfile) > 0) if (p != "") print "A " p
      close(pkgsfile)
    }
  ' "$_tca_ir" > "${_tca_ir}.out"

  _teesim_write_ir "$_tca_cfg" "${_tca_ir}.out"
  _tca_rc=$?
  rm -f "$_tca_ir" "${_tca_ir}.out" "$_tca_pkgs"
  unset _tca_cfg _tca_src _tca_ir _tca_pkgs _tca_line _tca_base
  return $_tca_rc
}

_teesim_get_boot_patch() {
  _tgp_file="$1"
  [ -f "$_tgp_file" ] && [ -s "$_tgp_file" ] || return 1
  _tgp_val=$(_teesim_to_ir "$_tgp_file" | awk '
    /^P / { cur = $2 }
    cur == "default" && /^B / { print substr($0, 3); exit }
  ') || _tgp_val=""
  case "$_tgp_val" in
    [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9])
      printf '%s\n' "$_tgp_val"
      unset _tgp_file _tgp_val
      return 0
      ;;
  esac
  unset _tgp_file _tgp_val
  return 1
}

_teesim_set_patch() {
  _tsp_cfg="$1" _tsp_date="$2"
  _tsp_ir="${_tsp_cfg}.ir.$$"
  _teesim_load_ir "$_tsp_cfg" "$_tsp_ir" || {
    rm -f "$_tsp_ir"
    unset _tsp_cfg _tsp_date _tsp_ir
    return 1
  }
  _tsp_yyyymm=$(printf '%s' "$_tsp_date" | cut -d'-' -f1-2)
  awk -v sys="$_tsp_yyyymm" -v boot="$_tsp_date" -v vend="$_tsp_date" '
    BEGIN { cur = "" }
    /^P / { cur = $2; print; next }
    cur == "default" && /^S / { print "S " sys; next }
    cur == "default" && /^V / { print "V " vend; next }
    cur == "default" && /^B / { print "B " boot; next }
    { print }
  ' "$_tsp_ir" > "${_tsp_ir}.out"
  _teesim_write_ir "$_tsp_cfg" "${_tsp_ir}.out"
  _tsp_rc=$?
  rm -f "$_tsp_ir" "${_tsp_ir}.out"
  unset _tsp_cfg _tsp_date _tsp_ir _tsp_yyyymm
  return $_tsp_rc
}

_teesim_get_mode() {
  _tgm_file="$1"
  [ -f "$_tgm_file" ] && [ -s "$_tgm_file" ] || { printf 'patch\n'; return 0; }
  _tgm_val=$(_teesim_to_ir "$_tgm_file" | awk '
    /^P / { cur = $2 }
    cur == "default" && /^M / { print substr($0, 3); exit }
  ') || _tgm_val=""
  case "$_tgm_val" in
    patch|generation) printf '%s\n' "$_tgm_val" ;;
    *) printf 'patch\n' ;;
  esac
  unset _tgm_file _tgm_val
}

_teesim_set_mode() {
  _tsm_cfg="$1" _tsm_mode="$2"
  case "$_tsm_mode" in patch|generation) ;; *)
    unset _tsm_cfg _tsm_mode
    return 1
    ;;
  esac
  _tsm_ir="${_tsm_cfg}.ir.$$"
  _teesim_load_ir "$_tsm_cfg" "$_tsm_ir" || {
    rm -f "$_tsm_ir"
    unset _tsm_cfg _tsm_mode _tsm_ir
    return 1
  }
  awk -v mode="$_tsm_mode" '
    /^M / { print "M " mode; next }
    { print }
  ' "$_tsm_ir" > "${_tsm_ir}.out"
  _teesim_write_ir "$_tsm_cfg" "${_tsm_ir}.out"
  _tsm_rc=$?
  rm -f "$_tsm_ir" "${_tsm_ir}.out"
  unset _tsm_cfg _tsm_mode _tsm_ir
  return $_tsm_rc
}

_teesim_ensure_keybox_field() {
  _tek_cfg="$1"
  _tek_ir="${_tek_cfg}.ir.$$"
  _teesim_load_ir "$_tek_cfg" "$_tek_ir" || {
    rm -f "$_tek_ir"
    unset _tek_cfg _tek_ir
    return 1
  }
  awk '
    BEGIN { cur = "" }
    /^P / { cur = $2; print; next }
    cur == "default" && /^K / { print "K keybox.xml"; next }
    { print }
  ' "$_tek_ir" > "${_tek_ir}.out"
  _teesim_write_ir "$_tek_cfg" "${_tek_ir}.out"
  _tek_rc=$?
  rm -f "$_tek_ir" "${_tek_ir}.out"
  unset _tek_cfg _tek_ir
  return $_tek_rc
}
