#!/system/bin/sh
# Called by inotifyd when the wallpaper/theme changes, or by the WebUI with
# --json. Writes one normalized JSON record for the WebUI:
#
#   {"seed":"#rrggbb","ts":..., "wall":"<mtime:size>",
#    "palette":{"light":{...},"dark":{...}} | null}
#
# The palette is the system's own Material role set when the ROM exposes it
# (AOSP/Pixel Android 12+). ROMs with only the legacy accent/neutral overlays
# (e.g. LineageOS 20) still get the seed; the WebUI then falls back to a
# generated preset.

MODDIR="${0%/*}"
case "$MODDIR" in */features) MODDIR="${MODDIR%/features}" ;; esac
[ -n "$MODDIR" ] || exit 1
. "$MODDIR/lib/common.sh"

_MONET_FORCE=0
_MONET_PRINT=0
case "${1:-}" in
  --json) _MONET_PRINT=1; _MONET_FORCE=1 ;;
  --force) _MONET_FORCE=1 ;;
esac

# Normalize #AARRGGBB / #RRGGBB / 0xAARRGGBB / @id -> #AARRGGBB.
monet_hex_from() {
  _mh_raw=$(printf '%s' "$1" | tr -d '\r\n\t ')
  case "$_mh_raw" in
    *'#'*) _mh_hex=${_mh_raw##*#} ;;
    0[xX]*) _mh_hex=${_mh_raw#0[xX]} ;;
    *) _mh_hex="" ;;
  esac
  case "$_mh_hex" in
    ''|*[!0-9a-fA-F]*) _mh_hex="" ;;
  esac
  if [ -n "$_mh_hex" ]; then
    case "${#_mh_hex}" in
      8) _mh_hex=$(printf '%s' "$_mh_hex" | cut -c3-8) ;;
      6) : ;;
      *) _mh_hex="" ;;
    esac
  fi
  [ -n "$_mh_hex" ] || return 1
  printf '#%s' "$_mh_hex" | tr 'A-F' 'a-f'
}

# Normalize a decimal ARGB value (some ROMs store the seed as an int).
monet_hex_from_decimal() {
  case "$1" in ''|*[!0-9]*) return 1 ;; esac
  [ "${#1}" -gt 6 ] || return 1
  _md_hex=$(printf '%x' "$1" 2>/dev/null || true)
  [ -n "$_md_hex" ] || return 1
  case "${#_md_hex}" in
    8) _md_hex=$(printf '%s' "$_md_hex" | cut -c3-8) ;;
    6) : ;;
    *) return 1 ;;
  esac
  printf '#%s' "$_md_hex"
}

monet_seed_from_sources() {
  _ms_val=$(cmd overlay lookup android android:color/system_accent1_500 2>/dev/null || true)
  _ms_seed=$(monet_hex_from "$_ms_val" 2>/dev/null || true)
  [ -n "$_ms_seed" ] && { printf '%s' "$_ms_seed"; return 0; }

  _ms_val=$(settings get secure monet_engine_seed 2>/dev/null || true)
  case "$_ms_val" in
    ''|null|NULL) ;;
    *)
      _ms_seed=$(monet_hex_from "$_ms_val" 2>/dev/null || true)
      [ -n "$_ms_seed" ] || _ms_seed=$(monet_hex_from_decimal "$_ms_val" 2>/dev/null || true)
      [ -n "$_ms_seed" ] && { printf '%s' "$_ms_seed"; return 0; }
      ;;
  esac

  _ms_val=$(getprop persist.sys.theme.color 2>/dev/null || true)
  case "$_ms_val" in
    ''|null|NULL) ;;
    *)
      _ms_seed=$(monet_hex_from "$_ms_val" 2>/dev/null || true)
      [ -n "$_ms_seed" ] || _ms_seed=$(monet_hex_from_decimal "$_ms_val" 2>/dev/null || true)
      [ -n "$_ms_seed" ] && { printf '%s' "$_ms_seed"; return 0; }
      ;;
  esac

  _ms_val=$(dumpsys wallpaper 2>/dev/null | grep -oE '(0x|#)[0-9a-fA-F]{8}' | tail -1 || true)
  _ms_seed=$(monet_hex_from "$_ms_val" 2>/dev/null || true)
  [ -n "$_ms_seed" ] && { printf '%s' "$_ms_seed"; return 0; }
  return 1
}

_monet_seed=$(monet_seed_from_sources 2>/dev/null || true)
[ -n "$_monet_seed" ] || exit 0
[ "$_monet_seed" = "#000000" ] && exit 0

