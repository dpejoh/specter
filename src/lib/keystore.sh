# shellcheck shell=sh
# Keystore-manager abstraction: makes the rest of the codebase agnostic to
# whether Tricky Store or OhMyKeymint is the active spoofer backend.
#
# Callers must invoke detect_keystore_manager() after sourcing common.sh and
# before touching any KSM_* variable — detection depends on cfg_get, which
# needs CONFIG_DIR resolved, and results are not cached across processes
# (feature scripts run from the WebUI as fresh `sh` invocations).

detect_keystore_manager() {
  _dkm_override=$(cfg_get keystore_manager auto 2>/dev/null)
  case "$_dkm_override" in
    trickystore) KSM=trickystore ;;
    omk) KSM=omk ;;
    *)
      if [ -n "$(_ts_prop)" ]; then
        KSM=trickystore
      elif [ -n "$(_omk_prop)" ]; then
        KSM=omk
      else
        KSM=none
      fi
      ;;
  esac

  case "$KSM" in
    trickystore)
      KSM_NAME="Tricky Store"
      KSM_DIR="$TRICKY_DIR"
      KSM_KEYBOX="$TARGET_FILE"
      KSM_TARGETS="$TARGET_TXT"
      KSM_SECURITY="$SECURITY_PATCH_FILE"
      KSM_LOCKED="$LOCKED_FILE"
      KSM_FORMAT="txt"
      ;;
    omk)
      KSM_NAME="OhMyKeymint"
      KSM_DIR="$OMK_DIR"
      KSM_KEYBOX="$OMK_KEYBOX"
      KSM_TARGETS="$OMK_INJECTOR"
      KSM_SECURITY="$OMK_CONFIG"
      KSM_LOCKED=""
      KSM_FORMAT="toml"
      ;;
    *)
      KSM_NAME=""
      KSM_DIR=""
      KSM_KEYBOX=""
      KSM_TARGETS=""
      KSM_SECURITY=""
      KSM_LOCKED=""
      KSM_FORMAT=""
      ;;
  esac

  export KSM KSM_NAME KSM_DIR KSM_KEYBOX KSM_TARGETS KSM_SECURITY KSM_LOCKED KSM_FORMAT
  unset _dkm_override
}

ksm_available() {
  [ "$KSM" != "none" ] && [ -n "$KSM_DIR" ] && [ -d "$KSM_DIR" ]
}

# OMK keymint only — injector restart stops keystore2.
# Explicit tools only; Hot apply covers Specter config writes.
ksm_reload() {
  [ "$KSM" = "omk" ] || return 0
  mkdir -p "$OMK_RESTART_DIR" 2>/dev/null || true
  touch "$OMK_RESTART_DIR/restart.keymint" 2>/dev/null
}

ksm_reload_full() {
  [ "$KSM" = "omk" ] || return 0
  mkdir -p "$OMK_RESTART_DIR" 2>/dev/null || true
  touch "$OMK_RESTART_DIR/restart.keymint" 2>/dev/null
  touch "$OMK_RESTART_DIR/restart.injector" 2>/dev/null
  touch "$OMK_RESTART_DIR/restart.all" 2>/dev/null
}

# OMK's keymint/injector processes drop to uid 1017 (AID_KEYSTORE) and read
# their files at mode 0600, so anything we write into the OMK data dir must be
# owned by 1017 with a keystore-readable context — a plain mv/cp from
# /data/local/tmp leaves it root-owned and unreadable to the daemon. No-op for
# Tricky Store, whose files just live under /data/adb. Dirs pass mode 0770.
ksm_secure() {
  [ "$KSM" = "omk" ] || return 0
  _kse_path="$1" _kse_mode="${2:-0600}"
  [ -e "$_kse_path" ] || { unset _kse_path _kse_mode; return 0; }
  chown 1017:1017 "$_kse_path" 2>/dev/null || true
  chmod "$_kse_mode" "$_kse_path" 2>/dev/null || true
  chcon u:object_r:keystore_data_file:s0 "$_kse_path" 2>/dev/null \
    || restorecon "$_kse_path" 2>/dev/null || true
  unset _kse_path _kse_mode
}

_ksm_strip_suffix() {
  _kss_line="$1"
  case "$_kss_line" in *!) _kss_line=${_kss_line%!} ;; *\?) _kss_line=${_kss_line%\?} ;; esac
  printf '%s' "$_kss_line"
  unset _kss_line
}

