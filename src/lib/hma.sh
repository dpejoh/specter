# shellcheck shell=sh
# HMA-OSS (frknkrc44) config integration.
#
# HMA-OSS keeps its config in /data/misc/hide_my_applist*/config.json, written
# by the system_server-side HMAService (uid 1000 "system"). The app never
# touches the file itself, and external edits are only picked up on reboot or
# via the HMA-OSS Home long-press (reloadConfigFromFile).
#
# Specter merges a generated hiding profile into the existing file and leaves
# everything it does not manage byte-for-byte intact:
#   - upserts the Specter template with only the hide-list packages that are
#     actually installed on this device
#   - adds a standard per-app config for every user app (all apps become
#     targets that cannot see the hidden apps)
#   - sets defaultConfig for future installs only when the user has none
#   - drops configVersion so the file parses as the running HMA-OSS build
#   - chowns the file back to system:system (issue #158)

HMAOSS_PKG="org.frknkrc44.hma_oss"
HMAOSS_TEMPLATE="HIDE MY CUSTOM APP"
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

_hma_installed() {
  _hma_timeout "$HMAOSS_CMD_TIMEOUT" pm list packages 2>/dev/null | sed 's/^package://' | sort -u || true
  return 0
}

# User apps that become hiding targets, minus the Specter blacklist.
_hma_user_apps() {
  _hua_all=$(_hma_timeout "$HMAOSS_CMD_TIMEOUT" pm list packages -3 2>/dev/null | sed 's/^package://' | sort -u) || _hua_all=""
  if [ -z "$_hua_all" ]; then
    unset _hua_all
    return 0
  fi
  _hua_bl=""
  if [ -f "$SPECTER_DIR/blacklist_enabled" ] && [ -s "$SPECTER_DIR/blacklist.txt" ]; then
    _hua_bl=$(cat "$SPECTER_DIR/blacklist.txt")
  fi
  printf '%s\n' "$_hua_all" | while IFS= read -r _hua_p; do
    [ -n "$_hua_p" ] || continue
    [ "$_hua_p" = "$HMAOSS_PKG" ] && continue
    if [ -n "$_hua_bl" ] && printf '%s\n' "$_hua_bl" | grep -Fxq "$_hua_p" 2>/dev/null; then
      continue
    fi
    printf '%s\n' "$_hua_p"
  done
  unset _hua_all _hua_bl _hua_p
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
  while IFS= read -r _hfl_line || [ -n "$_hfl_line" ]; do
    _hfl_line=$(printf '%s' "$_hfl_line" | tr -d '\r')
    case "$_hfl_line" in ''|\#*) continue ;; esac
    _hfl_line=${_hfl_line%% *}
    [ -n "$_hfl_line" ] || continue
    grep -Fxq "$_hfl_line" "$_hfl_inst" 2>/dev/null && printf '%s\n' "$_hfl_line" >> "$_hfl_out"
  done < "$_hfl_list"
  sort -u "$_hfl_out" -o "$_hfl_out" 2>/dev/null || true
  unset _hfl_list _hfl_inst _hfl_out _hfl_line
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
  _hbs_apps="$1" _hbs_tpl="$2" _hbs_out="$3"
  _hbs_ac=$(_hma_appconfig_json "$_hbs_tpl")
  : > "$_hbs_out"
  while IFS= read -r _hbs_p || [ -n "$_hbs_p" ]; do
    [ -n "$_hbs_p" ] || continue
    printf '%s\t%s\n' "$_hbs_p" "$_hbs_ac" >> "$_hbs_out"
  done < "$_hbs_apps"
  unset _hbs_apps _hbs_tpl _hbs_out _hbs_ac _hbs_p
  return 0
}

# Lossless JSON merge: tokenizes the existing config, splices in the template,
# scope additions and defaultConfig, removes configVersion, and re-emits the
# original bytes everywhere else. Exits non-zero and writes nothing when the
# base is not a JSON object or the result does not balance.
_hma_merge_config() {
  _hmc_base="$1" _hmc_apps="$2" _hmc_scope="$3" _hmc_default="$4" _hmc_out="$5" _hmc_skip="${6:-}"
  _hmc_timeout="${7:-$HMAOSS_MERGE_TIMEOUT}"
  _hma_timeout "$_hmc_timeout" awk -v cfg="$_hmc_base" -v tpl="$HMAOSS_TEMPLATE" -v applist="$_hmc_apps" \
      -v scopefile="$_hmc_scope" -v deffile="$_hmc_default" -v skiptpl="$_hmc_skip" '
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

function scan_obj(vi0, vi1, kset,   i, k) {
  hasany = 0
  i = vi0 + 1
  while (i < vi1) {
    if (tk[i] ~ /^"/) {
      k = unquote(tk[i]); i++
      if (tk[i] == ":") i++
      hasany = 1
      kset[k] = i
      i = skipv(i)
      if (tk[i] == ",") i++
    } else i++
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
  if ((getline raw < cfg) > 0) { }
  close(cfg)
  RS = "\n"
  if (raw == "") raw = "{}"

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

  if (skiptpl != "1") {
    if (tpl_i > 0) {
      if (tk[mvi0[tpl_i]] == "{") {
        scan_obj(mvi0[tpl_i], mvi1[tpl_i], tset)
        if (tpl in tset) {
          vi = tset[tpl]
          add_edit(tp[vi], te[skipv(vi) - 1], tpl_new)
        } else {
          ins = "\"" jesc(tpl) "\":" tpl_new
          if (hasany) ins = ins ","
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
  if (scope_exists) scan_obj(mvi0[scope_i], mvi1[scope_i], sset)
  scope_hasany = hasany

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

  print out
}
' > "$_hmc_out"
  _hmc_rc=$?
  if [ "$_hmc_rc" -ne 0 ]; then
    rm -f "$_hmc_out" 2>/dev/null || true
  fi
  unset _hmc_base _hmc_apps _hmc_scope _hmc_default _hmc_out
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

# HMA-OSS reloads its service config from the file only through the status
# card long-press on its Home screen (the ServiceProvider is not exported and
# no broadcast/binder path exists), so drive that gesture once. Best effort:
# returns non-zero when the UI could not be reached, callers fall back to the
# reboot/long-press hint. Set SPECTER_HMA_NO_UI_RELOAD=1 to always skip.
# $1 = scratch directory for the UI dump.
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
