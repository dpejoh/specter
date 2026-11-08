# shellcheck shell=sh
# HMA-OSS (frknkrc44) config integration.
#
# HMA-OSS keeps its config in /data/misc/hide_my_applist*/config.json, owned by
# the system_server-side HMAService (uid 1000). oss-175+ reloads the file
# automatically on write; older versions need a reboot or the Home status-card
# long-press (reloadConfigFromFile).
#
# Specter merges a preset-based hiding profile into the existing file and leaves
# everything it does not manage byte-for-byte intact:
#   - adds/updates a blacklist AppConfig for managed user apps
#   - enables presets on scope entries (detector targets omit detector_apps)
#   - sets defaultConfig only when the user has none
#   - drops configVersion and restores system:system ownership (issue #158)

HMAOSS_PKG="org.frknkrc44.hma_oss"
HMAOSS_APP_PRESETS='["accessibility_apps","custom_rom","detector_apps","root_apps","shizuku_dhizuku","sus_apps","xposed"]'
HMAOSS_APP_PRESETS_NO_DETECTORS='["accessibility_apps","custom_rom","root_apps","shizuku_dhizuku","sus_apps","xposed"]'
HMAOSS_SETTINGS_PRESETS='["accessibility","dev_options","input_method"]'
: "${HMAOSS_CMD_TIMEOUT:=20}"
: "${HMAOSS_MERGE_TIMEOUT:=45}"

# External commands here talk to binder services and the manager's su. On a
# wedged device any of them can block forever, and the WebUI drops its output
# callback after 60s, so the dialog hangs with no error. Cap every call.
_hma_timeout() {
  _ht_secs="$1"; shift
  if command -v timeout >/dev/null 2>&1; then
    timeout "$_ht_secs" "$@"
  else
    "$@"
  fi
}

# HMA-OSS creates /data/misc/hide_my_applist_<random>/ on first boot and
# deletes any extra matching directories, so we must reuse the existing one.
_hma_find_dir() {
  _hfd_found=""
  for _hfd_d in "$HMAOSS_BASE"/hide_my_applist*; do
    [ -d "$_hfd_d" ] || continue
    if [ -f "$_hfd_d/config.json" ]; then
      _hfd_found="$_hfd_d"
      break
    fi
    [ -n "$_hfd_found" ] || _hfd_found="$_hfd_d"
  done
  if [ -n "$_hfd_found" ]; then
    printf '%s\n' "$_hfd_found"
  fi
  unset _hfd_found _hfd_d
  return 0
}

# Locate preset_cache_v2.json in the HMA-OSS service data dir.
_hma_find_preset_cache() {
  _hfpc_dir="${1:-}"
  [ -d "$_hfpc_dir" ] || { unset _hfpc_dir; return 0; }
  if [ -s "$_hfpc_dir/preset_cache_v2.json" ]; then
    printf '%s\n' "$_hfpc_dir/preset_cache_v2.json"
  fi
  unset _hfpc_dir
  return 0
}

