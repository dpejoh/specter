# shellcheck shell=sh

# Same mirror order as KOWX712/PlayIntegrityFix inject_s webui Update.ts
# $1 = path under repo (e.g. bot/device_prop/oriole_beta.prop)
pif_bot_mirror_urls() {
  printf '%s\n' \
    "https://fastly.jsdelivr.net/gh/KOWX712/PlayIntegrityFix@$1" \
    "https://raw.githubusercontent.com/KOWX712/PlayIntegrityFix/$1" \
    "https://gh.sevencdn.com/https://raw.githubusercontent.com/KOWX712/PlayIntegrityFix/$1"
}

pif_prop_get() {
  [ -f "$1" ] && [ -n "$2" ] || return 1
  sed -n "s/^$2=//p" "$1" 2>/dev/null | head -1
}

pif_prop_valid() {
  [ -n "$(pif_prop_get "$1" FINGERPRINT)" ] || return 1
  [ -n "$(pif_prop_get "$1" MODEL)" ] || return 1
  return 0
}

# $1 = module name (from module.prop name=)
pif_prop_dest() {
  case "$1" in
    *Fork*) printf '%s\n' "${PIF_DIR:-/data/adb/modules/playintegrityfix}/custom.pif.prop" ;;
    *) printf '%s\n' "/data/adb/pif.prop" ;;
  esac
}

# $1 = preferred lines "MODEL|PRODUCT" or "MODEL|imported:ID"
# Prints one surviving line; return 1 if none remain.
pif_choose_preferred() {
  _cpp_prefs="$1"
  _cpp_ok=""
  _cpp_n=0
  while IFS= read -r _cpp_line || [ -n "$_cpp_line" ]; do
    [ -n "$_cpp_line" ] || continue
    case "$_cpp_line" in *'|'*) ;; *) continue ;; esac
    # mksh: bare | in ${var%|*} is alternation — must escape
    _cpp_product="${_cpp_line##*\|}"
    [ -n "$_cpp_product" ] || continue
    case "$_cpp_product" in
      imported:*)
        _cpp_id="${_cpp_product#imported:}"
        [ -n "$_cpp_id" ] && [ -f "${SPECTER_DIR}/pif_imported/${_cpp_id}.prop" ] || continue
        ;;
    esac
    _cpp_ok="${_cpp_ok}${_cpp_line}
"
    _cpp_n=$((_cpp_n + 1))
  done <<EOF
$_cpp_prefs
EOF
  [ "$_cpp_n" -gt 0 ] || { unset _cpp_prefs _cpp_ok _cpp_n _cpp_product _cpp_pick _cpp_line _cpp_id; return 1; }
  _cpp_pick=$(($$ % _cpp_n))
  _cpp_n=0
  while IFS= read -r _cpp_line || [ -n "$_cpp_line" ]; do
    [ -n "$_cpp_line" ] || continue
    if [ "$_cpp_n" -eq "$_cpp_pick" ]; then
      printf '%s\n' "$_cpp_line"
      unset _cpp_prefs _cpp_ok _cpp_n _cpp_product _cpp_pick _cpp_line _cpp_id
      return 0
    fi
    _cpp_n=$((_cpp_n + 1))
  done <<EOF
$_cpp_ok
EOF
  unset _cpp_prefs _cpp_ok _cpp_n _cpp_product _cpp_pick _cpp_line _cpp_id
  return 1
}

# $1 = imported id, $2 = destination path (default /data/adb/pif.prop)
pif_apply_imported() {
  _pai_src="${SPECTER_DIR}/pif_imported/${1}.prop"
  _pai_dst="${2:-/data/adb/pif.prop}"
  [ -f "$_pai_src" ] || { unset _pai_src _pai_dst; return 1; }
  cp "$_pai_src" "$_pai_dst" || { unset _pai_src _pai_dst; return 1; }
  unset _pai_src _pai_dst
  return 0
}

pif_merge_spoof_keys() {
  [ -f "$1" ] && [ -f "$2" ] || return 0
  while IFS= read -r _pmsk_line || [ -n "$_pmsk_line" ]; do
    case "$_pmsk_line" in
      spoof*=*|DEBUG=*|verboseLogs=*)
        _pmsk_k="${_pmsk_line%%=*}"
        grep -q "^${_pmsk_k}=" "$2" 2>/dev/null || printf '%s\n' "$_pmsk_line" >> "$2"
        ;;
    esac
  done < "$1"
  unset _pmsk_line _pmsk_k
}

