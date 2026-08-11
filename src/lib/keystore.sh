# shellcheck shell=sh
# Keystore backends: Tricky Store / TEESimulator-RS (txt), JingMatrix teesim (json), OMK (toml).
# Call detect_keystore_manager() after common.sh before using KSM_*.

detect_keystore_manager() {
  _dkm_override=$(cfg_get keystore_manager auto 2>/dev/null)
  case "$_dkm_override" in
    trickystore) KSM=trickystore ;;
    teesim) KSM=teesim ;;
    omk) KSM=omk ;;
    *)
      if [ -n "$(_ts_prop)" ]; then
        KSM=trickystore
      elif [ -n "$(_teesim_prop)" ]; then
        KSM=teesim
      elif [ -n "$(_omk_prop)" ]; then
        KSM=omk
      else
        KSM=none
      fi
      ;;
  esac

  case "$KSM" in
    trickystore)
      KSM_NAME=$(_ts_prop)
      [ -n "$KSM_NAME" ] || KSM_NAME="Tricky Store"
      KSM_DIR="$TRICKY_DIR"
      KSM_KEYBOX="$TARGET_FILE"
      KSM_TARGETS="$TARGET_TXT"
      KSM_SECURITY="$SECURITY_PATCH_FILE"
      KSM_LOCKED="$LOCKED_FILE"
      KSM_FORMAT="txt"
      ;;
    teesim)
      KSM_NAME=$(_teesim_prop)
      [ -n "$KSM_NAME" ] || KSM_NAME="TEESimulator"
      KSM_DIR="$TEESIM_DIR"
      KSM_KEYBOX="$TEESIM_KEYBOX"
      KSM_TARGETS="$TEESIM_CONFIG"
      KSM_SECURITY="$TEESIM_CONFIG"
      KSM_LOCKED=""
      KSM_FORMAT="json"
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

# Explicit Tools for injector; keymint also auto-touches on trust field saves.
ksm_reload() {
  [ "$KSM" = "omk" ] || return 0
  mkdir -p "$OMK_RESTART_DIR" 2>/dev/null || true
  touch "$OMK_RESTART_DIR/restart.keymint" 2>/dev/null
}

ksm_reload_injector() {
  [ "$KSM" = "omk" ] || return 0
  mkdir -p "$OMK_RESTART_DIR" 2>/dev/null || true
  touch "$OMK_RESTART_DIR/restart.injector" 2>/dev/null
}

_ksm_inplace_from() {
  _kif_src="$1" _kif_dst="$2"
  [ -f "$_kif_dst" ] || { unset _kif_src _kif_dst; return 1; }
  cat "$_kif_src" > "$_kif_dst" || { unset _kif_src _kif_dst; return 1; }
  unset _kif_src _kif_dst
}

_ksm_strip_suffix() {
  _kss_line="$1"
  case "$_kss_line" in *!) _kss_line=${_kss_line%!} ;; *\?) _kss_line=${_kss_line%\?} ;; esac
  printf '%s' "$_kss_line"
  unset _kss_line
}

ksm_read_targets() {
  case "$KSM_FORMAT" in
    json)
      _teesim_read_apps "$KSM_TARGETS"
      ;;
    toml)
      [ -f "$KSM_TARGETS" ] || return 0
      _toml_read_scoop "$KSM_TARGETS"
      ;;
    *)
      [ -f "$KSM_TARGETS" ] || return 0
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

ksm_read_targets_raw() {
  case "$KSM_FORMAT" in
    json|toml) ksm_read_targets ;;
    *) [ -f "$KSM_TARGETS" ] && cat "$KSM_TARGETS" ;;
  esac
}