# Parse HMA-OSS preset cache into two lists:
#   - sensitive packages to exclude from scope (root_apps, xposed, sus_apps,
#     shizuku_dhizuku, custom_rom, accessibility_apps)
#   - detector apps, which stay in scope but must not receive the detector_apps
#     preset themselves (otherwise Duck Detector cannot see its own package)
# HMA only exports dynamically detected packages here; exact preset matches are
# not in the cache, so this remains a best-effort list.
_hma_preset_cache_apps() {
  _hpca_file="$1" _hpca_out="$2" _hpca_det="${3:-}"
  : > "$_hpca_out"
  [ -n "$_hpca_det" ] && : > "$_hpca_det"
  [ -f "$_hpca_file" ] || { unset _hpca_file _hpca_out _hpca_det; return 0; }
  _hma_timeout "$HMAOSS_CMD_TIMEOUT" awk -v detfile="$_hpca_det" '
function unquote(s) {
  gsub(/^"/, "", s); gsub(/"$/, "", s)
  gsub(/\\"/, "\"", s); gsub(/\\\\/, "\\", s)
  return s
}
function tokenize(s,   n, off, chunk, clen, i, c, abs) {
  tn = 0; n = length(s); off = 1
  instr = 0; esc = 0; intok = 0; tstart = 0; tc = ""
  while (off <= n) {
    chunk = substr(s, off, 1024)
    clen = length(chunk)
    for (i = 1; i <= clen; i++) {
      c = substr(chunk, i, 1)
      abs = off + i - 1
      if (instr) {
        if (esc) { esc = 0; tc = tc c }
        else if (c == "\\") { esc = 1; tc = tc c }
        else if (c == "\"") {
          tk[++tn] = tc "\""; tp[tn] = tstart; te[tn] = abs + 1
          instr = 0; intok = 0; tc = ""
        }
        else { tc = tc c }
        continue
      }
      if (c == " " || c == "\t" || c == "\r" || c == "\n") {
        if (intok) { tk[++tn] = tc; tp[tn] = tstart; te[tn] = abs; intok = 0; tc = "" }
        continue
      }
      if (c == "{" || c == "}" || c == "[" || c == "]" || c == ":" || c == ",") {
        if (intok) { tk[++tn] = tc; tp[tn] = tstart; te[tn] = abs; intok = 0; tc = "" }
        tk[++tn] = c; tp[tn] = abs; te[tn] = abs + 1
        continue
      }
      if (c == "\"") {
        if (intok) { tk[++tn] = tc; tp[tn] = tstart; te[tn] = abs; intok = 0 }
        instr = 1; esc = 0; tstart = abs; tc = "\""; intok = 1
        continue
      }
      if (!intok) { intok = 1; tstart = abs; tc = "" }
      tc = tc c
    }
    off += 1024
  }
  if (intok) { tk[++tn] = tc; tp[tn] = tstart; te[tn] = n + 1 }
}
BEGIN {
  RS = "\001"
  if (ARGV[1] != "" && (getline raw < ARGV[1]) <= 0) raw = ""
  if (ARGV[1] != "") close(ARGV[1])
  if (raw == "") exit 0

  tokenize(raw)

  in_cache = 0
  cache_depth = 0
  in_array = 0
  cur_preset = ""

  for (i = 1; i <= tn; i++) {
    t = tk[i]
    if (!in_cache) {
      if (t == "\"cache\"" && i + 2 <= tn && tk[i+1] == ":" && tk[i+2] == "{") {
        in_cache = 1
        cache_depth = 1
        i += 2
      }
      continue
    }

    if (t == "{") {
      cache_depth++
    } else if (t == "}") {
      cache_depth--
      if (cache_depth == 0) break
    } else if (t == "[") {
      in_array = 1
    } else if (t == "]") {
      in_array = 0
    } else if (cache_depth == 1 && t ~ /^"/ && i + 1 <= tn && tk[i+1] == ":") {
      cur_preset = unquote(t)
    } else if (in_array && t ~ /^"/) {
      pkg = unquote(t)
      if (pkg == "") continue
      if (cur_preset == "detector_apps") {
        if (detfile != "" && !seend[pkg]++) print pkg > detfile
      } else if (!seen[pkg]++) {
        print pkg
      }
    }
  }
}
END { if (detfile != "") close(detfile) }
' "$_hpca_file" > "$_hpca_out"
  unset _hpca_file _hpca_out _hpca_det
  return 0
}

# printf is an external binary on Android's sh, so keep these loops in awk.
_hma_installed() {
  _hma_timeout "$HMAOSS_CMD_TIMEOUT" pm list packages 2>/dev/null | awk '
    {
      gsub(/\r/, "", $0)
      sub(/^package:/, "", $0)
      if ($0 != "" && !seen[$0]++) print
    }
  ' || true
  return 0
}