# Prints the active target list as bare packages, one per line, regardless
# of backend format.
ksm_read_targets() {
  [ -f "$KSM_TARGETS" ] || return 0
  case "$KSM_FORMAT" in
    toml)
      _toml_read_scoop "$KSM_TARGETS"
      ;;
    *)
      while IFS= read -r _krt_line || [ -n "$_krt_line" ]; do
        [ -z "$_krt_line" ] && continue
        case "$_krt_line" in \[*\]) continue ;; esac
        _krt_base=$(_ksm_strip_suffix "$_krt_line")
        [ -n "$_krt_base" ] && printf '%s\n' "$_krt_base"
      done < "$KSM_TARGETS"
      unset _krt_line _krt_base
      ;;
  esac
}

# Raw seed for building a new staging file: preserves the native file's
# lines (including !/? suffixes and any [section] header lines) for txt
# backends; identical to ksm_read_targets for toml backends, which have no
# such lines to preserve.
ksm_read_targets_raw() {
  case "$KSM_FORMAT" in
    toml) ksm_read_targets ;;
    *) [ -f "$KSM_TARGETS" ] && cat "$KSM_TARGETS" ;;
  esac
}

# Commits a Tricky-Store-format staging file (bare or !/? suffixed lines,
# [section] header lines allowed) as the new target list for the active
# manager. txt backends get it verbatim; toml backends get the suffixes
# stripped and folded into the injector's scoop array.
ksm_commit_targets() {
  _kct_src="$1"
  case "$KSM_FORMAT" in
    toml)
      _kct_tmp="${KSM_TARGETS}.pkgs.$$"
      : > "$_kct_tmp"
      while IFS= read -r _kct_line || [ -n "$_kct_line" ]; do
        [ -z "$_kct_line" ] && continue
        case "$_kct_line" in \[*\]) continue ;; esac
        _kct_base=$(_ksm_strip_suffix "$_kct_line")
        [ -n "$_kct_base" ] && printf '%s\n' "$_kct_base" >> "$_kct_tmp"
      done < "$_kct_src"
      _toml_write_scoop "$KSM_TARGETS" < "$_kct_tmp"
      rm -f "$_kct_tmp"
      ksm_secure "$KSM_DIR" 0770
      ksm_secure "$KSM_TARGETS" 0600
      unset _kct_line _kct_base _kct_tmp
      ;;
    *)
      rm -f "${KSM_TARGETS}.bak"
      [ -f "$KSM_TARGETS" ] && cp "$KSM_TARGETS" "${KSM_TARGETS}.bak"
      mv -f "$_kct_src" "$KSM_TARGETS"
      ;;
  esac
  unset _kct_src
}

ksm_set_security_patch() {
  _ksp_date="$1"
  case "$KSM_FORMAT" in
    toml)
      _toml_set_trust_key "$KSM_SECURITY" "security_patch" "\"$_ksp_date\""
      ksm_secure "$KSM_DIR" 0770
      ksm_secure "$KSM_SECURITY" 0600
      ;;
    *)
      printf 'all=%s\n' "$_ksp_date" > "$KSM_SECURITY" || { unset _ksp_date; return 1; }
      ;;
  esac
  unset _ksp_date
}

# Installs a keybox file for the active manager. MODE "copy" preserves SRC
# (e.g. a user-provided custom keybox); default "move" consumes it (e.g. a
# decoded download temp file).
ksm_install_keybox() {
  _kik_src="$1" _kik_mode="${2:-move}"
  mkdir -p "$(dirname "$KSM_KEYBOX")" 2>/dev/null
  if [ "$_kik_mode" = "copy" ]; then
    cp "$_kik_src" "$KSM_KEYBOX" || { unset _kik_src _kik_mode; return 1; }
  else
    mv "$_kik_src" "$KSM_KEYBOX" || { unset _kik_src _kik_mode; return 1; }
  fi
  ksm_secure "$KSM_DIR" 0770
  ksm_secure "$KSM_KEYBOX" 0600
  unset _kik_src _kik_mode
}

# -- TOML helpers (private) --
# Deliberately minimal: only understands the two shapes Specter needs to
# read/write (a top-level `scoop = [...]` array and a `KEY = VALUE` line
# inside a `[trust]` table), not the full TOML grammar.