# $1 = product (e.g. oriole_beta), $2 = destination path
pif_apply_github_prop() {
  _pag_product="$1"
  _pag_dst="${2:-/data/adb/pif.prop}"
  [ -n "$_pag_product" ] || { unset _pag_product _pag_dst; return 1; }
  _pag_tmp=$(mktemp 2>/dev/null || echo "/data/local/tmp/.specter_pif_${$}")
  _pag_old=$(mktemp 2>/dev/null || echo "/data/local/tmp/.specter_pif_old_${$}")
  [ -f "$_pag_dst" ] && cp "$_pag_dst" "$_pag_old" || : > "$_pag_old"
  while IFS= read -r _pag_url || [ -n "$_pag_url" ]; do
    [ -n "$_pag_url" ] || continue
    if download "$_pag_url" "$_pag_tmp" 2>/dev/null && pif_prop_valid "$_pag_tmp"; then
      cp "$_pag_tmp" "$_pag_dst" || { rm -f "$_pag_tmp" "$_pag_old"; unset _pag_product _pag_dst _pag_tmp _pag_old _pag_url; return 1; }
      pif_merge_spoof_keys "$_pag_old" "$_pag_dst"
      rm -f "$_pag_tmp" "$_pag_old"
      unset _pag_product _pag_dst _pag_tmp _pag_old _pag_url
      return 0
    fi
  done <<EOF
$(pif_bot_mirror_urls "bot/device_prop/${_pag_product}.prop")
EOF
  rm -f "$_pag_tmp" "$_pag_old"
  unset _pag_product _pag_dst _pag_tmp _pag_old _pag_url
  return 1
}

# $1 = module name (from module.prop name=)
# 0 = applied, 1 = soft-fail (caller may random), 2 = Canary needs network
pif_apply_preferred() {
  _pap_name="$1"
  _prefs=$(cfg_get pif_preferred_devices '')
  if [ -z "$_prefs" ]; then
    _legacy_p=$(cfg_get pif_preferred_product '')
    _legacy_m=$(cfg_get pif_preferred_model '')
    [ -n "$_legacy_p" ] && _prefs="${_legacy_m}|${_legacy_p}"
    unset _legacy_p _legacy_m
  fi
  [ -n "$_prefs" ] || { unset _pap_name _prefs; return 1; }

  _choice=$(pif_choose_preferred "$_prefs") || _choice=""
  if [ -z "$_choice" ]; then
    log_w "PIF" "No preferred devices left, falling back to random"
    unset _pap_name _prefs _choice
    return 1
  fi

  _dest=$(pif_prop_dest "$_pap_name")
  _pref_model="${_choice%\|*}"
  _pref_product="${_choice##*\|}"
  _applied=0
  case "$_pref_product" in
    imported:*)
      _imp_id="${_pref_product#imported:}"
      log_i "PIF" "Using imported device: $_pref_model ($_imp_id)"
      if pif_apply_imported "$_imp_id" "$_dest"; then
        _pif_model="$_pref_model"
        _applied=1
      else
        log_w "PIF" "Failed to apply imported device $_imp_id"
      fi
      unset _imp_id
      ;;
    *)
      log_i "PIF" "Using preferred device: $_pref_model ($_pref_product)"
      if ! check_network; then
        log_e "PIF" "No internet connection"
        unset _pap_name _prefs _choice _dest _pref_model _pref_product _applied _pif_model
        return 2
      fi
      case "$_pap_name" in
        *Fork*)
          if MODEL="$_pref_model" PRODUCT="$_pref_product" sh "$PIF_DIR/autopif4.sh" >/dev/null 2>&1; then
            _pif_model=$(pif_prop_get "$_dest" MODEL)
            [ -n "$_pif_model" ] || _pif_model="$_pref_model"
            _applied=1
          else
            log_w "PIF" "Fork autopif4 failed for $_pref_product"
          fi
          ;;
        *)
          if pif_apply_github_prop "$_pref_product" "$_dest"; then
            _pif_model=$(pif_prop_get "$_dest" MODEL)
            _applied=1
          else
            log_w "PIF" "Failed to fetch GitHub prop for $_pref_product"
          fi
          ;;
      esac
      ;;
  esac
  [ -n "$_pif_model" ] && log_i "PIF" "Selected Device: $_pif_model"
  unset _pref_model _pref_product _choice _prefs _dest _pif_model _pap_name
  [ "$_applied" = "1" ] || { unset _applied; return 1; }
  unset _applied
  return 0
}