# Output package names currently in the HMA-OSS config scope.
_hma_list_scope() {
  _hls_file="$1"
  [ -f "$_hls_file" ] || { unset _hls_file; return 0; }
  _hma_timeout "$HMAOSS_CMD_TIMEOUT" awk '
function unquote(s) {
  gsub(/^"/, "", s); gsub(/"$/, "", s)
  gsub(/\\"/, "\"", s); gsub(/\\\\/, "\\", s)
  return s
}
function tokenize(s,   n, off, chunk, clen, i, c, abs) {
  tn = 0; n = length(s); off = 1
  instr = 0; esc = 0; intok = 0; tstart = 0; tc = ""
  while (off <= n) {
    chunk = substr(s, off, 1024)
    clen = length(chunk)
    for (i = 1; i <= clen; i++) {
      c = substr(chunk, i, 1)
      abs = off + i - 1
      if (instr) {
        if (esc) { esc = 0; tc = tc c }
        else if (c == "\\") { esc = 1; tc = tc c }
        else if (c == "\"") {
          tk[++tn] = tc "\""; tp[tn] = tstart; te[tn] = abs + 1
          instr = 0; intok = 0; tc = ""
        }
        else { tc = tc c }
        continue
      }
      if (c == " " || c == "\t" || c == "\r" || c == "\n") {
        if (intok) { tk[++tn] = tc; tp[tn] = tstart; te[tn] = abs; intok = 0; tc = "" }
        continue
      }
      if (c == "{" || c == "}" || c == "[" || c == "]" || c == ":" || c == ",") {
        if (intok) { tk[++tn] = tc; tp[tn] = tstart; te[tn] = abs; intok = 0; tc = "" }
        tk[++tn] = c; tp[tn] = abs; te[tn] = abs + 1
        continue
      }
      if (c == "\"") {
        if (intok) { tk[++tn] = tc; tp[tn] = tstart; te[tn] = abs; intok = 0 }
        instr = 1; esc = 0; tstart = abs; tc = "\""; intok = 1
        continue
      }
      if (!intok) { intok = 1; tstart = abs; tc = "" }
      tc = tc c
    }
    off += 1024
  }
  if (intok) { tk[++tn] = tc; tp[tn] = tstart; te[tn] = n + 1 }
}
function skipv(i,   d, t) {
  t = tk[i]
  if (t == "{") { d = 1; i++; while (i <= tn && d > 0) { if (tk[i] == "{") d++; else if (tk[i] == "}") d--; i++ } return i }
  if (t == "[") { d = 1; i++; while (i <= tn && d > 0) { if (tk[i] == "[") d++; else if (tk[i] == "]") d--; i++ } return i }
  return i + 1
}
BEGIN {
  RS = "\001"
  if ((getline raw < ARGV[1]) <= 0) raw = ""
  close(ARGV[1])
  if (raw == "") exit 0
  tokenize(raw)
  if (tn < 2 || tk[1] != "{") exit 0
  i = 2
  while (i <= tn && tk[i] != "}") {
    if (tk[i] ~ /^"/) {
      k = unquote(tk[i]); i++
      if (tk[i] == ":") i++
      if (k == "scope" && tk[i] == "{") {
        i++
        while (i <= tn && tk[i] != "}") {
          if (tk[i] ~ /^"/) {
            pkg = unquote(tk[i]); i++
            if (tk[i] == ":") i++
            i = skipv(i)
            if (pkg != "") print pkg
            if (tk[i] == ",") i++
          } else i++
        }
        break
      } else {
        i = skipv(i)
        if (tk[i] == ",") i++
      }
    } else i++
  }
}
' "$_hls_file"
  unset _hls_file
  return 0
}

