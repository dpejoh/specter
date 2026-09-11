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

: "${PIF_CANARY_DEVICES:=Pixel 6|oriole_beta
Pixel 6 Pro|raven_beta
Pixel 6a|bluejay_beta
Pixel 7|panther_beta
Pixel 7 Pro|cheetah_beta
Pixel 7a|lynx_beta
Pixel Fold|felix_beta
Pixel Tablet|tangorpro_beta
Pixel 8|shiba_beta
Pixel 8 Pro|husky_beta
Pixel 8a|akita_beta
Pixel 9|tokay_beta
Pixel 9 Pro|caiman_beta
Pixel 9 Pro XL|komodo_beta
Pixel 9 Pro Fold|comet_beta
Pixel 9a|tegu_beta}"

# $1 = lines of MODEL|PRODUCT
# $2 = blacklist string (containing products or MODEL|PRODUCT)
pif_filter_blacklist() {
  _pfb_list="$1"
  _pfb_bl="$2"
  [ -n "$_pfb_bl" ] || { printf '%s\n' "$_pfb_list"; unset _pfb_list _pfb_bl; return 0; }
  while IFS= read -r _pfb_line || [ -n "$_pfb_line" ]; do
    [ -n "$_pfb_line" ] || continue
    _pfb_prod="${_pfb_line##*\|}"
    [ -n "$_pfb_prod" ] || continue
    case "$_pfb_bl" in
      *"$_pfb_prod"*) continue ;;
    esac
    printf '%s\n' "$_pfb_line"
  done <<EOF
$_pfb_list
EOF
  unset _pfb_list _pfb_bl _pfb_line _pfb_prod
}

# $1 = blacklist string (e.g. from cfg_get pif_blacklist '')
# Prints one non-blacklisted canary device line ("MODEL|PRODUCT")
pif_choose_random_canary() {
  _pcrc_bl="$1"
  _pcrc_pool=$(pif_filter_blacklist "$PIF_CANARY_DEVICES" "$_pcrc_bl")
  if [ -z "$_pcrc_pool" ]; then
    log_w "PIF" "All Canary devices blacklisted, ignoring blacklist"
    _pcrc_pool="$PIF_CANARY_DEVICES"
  fi
  pif_choose_preferred "$_pcrc_pool"
  unset _pcrc_bl _pcrc_pool
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
  # shellcheck disable=SC3028
  _cpp_seed="${RANDOM:-$$}"
  case "$_cpp_seed" in *[!0-9]*) _cpp_seed="$$" ;; esac
  _cpp_pick=$((_cpp_seed % _cpp_n))
  _cpp_n=0
  while IFS= read -r _cpp_line || [ -n "$_cpp_line" ]; do
    [ -n "$_cpp_line" ] || continue
    if [ "$_cpp_n" -eq "$_cpp_pick" ]; then
      printf '%s\n' "$_cpp_line"
      unset _cpp_prefs _cpp_ok _cpp_n _cpp_product _cpp_pick _cpp_line _cpp_id _cpp_seed
      return 0
    fi
    _cpp_n=$((_cpp_n + 1))
  done <<EOF
$_cpp_ok
EOF
  unset _cpp_prefs _cpp_ok _cpp_n _cpp_product _cpp_pick _cpp_line _cpp_id _cpp_seed
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

# $1 = model, $2 = product, $3 = dest, $4 = module name
# returns 0 = applied, 1 = failure, 2 = network error
pif_apply_device() {
  _pad_model="$1"
  _pad_product="$2"
  _pad_dest="$3"
  _pad_name="$4"
  _pad_applied=0

  case "$_pad_product" in
    imported:*)
      _pad_imp="${_pad_product#imported:}"
      log_i "PIF" "Using imported device: $_pad_model ($_pad_imp)"
      if pif_apply_imported "$_pad_imp" "$_pad_dest"; then
        _pif_model="$_pad_model"
        _pad_applied=1
      else
        log_w "PIF" "Failed to apply imported device $_pad_imp"
      fi
      unset _pad_imp
      ;;
    *)
      log_i "PIF" "Using target device: $_pad_model ($_pad_product)"
      if ! check_network; then
        log_e "PIF" "No internet connection"
        unset _pad_model _pad_product _pad_dest _pad_name _pad_applied
        return 2
      fi
      case "$_pad_name" in
        *Fork*)
          _pad_dev="${_pad_product%_beta}"
          if (cd "$PIF_DIR" && DEVICE="$_pad_dev" MODEL="$_pad_model" PRODUCT="$_pad_product" sh ./autopif4.sh >/dev/null 2>&1); then
            _pif_model=$(pif_prop_get "$_pad_dest" MODEL)
            [ -n "$_pif_model" ] || _pif_model="$_pad_model"
            _pad_applied=1
          elif pif_apply_github_prop "$_pad_product" "$_pad_dest"; then
            _pif_model=$(pif_prop_get "$_pad_dest" MODEL)
            [ -n "$_pif_model" ] || _pif_model="$_pad_model"
            _pad_applied=1
          else
            log_w "PIF" "Fork autopif4 failed for $_pad_product"
          fi
          unset _pad_dev
          ;;
        *)
          if pif_apply_github_prop "$_pad_product" "$_pad_dest"; then
            _pif_model=$(pif_prop_get "$_pad_dest" MODEL)
            _pad_applied=1
          else
            log_w "PIF" "Failed to fetch GitHub prop for $_pad_product"
          fi
          ;;
      esac
      ;;
  esac
  [ -n "$_pif_model" ] && log_i "PIF" "Selected Device: $_pif_model"
  unset _pad_model _pad_product _pad_dest _pad_name _pif_model
  [ "$_pad_applied" = "1" ] || { unset _pad_applied; return 1; }
  unset _pad_applied
  return 0
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

  _choice=""
  if [ -n "$_prefs" ]; then
    _choice=$(pif_choose_preferred "$_prefs") || _choice=""
    if [ -z "$_choice" ]; then
      log_w "PIF" "No preferred devices left, falling back to random"
    fi
  fi

  # If no fixed target, check if blacklist is configured for random mode
  if [ -z "$_choice" ]; then
    _bl=$(cfg_get pif_blacklist '')
    if [ -n "$_bl" ]; then
      log_i "PIF" "Blacklist configured, Specter selecting random Canary device..."
      _choice=$(pif_choose_random_canary "$_bl") || _choice=""
      if [ -z "$_choice" ]; then
        log_w "PIF" "Failed to select device from Canary pool"
        unset _pap_name _prefs _choice _bl
        return 1
      fi
    fi
    unset _bl
  fi

  [ -n "$_choice" ] || { unset _pap_name _prefs _choice; return 1; }

  _dest=$(pif_prop_dest "$_pap_name")
  _pref_model="${_choice%\|*}"
  _pref_product="${_choice##*\|}"
  unset _prefs _choice

  _rc=0
  pif_apply_device "$_pref_model" "$_pref_product" "$_dest" "$_pap_name" || _rc=$?
  unset _pref_model _pref_product _dest _pap_name
  return "$_rc"
}