ksm_commit_targets() {
  _kct_src="$1"
  case "$KSM_FORMAT" in
    json)
      _teesim_commit_apps "$KSM_TARGETS" "$_kct_src" || {
        unset _kct_src
        return 1
      }
      ;;
    toml)
      _kct_tmp="${KSM_TARGETS}.pkgs.$$"
      : > "$_kct_tmp"
      while IFS= read -r _kct_line || [ -n "$_kct_line" ]; do
        [ -z "$_kct_line" ] && continue
        case "$_kct_line" in \[*\]) continue ;; esac
        _kct_base=$(_ksm_strip_suffix "$_kct_line")
        [ -n "$_kct_base" ] && printf '%s\n' "$_kct_base" >> "$_kct_tmp"
      done < "$_kct_src"
      _toml_write_scoop "$KSM_TARGETS" < "$_kct_tmp" || {
        rm -f "$_kct_tmp"
        unset _kct_line _kct_base _kct_tmp _kct_src
        return 1
      }
      rm -f "$_kct_tmp"
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

ksm_get_security_patch() {
  case "$KSM_FORMAT" in
    json)
      _teesim_get_boot_patch "$KSM_SECURITY"
      ;;
    toml)
      [ -f "$KSM_SECURITY" ] || return 1
      grep -E '^[ ]*security_patch[ ]*=' "$KSM_SECURITY" 2>/dev/null | head -1 |
        sed 's/.*=[ ]*"\([^"]*\)".*/\1/'
      ;;
    *)
      [ -f "$KSM_SECURITY" ] || return 1
      _kgsp=$(grep -E '^boot=' "$KSM_SECURITY" 2>/dev/null | head -1 | cut -d= -f2) || _kgsp=""
      [ -n "$_kgsp" ] || _kgsp=$(grep -E '^all=' "$KSM_SECURITY" 2>/dev/null | head -1 | cut -d= -f2) || _kgsp=""
      [ -n "$_kgsp" ] || { unset _kgsp; return 1; }
      printf '%s\n' "$_kgsp"
      unset _kgsp
      ;;
  esac
}

ksm_set_security_patch() {
  _ksp_date="$1"
  case "$KSM_FORMAT" in
    json)
      _teesim_set_patch "$KSM_SECURITY" "$_ksp_date" || {
        unset _ksp_date
        return 1
      }
      ;;
    toml)
      _toml_set_trust_key "$KSM_SECURITY" "security_patch" "\"$_ksp_date\"" || {
        unset _ksp_date
        return 1
      }
      ;;
    *)
      _ksp_vendor=$(getprop ro.vendor.build.security_patch 2>/dev/null || echo "")
      if [ -z "$_ksp_vendor" ] && [ -f /vendor/build.prop ]; then
        _ksp_vendor=$(grep '^ro.vendor.build.security_patch=' /vendor/build.prop 2>/dev/null |
          head -1 | cut -d= -f2 | tr -d '[:space:]') || _ksp_vendor=""
      fi
      [ -n "$_ksp_vendor" ] || _ksp_vendor="$_ksp_date"
      _ksp_yyyymm=$(printf '%s' "$_ksp_date" | cut -d'-' -f1-2 | tr -d '-')
      printf 'system=%s\nboot=%s\nvendor=%s\n' "$_ksp_yyyymm" "$_ksp_date" "$_ksp_vendor" \
        > "$KSM_SECURITY" || { unset _ksp_date _ksp_vendor _ksp_yyyymm; return 1; }
      unset _ksp_vendor _ksp_yyyymm
      ;;
  esac
  unset _ksp_date
}

ksm_get_mode() {
  case "$KSM_FORMAT" in
    json) _teesim_get_mode "$KSM_TARGETS" ;;
    *) printf '' ;;
  esac
}

ksm_set_mode() {
  case "$KSM_FORMAT" in
    json) _teesim_set_mode "$KSM_TARGETS" "$1" ;;
    *) return 1 ;;
  esac
}

ksm_get_trust_field() {
  _kgt_key="$1"
  case "$KSM_FORMAT" in
    toml) _toml_get_trust_key "$KSM_SECURITY" "$_kgt_key" ;;
    *) printf '' ;;
  esac
  unset _kgt_key
}