# User apps that become hiding targets, minus the Specter blacklist and apps
# detected by HMA presets that must not be targeted themselves.
_hma_user_apps() {
  _hua_exclude="${1:-}"
  _hua_bl=""
  if [ -f "$SPECTER_DIR/blacklist_enabled" ] && [ -s "$SPECTER_DIR/blacklist.txt" ]; then
    _hua_bl="$SPECTER_DIR/blacklist.txt"
  fi
  _hma_timeout "$HMAOSS_CMD_TIMEOUT" pm list packages -3 2>/dev/null | awk \
    -v hma="$HMAOSS_PKG" -v bl_file="$_hua_bl" -v exclude_file="$_hua_exclude" '
    BEGIN {
      if (bl_file != "") {
        while ((getline b < bl_file) > 0) {
          gsub(/\r/, "", b)
          gsub(/^[[:space:]]+/, "", b)
          gsub(/[[:space:]]+$/, "", b)
          sub(/[[:space:]].*$/, "", b)
          if (b != "" && b !~ /^#/) black[b] = 1
        }
        close(bl_file)
      }
      if (exclude_file != "") {
        while ((getline ex < exclude_file) > 0) {
          gsub(/\r/, "", ex)
          gsub(/^[[:space:]]+/, "", ex)
          gsub(/[[:space:]]+$/, "", ex)
          sub(/[[:space:]].*$/, "", ex)
          if (ex != "" && ex !~ /^#/) excluded[ex] = 1
        }
        close(exclude_file)
      }
    }
    {
      gsub(/\r/, "", $0)
      sub(/^package:/, "", $0)
      if ($0 == "" || $0 == hma) next
      if ($0 in black) next
      if ($0 in excluded) next
      if (seen[$0]++) next
      print
    }
  '
  unset _hua_exclude _hua_bl
  return 0
}

# Standard per-target AppConfig: blacklist mode, all HMA-OSS built-in presets
# enabled for detection surface, templates empty by default. Pass "no-detectors"
# for detector targets, which must keep seeing their own preset packages.
_hma_appconfig_json() {
  _hac_presets="$HMAOSS_APP_PRESETS"
  [ "${1:-}" = "no-detectors" ] && _hac_presets="$HMAOSS_APP_PRESETS_NO_DETECTORS"
  printf '{"useWhitelist":false,"excludeSystemApps":true,"hideInstallationSource":false,"hideSystemInstallationSource":false,"excludeTargetInstallationSource":false,"invertActivityLaunchProtection":false,"excludeVoldIsolation":false,"restrictedZygotePermissions":[],"applyTemplates":[],"applyPresets":%s,"applySettingTemplates":[],"applySettingsPresets":%s,"extraAppList":[],"extraOppositeAppList":[]}' "$_hac_presets" "$HMAOSS_SETTINGS_PRESETS"
  unset _hac_presets
  return 0
}

# One "pkg<TAB>AppConfig" line per scope addition. Detector targets get the
# config without the detector_apps preset.
_hma_build_scope() {
  _hbs_apps="$1" _hbs_out="$2" _hbs_def="$3" _hbs_def6="$4" _hbs_det="$5"
  if [ -f "$_hbs_def" ]; then
    awk -v def="$_hbs_def" -v def6="$_hbs_def6" -v detfile="$_hbs_det" '
      BEGIN {
        if ((getline ac7 < def) > 0) sub(/\r$/, "", ac7)
        close(def)
        if (def6 != "" && (getline ac6 < def6) > 0) sub(/\r$/, "", ac6)
        if (def6 != "") close(def6)
        if (ac6 == "") ac6 = ac7
        if (detfile != "") {
          while ((getline p < detfile) > 0) {
            sub(/\r$/, "", p)
            if (p != "") det[p] = 1
          }
          close(detfile)
        }
      }
      { if ($0 != "") print $0 "\t" ($0 in det ? ac6 : ac7) }
    ' "$_hbs_apps" > "$_hbs_out"
  else
    _hbs_ac=$(_hma_appconfig_json)
    _hbs_ac6=$(_hma_appconfig_json no-detectors)
    HMAOSS_AC="$_hbs_ac" HMAOSS_AC6="$_hbs_ac6" HMAOSS_DET="$_hbs_det" awk '
      BEGIN {
        if (ENVIRON["HMAOSS_DET"] != "") {
          while ((getline p < ENVIRON["HMAOSS_DET"]) > 0) {
            sub(/\r$/, "", p)
            if (p != "") det[p] = 1
          }
          close(ENVIRON["HMAOSS_DET"])
        }
      }
      { if ($0 != "") print $0 "\t" ($0 in det ? ENVIRON["HMAOSS_AC6"] : ENVIRON["HMAOSS_AC"]) }
    ' "$_hbs_apps" > "$_hbs_out"
    unset HMAOSS_AC HMAOSS_AC6 HMAOSS_DET
  fi
  unset _hbs_apps _hbs_out _hbs_def _hbs_def6 _hbs_det _hbs_ac _hbs_ac6
  return 0
}

# Lossless JSON merge: tokenizes the existing config, upserts scope entries and
# defaultConfig, removes configVersion, and re-emits the original bytes
# everywhere else. Managed blacklist entries get all HMA-OSS app presets except
# detector targets, which omit the detector_apps preset.
# Exits non-zero and writes nothing when the base is not a JSON object or the
# result does not balance.
_hma_merge_config() {
  _hmc_base="$1" _hmc_scope="$2" _hmc_default="$3" _hmc_out="$4"
  _hmc_timeout="${5:-$HMAOSS_MERGE_TIMEOUT}" _hmc_exclude="${6:-}" _hmc_det="${7:-}"
  _hmc_mode="${8:-merge}"
  _hma_timeout "$_hmc_timeout" awk -v cfg="$_hmc_base" -v scopefile="$_hmc_scope" \
      -v deffile="$_hmc_default" -v excludefile="$_hmc_exclude" \
      -v detectorsfile="$_hmc_det" -v presets="$HMAOSS_APP_PRESETS" \
      -v presets_no_detectors="$HMAOSS_APP_PRESETS_NO_DETECTORS" \
      -v scope_mode="$_hmc_mode" '
function jesc(s) { gsub(/\\/, "\\\\", s); gsub(/"/, "\\\"", s); return s }

function unquote(s) {
  gsub(/^"/, "", s); gsub(/"$/, "", s)
  gsub(/\\"/, "\"", s); gsub(/\\\\/, "\\", s)
  return s
}

function tokenize(s,   n, off, chunk, clen, i, c, abs) {
  tn = 0; n = length(s); off = 1
  instr = 0; esc = 0; intok = 0; tstart = 0; tc = ""
  while (off <= n) {
    chunk = substr(s, off, 1024)
    clen = length(chunk)
    for (i = 1; i <= clen; i++) {
      c = substr(chunk, i, 1)
      abs = off + i - 1
      if (instr) {
        if (esc) { esc = 0; tc = tc c }
        else if (c == "\\") { esc = 1; tc = tc c }
        else if (c == "\"") {
          tk[++tn] = tc "\""; tp[tn] = tstart; te[tn] = abs + 1
          instr = 0; intok = 0; tc = ""
        }
        else { tc = tc c }
        continue
      }
      if (c == " " || c == "\t" || c == "\r" || c == "\n") {
        if (intok) { tk[++tn] = tc; tp[tn] = tstart; te[tn] = abs; intok = 0; tc = "" }
        continue
      }
      if (c == "{" || c == "}" || c == "[" || c == "]" || c == ":" || c == ",") {
        if (intok) { tk[++tn] = tc; tp[tn] = tstart; te[tn] = abs; intok = 0; tc = "" }
        tk[++tn] = c; tp[tn] = abs; te[tn] = abs + 1
        continue
      }
      if (c == "\"") {
        if (intok) { tk[++tn] = tc; tp[tn] = tstart; te[tn] = abs; intok = 0 }
        instr = 1; esc = 0; tstart = abs; tc = "\""; intok = 1
        continue
      }
      if (!intok) { intok = 1; tstart = abs; tc = "" }
      tc = tc c
    }
    off += 1024
  }
  if (intok) { tk[++tn] = tc; tp[tn] = tstart; te[tn] = n + 1 }
}

function skipv(i,   d, t) {
  t = tk[i]
  if (t == "{") { d = 1; i++; while (i <= tn && d > 0) { if (tk[i] == "{") d++; else if (tk[i] == "}") d--; i++ } return i }
  if (t == "[") { d = 1; i++; while (i <= tn && d > 0) { if (tk[i] == "[") d++; else if (tk[i] == "]") d--; i++ } return i }
  return i + 1
}

function add_edit(s, e, r) { ne++; es[ne] = s; ee[ne] = e; er[ne] = r }

function scan_obj(vi0, vi1, kset,   i, k, found) {
  found = 0
  i = vi0 + 1
  while (i < vi1) {
    if (tk[i] ~ /^"/) {
      k = unquote(tk[i]); i++
      if (tk[i] == ":") i++
      found = 1
      kset[k] = i
      i = skipv(i)
      if (tk[i] == ",") i++
    } else i++
  }
  return found
}

function normalize_appconfig(val, pkg,   field, pset) {
  # Whitelist entries are user-managed; never add blacklist presets to them.
  if (val ~ /"useWhitelist"[[:space:]]*:[[:space:]]*true/) return val
  pset = (pkg in detectors) ? presets_no_detectors : presets
  field = "\"applyPresets\":" pset
  if (match(val, /"applyPresets"[[:space:]]*:[[:space:]]*\[[^]]*\]/)) {
    val = substr(val, 1, RSTART - 1) field substr(val, RSTART + RLENGTH)
  } else if (match(val, /"applyPresets"[[:space:]]*:[[:space:]]*[^,}]+/)) {
    val = substr(val, 1, RSTART - 1) field substr(val, RSTART + RLENGTH)
  } else if (val ~ /\{[[:space:]]*\}/) {
    sub(/\{[[:space:]]*\}/, "{" field "}", val)
  } else {
    sub(/\}[[:space:]]*$/, "," field "}", val)
  }
  return val
}

