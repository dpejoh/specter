#!/system/bin/sh
# Called by inotifyd when wallpaper changes.
# Extracts the monet accent color (1:1 with theme.ts extractMonetColor)
# and writes it as JSON for the WebUI to consume with zero shell exec.

MODDIR="${0%/*}"
case "$MODDIR" in */features) MODDIR="${MODDIR%/features}" ;; esac
[ -n "$MODDIR" ] || exit 1
. "$MODDIR/lib/common.sh"

# ── 4-command pipeline (same as theme.ts) ──────────────────────────
_hex=$(cmd overlay lookup com.android.systemui android:color/system_accent1_500 2>/dev/null || \
    settings get secure monet_engine_seed 2>/dev/null || \
    getprop persist.sys.theme.color 2>/dev/null || \
    dumpsys wallpaper 2>/dev/null | grep -oE '0x[0-9a-fA-F]{8}' | head -1 | tr -d '\n')
[ -z "$_hex" ] && exit 0

# ── Hex parsing (1:1 with theme.ts) ────────────────────────────────
_raw=$(echo "$_hex" | tr -d '[:space:]' | sed 's/^0x//i; s/^#//')
_len=${#_raw}
case "$_len" in
  8) _argb=$(printf '%d' "0x$_raw" 2>/dev/null) ;;                    # 0xRRGGBBAA / #RRGGBBAA
  6) _argb=$(printf '%d' "0xFF$_raw" 2>/dev/null) ;;                  # RRGGBB / #RRGGBB  →  OR with 0xFF000000
  *)
    case "$_raw" in
      ''|*[!0-9]*) _argb="" ;;                                         # not a decimal number
      *) [ "$_len" -gt 6 ] && _argb="$_raw" || _argb="" ;;            # decimal > 6 digits
    esac
    ;;
esac
[ -z "$_argb" ] && exit 0

# ── Extract RGB seed (argb & 0x00FFFFFF) and skip pure black ───────
_seed=$((_argb & 0xFFFFFF))
[ "$_seed" -eq 0 ] && exit 0

# ── Write JSON for WebUI preload ────────────────────────────────────
printf '{"seed":"#%06x","ts":%s}\n' "$_seed" "$(date +%s)" > "$MODDIR/webroot/json/monet.json" 2>/dev/null

write_webui_state
