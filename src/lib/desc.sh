# shellcheck shell=sh
# Module description, compute and apply rich status line.
# Provides refresh_module_description() for boot-time and on-demand use.

refresh_module_description() {
  ksm_enforce_singleton >/dev/null

  detect_keystore_manager
  _problems=""

  if [ "$KSM" = "none" ]; then
    _problems="🚨 No keystore manager"
  fi

  _cf=""
  while IFS='|' read -r _id _name _type _features _scripts; do
    case "$_id" in ''|\#*) continue ;; esac
    [ "$_type" = "aggressive" ] || continue
    _conflict_detect "$_id" || continue
    _cf="${_cf}${_cf:+, }$_id"
  done < "$CONFIG_DIR/conflicts.txt"
  [ -n "$_cf" ] && _problems="${_problems}${_problems:+ | }🚨 Conflict: $_cf"

  if [ -n "$_problems" ]; then
    _new_desc="$_problems"
  else
    _kb_info=$(head -c 512 "$MODDIR/webroot/json/keybox_info.json" 2>/dev/null || echo "")
    _kb_src=$(echo "$_kb_info" | grep -o '"source": *"[^"]*"' | cut -d'"' -f4) || true
    _kb_ver=$(echo "$_kb_info" | grep -o '"text": *"[^"]*"' | cut -d'"' -f4) || true
    _kb_rev=$(echo "$_kb_info" | grep -o '"revoked": *true') || true
    _kb_soft=$(echo "$_kb_info" | grep -o '"softbanned": *true') || true
    _kb_exp=$(echo "$_kb_info" | grep -o '"expired": *true') || true
    _kb_validity=unknown
    [ -f "$KSM_KEYBOX" ] && _kb_validity=$(keybox_cert_validity "$KSM_KEYBOX")

    [ -z "$_kb_src" ] && _kb_src=$(cfg_get 'keybox_provider' '')
    [ -z "$_kb_src" ] && [ "$(cfg_get 'keybox_private' 'false')" = "true" ] && _kb_src="Private"

    _apps=$(ksm_read_targets 2>/dev/null | sort -u | wc -l)
    _patch=$(ksm_get_security_patch 2>/dev/null) || _patch=""
    if [ "$KSM_FORMAT" = "json" ] && [ "${_apps:-0}" -eq 0 ]; then
      unset _problems _cf _new_desc _escaped _kb_info _kb_src _kb_ver _kb_rev _kb_soft _kb_exp _apps _patch _title _ksud
      return 0
    fi
    [ -z "$_patch" ] && _patch="-"

    if [ -f "$KSM_KEYBOX" ]; then
      if [ -n "$_kb_ver" ] && [ -n "$_kb_src" ] && [ "$_kb_src" != "Private" ]; then
        _title="$_kb_ver by $_kb_src"
      else
        _title="$_kb_src${_kb_ver:+ $_kb_ver}"
      fi
      if [ -n "$_kb_rev" ]; then
        _new_desc="🔑 $_title · ❌ | $_apps apps | 🛡️ $_patch"
      elif [ "$_kb_validity" = "not_yet_valid" ]; then
        _new_desc="🔑 $_title · ❌ not yet valid | $_apps apps | 🛡️ $_patch"
      elif [ -n "$_kb_exp" ] || [ "$_kb_validity" = "expired" ]; then
        _new_desc="🔑 $_title · ❌ expired | $_apps apps | 🛡️ $_patch"
      elif [ -n "$_kb_soft" ]; then
        _new_desc="🔑 $_title · ⚠️ | $_apps apps | 🛡️ $_patch"
      elif [ "$_kb_validity" != "valid" ]; then
        _new_desc="🔑 $_title · ⚠️ unknown | $_apps apps | 🛡️ $_patch"
      else
        _new_desc="🔑 $_title · ✅ | $_apps apps | 🛡️ $_patch"
      fi
    else
      _new_desc="❌ No keybox | $_apps apps | 🛡️ $_patch"
    fi
  fi

  log_d "DESC" "New description: $_new_desc"
  cfg_set "override.description" "$_new_desc"

  _escaped=$(printf '%s\n' "$_new_desc" | sed 's|[#/&\]|\\&|g')
  sed -i "s#^description=.*#description=$_escaped#" "$MODDIR/module.prop" 2>/dev/null

  for _ksud in /data/adb/ksu/bin/ksud /data/adb/ap/bin/ksud; do
    [ -x "$_ksud" ] || continue
    "$_ksud" module config set override.description "$_new_desc" 2>/dev/null || true
  done

  unset _problems _cf _new_desc _escaped _kb_info _kb_src _kb_ver _kb_rev _kb_soft _apps _patch _title _ksud
}