BEGIN {
  RS = "\001"
  if (cfg != "" && (getline raw < cfg) <= 0) raw = ""
  if (cfg != "") close(cfg)
  RS = "\n"
  if (raw == "") raw = "{}"

  if (excludefile != "") {
    while ((getline ex < excludefile) > 0) {
      sub(/\r$/, "", ex)
      if (ex != "") excluded[ex] = 1
    }
    close(excludefile)
  }

  if (detectorsfile != "") {
    while ((getline dp < detectorsfile) > 0) {
      sub(/\r$/, "", dp)
      if (dp != "") detectors[dp] = 1
    }
    close(detectorsfile)
  }

  tokenize(raw)
  if (tn < 2 || tk[1] != "{") exit 3
  root_open = te[1]

  nm = 0
  i = 2
  while (i <= tn && tk[i] != "}") {
    if (tk[i] !~ /^"/) { i = skipv(i); if (tk[i] == ",") i++; continue }
    k = unquote(tk[i]); ks = tp[i]; i++
    if (tk[i] != ":") { i++; continue }
    i++
    vi0 = i
    vend_i = skipv(vi0)
    nm++
    mk[nm] = k; mks[nm] = ks; mvs[nm] = tp[vi0]
    mve[nm] = te[vend_i - 1]; mvi0[nm] = vi0; mvi1[nm] = vend_i - 1
    i = vend_i
    if (i <= tn && tk[i] == ",") i++
  }
  if (i > tn || tk[i] != "}") exit 3

  cfg_i = 0; scope_i = 0; def_i = 0
  for (m = 1; m <= nm; m++) {
    if (mk[m] == "configVersion") cfg_i = m
    else if (mk[m] == "scope") scope_i = m
    else if (mk[m] == "defaultConfig") def_i = m
  }

  defjson = ""
  if (deffile != "" && (getline d < deffile) > 0) { sub(/\r$/, "", d); defjson = d }
  if (deffile != "") close(deffile)

  root_parts = ""

  wanted_count = 0
  if (scopefile != "") {
    while ((getline w < scopefile) > 0) {
      sub(/\r$/, "", w)
      tabi = index(w, "\t")
      if (tabi > 0) {
        p = substr(w, 1, tabi - 1)
        wanted[p] = substr(w, tabi + 1)
        wanted_order[++wanted_count] = p
      }
    }
    close(scopefile)
  }

  scope_exists = (scope_i > 0 && tk[mvi0[scope_i]] == "{")
  scope_hasany = 0
  if (scope_exists) scope_hasany = scan_obj(mvi0[scope_i], mvi1[scope_i], sset)

  if (scope_exists) {
    end_scope = skipv(mvi0[scope_i]) - 1
    i = mvi0[scope_i] + 1
    kept_text = ""
    nkept = 0
    while (i < end_scope) {
      if (tk[i] ~ /^"/) {
        k = unquote(tk[i]); i++
        if (tk[i] == ":") i++
        vs = i
        ve = skipv(vs) - 1
        i = ve + 1
        if (!(k in excluded)) {
          val_str = substr(raw, tp[vs], te[ve] - tp[vs])
          if (scope_mode == "replace") {
            if (val_str ~ /"useWhitelist"[[:space:]]*:[[:space:]]*true/) {
              nkept++
              kept_text = kept_text (nkept > 1 ? "," : "") "\"" jesc(k) "\":" val_str
            } else if (k in wanted) {
              nkept++
              val_str = normalize_appconfig(val_str, k)
              kept_text = kept_text (nkept > 1 ? "," : "") "\"" jesc(k) "\":" val_str
            }
          } else {
            nkept++
            val_str = normalize_appconfig(val_str, k)
            kept_text = kept_text (nkept > 1 ? "," : "") "\"" jesc(k) "\":" val_str
          }
        }
        if (tk[i] == ",") i++
      } else i++
    }

    nadds = 0; addtext = ""
    for (wi = 1; wi <= wanted_count; wi++) {
      p = wanted_order[wi]
      if (p in sset) continue
      if (p in excluded) continue
      js = normalize_appconfig(wanted[p], p)
      nadds++
      addtext = addtext (nadds > 1 ? "," : "") "\"" jesc(p) "\":" js
    }

    ins = kept_text
    if (addtext != "") ins = ins (nkept > 0 ? "," : "") addtext
    add_edit(tp[mvi0[scope_i]], te[end_scope], "{" ins "}")
  } else {
    nadds = 0; addtext = ""
    for (wi = 1; wi <= wanted_count; wi++) {
      p = wanted_order[wi]
      if (scope_exists && (p in sset)) continue
      if (p in excluded) continue
      js = normalize_appconfig(wanted[p], p)
      nadds++
      addtext = addtext (nadds > 1 ? "," : "") "\"" jesc(p) "\":" js
    }

    if (scope_i > 0) {
      if (scope_exists) {
        if (nadds > 0) {
          ins = addtext
          if (scope_hasany) ins = ins ","
          add_edit(te[mvi0[scope_i]], te[mvi0[scope_i]], ins)
        }
      } else {
        add_edit(mvs[scope_i], mve[scope_i], "{" addtext "}")
      }
    } else if (nadds > 0) {
      root_parts = root_parts (root_parts == "" ? "" : ",") "\"scope\":{" addtext "}"
    }
  }

  if (def_i > 0) {
    if (defjson != "" && tk[mvi0[def_i]] == "null") add_edit(mvs[def_i], mve[def_i], defjson)
  } else if (defjson != "") {
    root_parts = root_parts (root_parts == "" ? "" : ",") "\"defaultConfig\":" defjson
  }

  nm_after = nm - (cfg_i > 0 ? 1 : 0)
  if (root_parts != "") {
    if (nm_after > 0) root_parts = root_parts ","
    add_edit(root_open, root_open, root_parts)
  }

  if (cfg_i > 0) {
    if (nm == 1) add_edit(mks[cfg_i], mve[cfg_i], "")
    else if (cfg_i < nm) add_edit(mks[cfg_i], mks[cfg_i + 1], "")
    else add_edit(mve[cfg_i - 1], mve[cfg_i], "")
  }

  for (a = 1; a <= ne; a++)
    for (b = a + 1; b <= ne; b++)
      if (es[b] < es[a] || (es[b] == es[a] && ee[b] < ee[a])) {
        t1 = es[a]; es[a] = es[b]; es[b] = t1
        t1 = ee[a]; ee[a] = ee[b]; ee[b] = t1
        t1 = er[a]; er[a] = er[b]; er[b] = t1
      }

  out = ""; cur = 1
  for (e = 1; e <= ne; e++) {
    if (es[e] < cur) continue
    out = out substr(raw, cur, es[e] - cur)
    out = out er[e]
    cur = ee[e]
  }
  out = out substr(raw, cur)

  tokenize(out)
  if (tn < 2 || tk[1] != "{") exit 3
  d = 0
  for (j = 1; j <= tn; j++) {
    if (tk[j] == "{" || tk[j] == "[") d++
    else if (tk[j] == "}" || tk[j] == "]") d--
    if (d < 0) exit 3
  }
  if (d != 0) exit 3

  printf "%s", out
}
' > "$_hmc_out"
  _hmc_rc=$?
  if [ "$_hmc_rc" -ne 0 ]; then
    rm -f "$_hmc_out" 2>/dev/null || true
  fi
  unset _hmc_base _hmc_scope _hmc_default _hmc_out _hmc_timeout _hmc_exclude _hmc_det _hmc_mode
  return "$_hmc_rc"
}

