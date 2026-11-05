# shellcheck shell=sh
# HMA-OSS (frknkrc44) config integration.
#
# HMA-OSS keeps its config in /data/misc/hide_my_applist*/config.json, owned by
# the system_server-side HMAService (uid 1000). External edits are only picked
# up on reboot or via the Home status-card long-press (reloadConfigFromFile).
#
# Specter merges a generated hiding profile into the existing file and leaves
# everything it does not manage byte-for-byte intact:
#   - upserts the Hide List template from installed hide-list packages
#   - adds a blacklist AppConfig for each user app that is not itself hidden
#   - sets defaultConfig only when the user has none
#   - drops configVersion and restores system:system ownership (issue #158)

HMAOSS_PKG="org.frknkrc44.hma_oss"
HMAOSS_TEMPLATE="Hide List"
HMAOSS_LEGACY_TEMPLATE="HIDE MY CUSTOM APP"
HMAOSS_HIDE_LIST="hma-hide-list.txt"
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

# Prefer the user-editable copy in the data dir; fall back to the module copy.
_hma_list_path() {
  _hlp_mod="${1:-}"
  if [ -f "$SPECTER_DIR/config/$HMAOSS_HIDE_LIST" ]; then
    printf '%s\n' "$SPECTER_DIR/config/$HMAOSS_HIDE_LIST"
  elif [ -n "$_hlp_mod" ] && [ -f "$_hlp_mod/config/$HMAOSS_HIDE_LIST" ]; then
    printf '%s\n' "$_hlp_mod/config/$HMAOSS_HIDE_LIST"
  fi
  unset _hlp_mod
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

# User apps that become hiding targets, minus the Specter blacklist and any
# package listed in a blacklist template's appList (including the generated one).
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

# Print every package listed in a blacklist template appList from an HMA-OSS
# config. Whitelist templates list visible apps, not invisible ones. The
# optional third argument skips one template (the generated Hide List).
_hma_template_targets() {
  _htt_cfg="$1" _htt_out="$2" _htt_skip="${3:-}"
  : > "$_htt_out"
  [ -f "$_htt_cfg" ] || { unset _htt_cfg _htt_out _htt_skip; return 0; }
  tr -d '\n\r' < "$_htt_cfg" 2>/dev/null \
    | grep -o '"[^"]*"[[:space:]]*:[[:space:]]*{[^{}]*}' \
    | awk -v skip="$_htt_skip" '
        {
          if (match($0, /^"[^"]*"/)) {
            name = substr($0, RSTART + 1, RLENGTH - 2)
            if (skip != "" && name == skip) next
          }
          print
        }
      ' \
    | grep '"isWhitelist"[[:space:]]*:[[:space:]]*false' \
    | grep -o '"appList"[[:space:]]*:[[:space:]]*\[[^]]*\]' \
    | sed 's/^"appList"[[:space:]]*:[[:space:]]*\[//; s/\]$//' \
    | grep -o '"[^"]*"' \
    | tr -d '"' \
    | awk 'NF && !seen[$0]++' > "$_htt_out"
  unset _htt_cfg _htt_out _htt_skip
  return 0
}

# Keep only hide-list entries whose package is installed on this device.
_hma_filter_hide_list() {
  _hfl_list="$1" _hfl_inst="$2" _hfl_out="$3"
  : > "$_hfl_out"
  if [ ! -f "$_hfl_list" ] || [ ! -s "$_hfl_inst" ]; then
    unset _hfl_list _hfl_inst _hfl_out
    return 0
  fi
  awk -v inst="$_hfl_inst" '
    BEGIN {
      while ((getline p < inst) > 0) {
        gsub(/\r/, "", p)
        if (p != "") installed[p] = 1
      }
      close(inst)
    }
    {
      gsub(/\r/, "", $0)
      gsub(/^[[:space:]]+/, "", $0)
      gsub(/[[:space:]]+$/, "", $0)
      if ($0 == "" || $0 ~ /^#/) next
      sub(/[[:space:]].*$/, "", $0)
      if ($0 != "" && ($0 in installed) && !seen[$0]++) print
    }
  ' "$_hfl_list" > "$_hfl_out"
  unset _hfl_list _hfl_inst _hfl_out
  return 0
}

# Standard per-target AppConfig: blacklist mode (the template lists what is
# hidden), HMA's own presets for the rest of the detection surface.
_hma_appconfig_json() {
  printf '{"useWhitelist":false,"excludeSystemApps":true,"hideInstallationSource":false,"hideSystemInstallationSource":false,"excludeTargetInstallationSource":false,"invertActivityLaunchProtection":false,"excludeVoldIsolation":false,"restrictedZygotePermissions":[],"applyTemplates":["%s"],"applyPresets":["custom_rom","detector_apps","root_apps","shizuku_dhizuku","sus_apps","xposed"],"applySettingTemplates":[],"applySettingsPresets":["accessibility","dev_options","input_method"],"extraAppList":[],"extraOppositeAppList":[]}' "$1"
  return 0
}

# One "pkg<TAB>AppConfig" line per scope addition.
_hma_build_scope() {
  _hbs_apps="$1" _hbs_tpl="$2" _hbs_out="$3" _hbs_def="${4:-}"
  if [ -n "$_hbs_def" ] && [ -f "$_hbs_def" ]; then
    awk -v def="$_hbs_def" '
      BEGIN {
        if ((getline ac < def) > 0) sub(/\r$/, "", ac)
        close(def)
      }
      { if ($0 != "") print $0 "\t" ac }
    ' "$_hbs_apps" > "$_hbs_out"
  else
    _hbs_ac=$(_hma_appconfig_json "$_hbs_tpl")
    HMAOSS_AC="$_hbs_ac" awk '{ if ($0 != "") print $0 "\t" ENVIRON["HMAOSS_AC"] }' \
      "$_hbs_apps" > "$_hbs_out"
    unset HMAOSS_AC
  fi
  unset _hbs_apps _hbs_tpl _hbs_out _hbs_def _hbs_ac
  return 0
}

# Lossless JSON merge: tokenizes the existing config, splices in the template,
# scope entries and defaultConfig, removes configVersion, and re-emits the
# original bytes everywhere else. Exits non-zero and writes nothing when the
# base is not a JSON object or the result does not balance.
_hma_merge_config() {
  _hmc_base="$1" _hmc_apps="$2" _hmc_scope="$3" _hmc_default="$4" _hmc_out="$5" _hmc_skip="${6:-}"
  _hmc_timeout="${7:-$HMAOSS_MERGE_TIMEOUT}" _hmc_prune="${8:-}"
  _hma_timeout "$_hmc_timeout" awk -v cfg="$_hmc_base" -v tpl="$HMAOSS_TEMPLATE" -v legacytpl="$HMAOSS_LEGACY_TEMPLATE" -v applist="$_hmc_apps" \
      -v scopefile="$_hmc_scope" -v deffile="$_hmc_default" -v skiptpl="$_hmc_skip" -v prune="$_hmc_prune" '
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

function clear_arr(a,   k) {
  for (k in a) delete a[k]
}

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

function array_remove_value(arr_i, value,   end_i, i) {
  end_i = skipv(arr_i) - 1
  for (i = arr_i + 1; i < end_i; i++) {
    if (tk[i] ~ /^"/ && unquote(tk[i]) == value) {
      if (i + 1 < end_i && tk[i + 1] == ",") {
        add_edit(tp[i], te[i + 1], "")
      } else if (i - 1 > arr_i && tk[i - 1] == ",") {
        add_edit(tp[i - 1], te[i], "")
      } else {
        add_edit(tp[arr_i], te[end_i], "[]")
      }
      return
    }
  }
}

function build_template(   out, c, l) {
  out = "{\"isWhitelist\":false,\"appList\":["
  c = 0
  while ((getline l < applist) > 0) {
    sub(/\r$/, "", l)
    if (l == "") continue
    c++
    out = out (c > 1 ? "," : "") "\"" jesc(l) "\""
  }
  close(applist)
  return out "]}"
}

BEGIN {
  RS = "\001"
  if ((getline raw < cfg) <= 0) raw = ""
  close(cfg)
  RS = "\n"
  if (raw == "") raw = "{}"

  # Rename the legacy Specter template and every reference to it in place.
  if (legacytpl != "" && legacytpl != tpl) {
    gsub("\"" jesc(legacytpl) "\"", "\"" jesc(tpl) "\"", raw)
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

  cfg_i = 0; tpl_i = 0; scope_i = 0; def_i = 0
  for (m = 1; m <= nm; m++) {
    if (mk[m] == "configVersion") cfg_i = m
    else if (mk[m] == "templates") tpl_i = m
    else if (mk[m] == "scope") scope_i = m
    else if (mk[m] == "defaultConfig") def_i = m
  }

  defjson = ""
  if ((getline d < deffile) > 0) { sub(/\r$/, "", d); defjson = d }
  close(deffile)

  tpl_new = build_template()
  root_parts = ""

  # Apps that should keep the generated template applied. When user-app
  # targeting is disabled this list is empty and existing scope is left alone.
  wanted_count = 0
  while ((getline w < scopefile) > 0) {
    sub(/\r$/, "", w)
    tabi = index(w, "\t")
    if (tabi > 0) {
      wanted[substr(w, 1, tabi - 1)] = 1
      wanted_count++
    }
  }
  close(scopefile)

  if (skiptpl != "1") {
    if (tpl_i > 0) {
      if (tk[mvi0[tpl_i]] == "{") {
        tpl_hasany = scan_obj(mvi0[tpl_i], mvi1[tpl_i], tset)
        if (tpl in tset) {
          vi = tset[tpl]
          add_edit(tp[vi], te[skipv(vi) - 1], tpl_new)
        } else {
          ins = "\"" jesc(tpl) "\":" tpl_new
          if (tpl_hasany) ins = ins ","
          add_edit(te[mvi0[tpl_i]], te[mvi0[tpl_i]], ins)
        }
      } else {
        add_edit(mvs[tpl_i], mve[tpl_i], "{\"" jesc(tpl) "\":" tpl_new "}")
      }
    } else {
      root_parts = root_parts "\"templates\":{\"" jesc(tpl) "\":" tpl_new "}"
    }
  }

  scope_exists = (scope_i > 0 && tk[mvi0[scope_i]] == "{")
  scope_hasany = 0
  if (scope_exists) scope_hasany = scan_obj(mvi0[scope_i], mvi1[scope_i], sset)

  # Detach the generated template from existing scope entries that are no
  # longer in the desired applied-to set (e.g. apps listed as invisible).
  # prune=1 keeps this working when the desired set is empty.
  prune_scope = (prune == "1" || (prune == "" && wanted_count > 0))
  if (scope_exists && prune_scope) {
    for (p in sset) {
      if (p in wanted) continue
      ac_start = sset[p]
      ac_end = skipv(ac_start) - 1
      if (tk[ac_start] != "{") continue
      clear_arr(acset)
      scan_obj(ac_start, ac_end, acset)
      if ("applyTemplates" in acset) {
        arr = acset["applyTemplates"]
        if (tk[arr] == "[") array_remove_value(arr, tpl)
      }
    }
  }

  nadds = 0; addtext = ""
  while ((getline l < scopefile) > 0) {
    sub(/\r$/, "", l)
    if (l == "") continue
    tabi = index(l, "\t")
    if (tabi == 0) continue
    p = substr(l, 1, tabi - 1); js = substr(l, tabi + 1)
    if (scope_exists && (p in sset)) continue
    nadds++
    addtext = addtext (nadds > 1 ? "," : "") "\"" jesc(p) "\":" js
  }
  close(scopefile)

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

  if (def_i > 0) {
    if (tk[mvi0[def_i]] == "null") add_edit(mvs[def_i], mve[def_i], defjson)
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
  unset _hmc_base _hmc_apps _hmc_scope _hmc_default _hmc_out _hmc_skip _hmc_timeout _hmc_prune
  return "$_hmc_rc"
}

# Read the existing config even when it is system-owned (WebUI sandbox).
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

# Atomic write + system ownership (issue #158: HMAService only ever checks
# R_OK|W_OK as uid 1000, it never repairs ownership itself).
_hma_install_config() {
  _hic_src="$1" _hic_dst="$2" _hic_dir="$3"
  _hic_ok=0
  if cp -f "$_hic_src" "$_hic_dst.specter.new" 2>/dev/null &&
     chown "$HMAOSS_UID:$HMAOSS_UID" "$_hic_dst.specter.new" 2>/dev/null &&
     chmod 600 "$_hic_dst.specter.new" 2>/dev/null &&
     mv -f "$_hic_dst.specter.new" "$_hic_dst" 2>/dev/null; then
    _hic_ok=1
  else
    rm -f "$_hic_dst.specter.new" 2>/dev/null || true
    _hma_timeout "$HMAOSS_CMD_TIMEOUT" su -c "cp -f '$_hic_src' '$_hic_dst.specter.new' && chown $HMAOSS_UID:$HMAOSS_UID '$_hic_dst.specter.new' && chmod 600 '$_hic_dst.specter.new' && mv -f '$_hic_dst.specter.new' '$_hic_dst'" 2>/dev/null && _hic_ok=1
  fi
  if [ "$_hic_ok" = "1" ]; then
    chown "$HMAOSS_UID:$HMAOSS_UID" "$_hic_dir" 2>/dev/null || \
      _hma_timeout "$HMAOSS_CMD_TIMEOUT" su -c "chown $HMAOSS_UID:$HMAOSS_UID '$_hic_dir'" 2>/dev/null || true
    if command -v restorecon >/dev/null 2>&1; then
      restorecon "$_hic_dst" 2>/dev/null || \
        _hma_timeout "$HMAOSS_CMD_TIMEOUT" su -c "restorecon '$_hic_dst'" 2>/dev/null || true
    fi
  fi
  unset _hic_src _hic_dst _hic_dir
  [ "$_hic_ok" = "1" ]
}

_hma_tmp_base() {
  if mkdir -p "$SPECTER_DIR/tmp" 2>/dev/null && : > "$SPECTER_DIR/tmp/.hma_probe" 2>/dev/null; then
    rm -f "$SPECTER_DIR/tmp/.hma_probe" 2>/dev/null || true
    printf '%s\n' "$SPECTER_DIR/tmp"
  else
    printf '%s\n' /data/local/tmp
  fi
  return 0
}

HMAOSS_ACTIVITY="org.frknkrc44.hma_oss.ui.activity.MainActivity"

# Returns open, skip, or ask so both launch paths read the setting the same way.
_hma_launch_policy() {
  case "$(cfg_get "hma_launch_mode" "prompt")" in
    always) printf 'open\n' ;;
    never) printf 'skip\n' ;;
    *) printf 'ask\n' ;;
  esac
}

_hma_open_ui() {
  _hma_timeout 10 am start -n "$HMAOSS_PKG/$HMAOSS_ACTIVITY" >/dev/null 2>&1 && return 0
  _hma_timeout 10 monkey -p "$HMAOSS_PKG" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
}

# HMA-OSS only reloads its file through the Home status-card long-press, so
# drive that gesture once. Best effort: non-zero means the UI was not reached.
# Set SPECTER_HMA_NO_UI_RELOAD=1 to skip. $1 = scratch dir for the UI dump.
_hma_request_reload() {
  _hml_dir="${1:-/data/local/tmp}"
  [ "${SPECTER_HMA_NO_UI_RELOAD:-}" = "1" ] && return 1
  _hml_end=$(( $(date +%s) + 12 ))
  command -v am >/dev/null 2>&1 || return 1
  command -v input >/dev/null 2>&1 || return 1
  command -v uiautomator >/dev/null 2>&1 || return 1

  _hml_prev=$(_hma_timeout 10 dumpsys activity activities 2>/dev/null | grep 'mResumedActivity' | head -1 | \
    sed -n 's/.* u[0-9][0-9]* \([^ ]*\) t[0-9].*/\1/p')
  [ "$_hml_prev" = "$HMAOSS_PKG/$HMAOSS_ACTIVITY" ] && _hml_prev=""

  if ! _hma_timeout 15 am start -n "$HMAOSS_PKG/$HMAOSS_ACTIVITY" >/dev/null 2>&1; then
    unset _hml_prev _hml_dir
    return 1
  fi

  _hml_focus=0
  _hml_i=0
  while [ "$_hml_i" -lt 20 ]; do
    [ "$(date +%s)" -ge "$_hml_end" ] && break
    if _hma_timeout 10 dumpsys window 2>/dev/null | grep -q "mCurrentFocus=.*$HMAOSS_PKG"; then
      _hml_focus=1
      break
    fi
    sleep 0.25 2>/dev/null || sleep 1
    _hml_i=$((_hml_i + 1))
  done

  _hml_rc=1
  _hml_dump="$_hml_dir/.specter_hma_ui.$$"
  if [ "$_hml_focus" = "1" ]; then
    _hml_bounds=""
    _hml_i=0
    while [ "$_hml_i" -lt 6 ]; do
      [ "$(date +%s)" -ge "$_hml_end" ] && break
      sleep 0.5 2>/dev/null || sleep 1
      if _hma_timeout 15 uiautomator dump "$_hml_dump" >/dev/null 2>&1; then
        # The whole hierarchy is one line, so split tags before matching.
        _hml_bounds=$(tr '>' '\n' < "$_hml_dump" 2>/dev/null | grep 'status_card' | \
          grep -o 'bounds="\[[0-9-]*,[0-9-]*\]\[[0-9-]*,[0-9-]*\]"' | head -1)
      fi
      [ -n "$_hml_bounds" ] && break
      _hml_i=$((_hml_i + 1))
    done
    if [ -n "$_hml_bounds" ]; then
      _hml_cx=$(printf '%s' "$_hml_bounds" | awk -F'[^0-9]+' '{print int(($2 + $4) / 2)}')
      _hml_cy=$(printf '%s' "$_hml_bounds" | awk -F'[^0-9]+' '{print int(($3 + $5) / 2)}')
      if [ -n "$_hml_cx" ] && [ -n "$_hml_cy" ]; then
        sleep 0.5 2>/dev/null || true
        _hma_timeout 10 input swipe "$_hml_cx" "$_hml_cy" "$_hml_cx" "$_hml_cy" 900 2>/dev/null && _hml_rc=0
        sleep 1 2>/dev/null || true
      fi
    fi
  fi
  rm -f "$_hml_dump" 2>/dev/null || true

  if [ -n "$_hml_prev" ]; then
    _hma_timeout 15 am start -n "$_hml_prev" >/dev/null 2>&1 || true
  fi

  unset _hml_dir _hml_prev _hml_focus _hml_i _hml_dump _hml_bounds _hml_cx _hml_cy _hml_end
  return "$_hml_rc"
}