ksm_set_trust_field() {
  _kst_key="$1" _kst_val="$2"
  case "$KSM_FORMAT" in
    toml)
      case "$_kst_key" in
        os_version)
          _toml_set_trust_key "$KSM_SECURITY" "os_version" "$_kst_val"
          ;;
        vb_key|vb_hash)
          _toml_set_trust_key "$KSM_SECURITY" "$_kst_key" "\"$_kst_val\""
          ;;
      esac
      ksm_reload
      ;;
    *) return 1 ;;
  esac
  unset _kst_key _kst_val
}

# MODE "copy" keeps SRC; default "move" consumes it.
ksm_install_keybox() {
  _kik_src="$1" _kik_mode="${2:-move}"
  case "$KSM" in
    omk)
      _ksm_inplace_from "$_kik_src" "$KSM_KEYBOX" || {
        unset _kik_src _kik_mode
        return 1
      }
      [ "$_kik_mode" = "copy" ] || rm -f "$_kik_src"
      ;;
    teesim)
      mkdir -p "$TEESIM_DIR" 2>/dev/null
      if [ "$_kik_mode" = "copy" ]; then
        cp "$_kik_src" "$KSM_KEYBOX" || { unset _kik_src _kik_mode; return 1; }
      else
        mv "$_kik_src" "$KSM_KEYBOX" || { unset _kik_src _kik_mode; return 1; }
      fi
      _teesim_ensure_keybox_field "$TEESIM_CONFIG" || {
        unset _kik_src _kik_mode
        return 1
      }
      ;;
    *)
      mkdir -p "$(dirname "$KSM_KEYBOX")" 2>/dev/null
      if [ "$_kik_mode" = "copy" ]; then
        cp "$_kik_src" "$KSM_KEYBOX" || { unset _kik_src _kik_mode; return 1; }
      else
        mv "$_kik_src" "$KSM_KEYBOX" || { unset _kik_src _kik_mode; return 1; }
      fi
      ;;
  esac
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

# stdin packages → rewrite scoop in FILE; leave other keys alone.
_toml_write_scoop() {
  _tws_file="$1"
  [ -f "$_tws_file" ] || { unset _tws_file; return 1; }

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

  if grep -Eq '^[ ]*scoop[ ]*=' "$_tws_file"; then
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
  elif grep -Eq '^[ ]*\[' "$_tws_file"; then
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
    if [ -s "$_tws_file" ]; then
      printf '\n' >> "$_tws_tmp"
      cat "$_tws_file" >> "$_tws_tmp"
    fi
  fi

  _ksm_inplace_from "$_tws_tmp" "$_tws_file" || {
    rm -f "$_tws_tmp" "$_tws_block"
    unset _tws_file _tws_block _tws_tmp _tws_pkg
    return 1
  }
  rm -f "$_tws_tmp" "$_tws_block"
  unset _tws_file _tws_block _tws_tmp _tws_pkg
}

# VALUE must already be TOML-shaped (quoted string, bare number/bool, …).
_toml_set_trust_key() {
  _tsk_file="$1" _tsk_key="$2" _tsk_val="$3"
  [ -f "$_tsk_file" ] || { unset _tsk_file _tsk_key _tsk_val; return 1; }

  _tsk_tmp="${_tsk_file}.new.$$"

  if grep -Eq '^\[trust\]' "$_tsk_file"; then
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
    cat "$_tsk_file" > "$_tsk_tmp"
    printf '\n[trust]\n%s = %s\n' "$_tsk_key" "$_tsk_val" >> "$_tsk_tmp"
  fi

  _ksm_inplace_from "$_tsk_tmp" "$_tsk_file" || {
    rm -f "$_tsk_tmp"
    unset _tsk_file _tsk_key _tsk_val _tsk_tmp
    return 1
  }
  rm -f "$_tsk_tmp"
  unset _tsk_file _tsk_key _tsk_val _tsk_tmp
}

_toml_get_trust_key() {
  _tgk_file="$1" _tgk_key="$2"
  [ -f "$_tgk_file" ] || return 1
  grep -E '^[ ]*'"$_tgk_key"'[ ]*=' "$_tgk_file" 2>/dev/null \
    | head -1 | sed 's/.*=[ ]*//; s/^"//; s/"$//; s/[[:space:]]*$//'
  unset _tgk_file _tgk_key
}