# Read an HMA file even when it is system-owned (WebUI sandbox).
_hma_copy_config() {
  _hcc_src="$1" _hcc_dst="$2"
  cp -f "$_hcc_src" "$_hcc_dst" 2>/dev/null || \
    _hma_timeout "$HMAOSS_CMD_TIMEOUT" su -c "cat '$_hcc_src' > '$_hcc_dst'" 2>/dev/null
  unset _hcc_src _hcc_dst
}

_hma_backup() {
  _hb_cfg="$1"
  if [ -f "$_hb_cfg" ]; then
    cp -f "$_hb_cfg" "$_hb_cfg.specter.bak" 2>/dev/null || \
      _hma_timeout "$HMAOSS_CMD_TIMEOUT" su -c "cp -f '$_hb_cfg' '$_hb_cfg.specter.bak'" 2>/dev/null || true
  fi
  unset _hb_cfg
  return 0
}

# In-place write + system ownership (issue #158: HMAService only ever checks
# R_OK|W_OK as uid 1000, it never repairs ownership itself).
# HMA watches the config inode with FileObserver(CLOSE_WRITE|ATTRIB). Replacing
# it with mv orphans that watcher, so write through the existing inode.
_hma_install_config() {
  _hic_src="$1" _hic_dst="$2" _hic_dir="$3"
  _hic_new="$_hic_dst.specter.new"
  _hic_ok=0
  rm -f "$_hic_new" 2>/dev/null || true
  if cp -f "$_hic_src" "$_hic_new" 2>/dev/null &&
     chown "$HMAOSS_UID:$HMAOSS_UID" "$_hic_new" 2>/dev/null &&
     chmod 600 "$_hic_new" 2>/dev/null; then
    if cat "$_hic_new" > "$_hic_dst" 2>/dev/null; then
      chown "$HMAOSS_UID:$HMAOSS_UID" "$_hic_dst" 2>/dev/null || true
      chmod 600 "$_hic_dst" 2>/dev/null || true
      _hic_ok=1
    fi
  fi
  if [ "$_hic_ok" != "1" ]; then
    _hma_timeout "$HMAOSS_CMD_TIMEOUT" su -c "cp -f '$_hic_src' '$_hic_new' && chown $HMAOSS_UID:$HMAOSS_UID '$_hic_new' && chmod 600 '$_hic_new' && cat '$_hic_new' > '$_hic_dst' && chown $HMAOSS_UID:$HMAOSS_UID '$_hic_dst' && chmod 600 '$_hic_dst'" 2>/dev/null && _hic_ok=1
  fi
  rm -f "$_hic_new" 2>/dev/null || true
  if [ "$_hic_ok" != "1" ] && [ -f "$_hic_dst.specter.bak" ]; then
    cat "$_hic_dst.specter.bak" > "$_hic_dst" 2>/dev/null || \
      _hma_timeout "$HMAOSS_CMD_TIMEOUT" su -c "cat '$_hic_dst.specter.bak' > '$_hic_dst'" 2>/dev/null || true
  fi
  if [ "$_hic_ok" = "1" ]; then
    chown "$HMAOSS_UID:$HMAOSS_UID" "$_hic_dir" 2>/dev/null || \
      _hma_timeout "$HMAOSS_CMD_TIMEOUT" su -c "chown $HMAOSS_UID:$HMAOSS_UID '$_hic_dir'" 2>/dev/null || true
    if command -v restorecon >/dev/null 2>&1; then
      restorecon "$_hic_dst" 2>/dev/null || \
        _hma_timeout "$HMAOSS_CMD_TIMEOUT" su -c "restorecon '$_hic_dst'" 2>/dev/null || true
    fi
  fi
  unset _hic_src _hic_dst _hic_dir _hic_new
  [ "$_hic_ok" = "1" ]
}

_hma_tmp_base() {
  if [ -n "${SPECTER_DIR:-}" ] && mkdir -p "$SPECTER_DIR/tmp" 2>/dev/null && : > "$SPECTER_DIR/tmp/.hma_probe" 2>/dev/null; then
    rm -f "$SPECTER_DIR/tmp/.hma_probe" 2>/dev/null || true
    printf '%s\n' "$SPECTER_DIR/tmp"
  elif mkdir -p "/data/local/tmp" 2>/dev/null && : > "/data/local/tmp/.hma_probe" 2>/dev/null; then
    rm -f "/data/local/tmp/.hma_probe" 2>/dev/null || true
    printf '%s\n' /data/local/tmp
  else
    printf '%s\n' "${TMPDIR:-/tmp}"
  fi
  return 0
}
