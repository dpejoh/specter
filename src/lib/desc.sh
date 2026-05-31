# shellcheck shell=sh
# Module description, compute and apply rich status line.
# Provides refresh_module_description() for boot-time and on-demand use.

refresh_module_description() {
  # Compute new description
  _new_desc=""

  if [ ! -d "/data/adb/modules/tricky_store" ] && [ ! -d "/data/adb/modules_update/tricky_store" ]; then
    _new_desc="🚨 Tricky Store not installed"
  else
    # Check for aggressive conflicts
    _cf=""
    while IFS='|' read -r _id _name _scripts _features _type; do
      [ -z "$_id" ] && continue
      [ "$_type" != "aggressive" ] && continue
      _conflict_detect "$_id" || continue
      _cf="$_name"
      break
    done <<CF_EOF
$(_conflict_registry)
CF_EOF

    if [ -n "$_cf" ]; then
      _new_desc="🚨 Conflict: $_cf"
    else
      # Read keybox info, single pass with sed
      _kb_info=$(head -c 512 "$MODDIR/webroot/json/keybox_info.json" 2>/dev/null || echo "")
      _kb_src=$(echo "$_kb_info" | grep -o '"source": *"[^"]*"' | cut -d'"' -f4) || true
      _kb_ver=$(echo "$_kb_info" | grep -o '"text": *"[^"]*"' | cut -d'"' -f4) || true
      _kb_rev=$(echo "$_kb_info" | grep -o '"revoked": *true') || true
      _kb_soft=$(echo "$_kb_info" | grep -o '"softbanned": *true') || true

      [ -z "$_kb_src" ] && _kb_src=$(cfg_get 'kb_provider' '')
      [ -z "$_kb_src" ] && [ "$(cfg_get 'kb_private' 'false')" = "true" ] && _kb_src="Private"

      _apps=$(wc -l < "$TARGET_TXT" 2>/dev/null || echo 0)
      _patch=$(grep '^boot=' "$SECURITY_PATCH_FILE" 2>/dev/null | cut -d= -f2) || true
      [ -z "$_patch" ] && _patch="-"

      if [ -f "$TARGET_FILE" ] || [ -f "$LOCKED_FILE" ]; then
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
  fi

  # Skip write if unchanged
  _old_desc=$(cfg_get "override.description" "")
  [ "$_new_desc" = "$_old_desc" ] && { unset _new_desc _old_desc _cf _kb_info _kb_src _kb_ver _kb_rev _kb_soft _apps _patch _title; return 0; }

  cfg_set "override.description" "$_new_desc"

  _escaped=$(printf '%s\n' "$_new_desc" | sed 's|[#/&\]|\\&|g')
  sed -i "s#^description=.*#description=$_escaped#" "$MODDIR/module.prop" 2>/dev/null

  for _ksud in /data/adb/ksu/bin/ksud /data/adb/ap/bin/ksud; do
    [ -x "$_ksud" ] || continue
    "$_ksud" module config --internal Specter set override.description "$_new_desc" 2>/dev/null || true
  done

  unset _new_desc _old_desc _escaped _cf _kb_info _kb_src _kb_ver _kb_rev _kb_soft _apps _patch _title _ksud
}
