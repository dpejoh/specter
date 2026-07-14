# shellcheck shell=sh
# Module description, compute and apply rich status line.
# Provides refresh_module_description() for boot-time and on-demand use.

refresh_module_description() {
  detect_keystore_manager
  _problems=""

  if [ "$KSM" = "none" ]; then
    _problems="🚨 No keystore manager installed"
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

    [ -z "$_kb_src" ] && _kb_src=$(cfg_get 'keybox_provider' '')
    [ -z "$_kb_src" ] && [ "$(cfg_get 'keybox_private' 'false')" = "true" ] && _kb_src="Private"

    _apps=$(ksm_read_targets 2>/dev/null | wc -l)
    _patch=$(ksm_get_security_patch 2>/dev/null) || _patch=""
    [ -z "$_patch" ] && _patch="-"

    if [ -f "$KSM_KEYBOX" ] || [ -f "$KSM_LOCKED" ]; then
      _title="$_kb_src${_kb_ver:+ $_kb_ver}"
      if [ -n "$_kb_rev" ]; then
        _new_desc="🔑 $_title · ❌ | $_apps apps | 🛡️ $_patch"
      elif [ -n "$_kb_soft" ]; then
        _new_desc="🔑 $_title · ⚠️ | $_apps apps | 🛡️ $_patch"
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
    "$_ksud" module config --internal Specter set override.description "$_new_desc" 2>/dev/null || true
  done

  unset _problems _cf _new_desc _escaped _kb_info _kb_src _kb_ver _kb_rev _kb_soft _apps _patch _title _ksud
}
