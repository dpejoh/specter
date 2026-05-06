#!/system/bin/sh
set -e
MODDIR=${0%/*}
. "$MODDIR/../lib/common.sh"
. "$MODDIR/../lib/paths.sh"
. "$MODDIR/../lib/urls.sh"
. "$MODDIR/../rka/jsonarray.sh"
[ -z "$RKA_TOKEN" ] && { log "RKA" "Error: RKA_TOKEN is not set"; exit 1; }

log "RKA" "Start"

MOD="io.github.mhmrdd.libxposed.ps.passit"

if ! pm path "$MOD" >/dev/null 2>&1; then
  log "RKA" "Error: PassIt not installed"
  exit 1
fi

CFG="/data/user/$(id -u)/${MOD}/files/rka_configs.json"

RKA_NAME="Yuri RKA"
RKA_UDP=0

prev_id=""
if [ -f "$IDFILE" ]; then
  prev_id=$(cat "$IDFILE" 2>/dev/null) || log "RKA" "Warning: Failed to read previous ID from $IDFILE"
  case "$prev_id" in
    ????????-????-????-????-????????????) ;;
    *) prev_id="" ;;
  esac
fi

if [ -n "$prev_id" ] && ja_has "$CFG" "$prev_id"; then
  ja_set "$CFG" "$prev_id" name      "$RKA_NAME"
  ja_set "$CFG" "$prev_id" host      "$RKA_HOST"
  ja_set "$CFG" "$prev_id" tcpPort   "$RKA_TCP"    n
  ja_set "$CFG" "$prev_id" udpPort   "$RKA_UDP"    n
  ja_set "$CFG" "$prev_id" authToken "$RKA_TOKEN"
  ja_set "$CFG" "$prev_id" isActive  true           b
else
  prev_id=$(ja_add "$CFG" \
    "name=$RKA_NAME" \
    "host=$RKA_HOST" \
    "tcpPort=$RKA_TCP" \
    "udpPort=$RKA_UDP" \
    "authToken=$RKA_TOKEN" \
    "isActive=true")
  printf '%s' "$prev_id" > "$IDFILE"
fi

for _oid in $(ja_ids "$CFG"); do
  [ "$_oid" = "$prev_id" ] && continue
  ja_set "$CFG" "$_oid" isActive false b
done

log "RKA" "RKA config updated for $RKA_NAME"
log "RKA" "Finish"
exit 0