_toml_read_scoop() {
  _trs_file="$1"
  [ -f "$_trs_file" ] || return 0
  awk '
    BEGIN { capture = 0 }
    {
      line = $0
      if (!capture) {
        if (line ~ /^[ ]*scoop[ ]*=/) {
          capture = 1
          sub(/^[ ]*scoop[ ]*=[ ]*/, "", line)
        } else {
          next
        }
      }
      while (match(line, /"[^"]*"/)) {
        print substr(line, RSTART + 1, RLENGTH - 2)
        line = substr(line, RSTART + RLENGTH)
      }
      if (line ~ /\]/) capture = 0
    }
  ' "$_trs_file"
}

# Reads packages (one per line) from stdin and rewrites the `scoop` array
# in FILE, preserving everything else. Idempotent: re-running with the same
# input reproduces the same output byte-for-byte.
_toml_write_scoop() {
  _tws_file="$1"
  _tws_block="${_tws_file}.block.$$"
  {
    printf 'scoop = [\n'
    while IFS= read -r _tws_pkg || [ -n "$_tws_pkg" ]; do
      [ -z "$_tws_pkg" ] && continue
      printf '  "%s",\n' "$_tws_pkg"
    done
    printf ']\n'
  } > "$_tws_block"

  _tws_tmp="${_tws_file}.new.$$"

  if [ -f "$_tws_file" ] && grep -Eq '^[ ]*scoop[ ]*=' "$_tws_file"; then
    awk -v blockfile="$_tws_block" '
      function emit(   line) { while ((getline line < blockfile) > 0) print line; close(blockfile) }
      {
        if (capture) { if ($0 ~ /\]/) capture = 0; next }
        if ($0 ~ /^[ ]*scoop[ ]*=/) {
          emit()
          if ($0 !~ /\]/) capture = 1
          next
        }
        print
      }
    ' "$_tws_file" > "$_tws_tmp"
  elif [ -f "$_tws_file" ] && grep -Eq '^[ ]*\[' "$_tws_file"; then
    awk -v blockfile="$_tws_block" '
      function emit(   line) { while ((getline line < blockfile) > 0) print line; close(blockfile) }
      BEGIN { injected = 0 }
      {
        if (!injected && $0 ~ /^[ ]*\[/) { emit(); injected = 1 }
        print
      }
    ' "$_tws_file" > "$_tws_tmp"
  else
    cat "$_tws_block" > "$_tws_tmp"
    if [ -f "$_tws_file" ] && [ -s "$_tws_file" ]; then
      printf '\n' >> "$_tws_tmp"
      cat "$_tws_file" >> "$_tws_tmp"
    fi
  fi

  mv "$_tws_tmp" "$_tws_file"
  rm -f "$_tws_block"
  unset _tws_file _tws_block _tws_tmp _tws_pkg
}

# Sets KEY = VALUE inside the [trust] table of FILE, creating the table (and
# the file) if needed. VALUE must already be TOML-formatted (quoted string,
# bare number/bool, etc). Idempotent.
_toml_set_trust_key() {
  _tsk_file="$1" _tsk_key="$2" _tsk_val="$3"
  _tsk_tmp="${_tsk_file}.new.$$"

  if [ -f "$_tsk_file" ] && grep -Eq '^\[trust\]' "$_tsk_file"; then
    awk -v key="$_tsk_key" -v val="$_tsk_val" '
      BEGIN { in_trust = 0; done = 0 }
      /^\[/ {
        if (in_trust && !done) { print key " = " val; done = 1 }
        in_trust = ($0 == "[trust]")
        print
        next
      }
      {
        if (in_trust && !done && $0 ~ ("^[ ]*" key "[ ]*=")) {
          print key " = " val
          done = 1
          next
        }
        print
      }
      END {
        if (in_trust && !done) print key " = " val
      }
    ' "$_tsk_file" > "$_tsk_tmp"
  else
    if [ -f "$_tsk_file" ]; then cat "$_tsk_file" > "$_tsk_tmp"; else : > "$_tsk_tmp"; fi
    printf '\n[trust]\n%s = %s\n' "$_tsk_key" "$_tsk_val" >> "$_tsk_tmp"
  fi

  mv "$_tsk_tmp" "$_tsk_file"
  unset _tsk_file _tsk_key _tsk_val _tsk_tmp
}