_monet_wall=$(stat -c '%Y:%s' /data/system/users/0/wallpaper_info.xml 2>/dev/null || true)
[ -n "$_monet_wall" ] || _monet_wall="0"
_monet_json_path="$MODDIR/webroot/json/monet.json"

if [ "$_MONET_FORCE" = 0 ] && [ -f "$_monet_json_path" ]; then
  _prev_seed=$(sed -n 's/.*"seed":"\([^"]*\)".*/\1/p' "$_monet_json_path" 2>/dev/null | head -1)
  _prev_wall=$(sed -n 's/.*"wall":"\([^"]*\)".*/\1/p' "$_monet_json_path" 2>/dev/null | head -1)
  if [ "$_prev_seed" = "$_monet_seed" ] && [ "$_prev_wall" = "$_monet_wall" ]; then
    [ "$_MONET_PRINT" = 1 ] && cat "$_monet_json_path"
    exit 0
  fi
fi

# One overlay dump contains every fabricated resource mapping; parse it once
# with awk instead of spawning `cmd overlay lookup` 68 times. The dump can be
# large on ROMs without the dynamic overlay, so keep it in a file rather than
# a shell variable (avoids ARG_MAX).
ensure_dir "$MODDIR/webroot/json" 2>/dev/null || true
_monet_dump="/data/local/tmp/.specter-monet-dump.$$"
cmd overlay dump com.android.systemui:dynamic > "$_monet_dump" 2>/dev/null || true

_monet_awk='
BEGIN {
  roles="primary on_primary primary_container on_primary_container secondary on_secondary secondary_container on_secondary_container tertiary on_tertiary tertiary_container on_tertiary_container error on_error error_container on_error_container background on_background surface on_surface surface_variant on_surface_variant outline outline_variant shadow scrim inverse_surface inverse_on_surface inverse_primary surface_container_lowest surface_container_low surface_container surface_container_high surface_container_highest"
  n=split(roles, order, " ")
}
{
  if (match($0, /color 0x[0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F] \(color\/system_/)) {
    line=$0
    sub(/^.*color 0x/, "", line)
    hex=substr(line, 1, 8)
    rest=substr(line, 10)
    sub(/^\(color\/system_/, "", rest)
    sub(/\)$/, "", rest)
    idx=match(rest, /_[a-z]+$/)
    if (idx > 0) {
      mode=substr(rest, idx+1)
      role=substr(rest, 1, idx-1)
      if (mode == "light") L[role]=tolower(substr(hex, 3, 6))
      else if (mode == "dark") D[role]=tolower(substr(hex, 3, 6))
    }
  }
}
END {
  ok=1
  for (i=1; i<=n; i++) { r=order[i]; if (L[r] == "" || D[r] == "") { ok=0; break } }
  if (!ok) { print "null"; exit }
  printf "{\"light\":{"
  sep=""
  for (i=1; i<=n; i++) { r=order[i]; key=r; gsub(/_/, "-", key); printf "%s\"--md-sys-color-%s\":\"#%s\"", sep, key, L[r]; sep="," }
  printf "},\"dark\":{"
  sep=""
  for (i=1; i<=n; i++) { r=order[i]; key=r; gsub(/_/, "-", key); printf "%s\"--md-sys-color-%s\":\"#%s\"", sep, key, D[r]; sep="," }
  printf "}}"
}
'
_monet_palette=$(awk "$_monet_awk" "$_monet_dump" 2>/dev/null)
[ -n "$_monet_palette" ] || _monet_palette=null
case "$_monet_palette" in
  null|'') _monet_palette=null ;;
esac
rm -f "$_monet_dump" 2>/dev/null || true

_monet_ts=$(date +%s 2>/dev/null || echo 0)
_monet_json=$(printf '{"seed":"%s","ts":%s,"wall":"%s","palette":%s}' \
  "$_monet_seed" "$_monet_ts" "$_monet_wall" "$_monet_palette")

ensure_dir "$MODDIR/webroot/json" 2>/dev/null || true
_monet_tmp="$MODDIR/webroot/json/.monet.json.tmp"
if printf '%s\n' "$_monet_json" > "$_monet_tmp" 2>/dev/null; then
  mv -f "$_monet_tmp" "$_monet_json_path" 2>/dev/null || rm -f "$_monet_tmp" 2>/dev/null
  chmod 0644 "$_monet_json_path" 2>/dev/null || true
fi

write_webui_state
[ "$_MONET_PRINT" = 1 ] && printf '%s\n' "$_monet_json"

unset _monet_seed _monet_wall _monet_json_path _monet_palette _monet_awk \
  _monet_ts _monet_json _monet_tmp _monet_dump \
  _prev_seed _prev_wall _ms_val _ms_seed _mh_raw _mh_hex _md_hex
exit 0
