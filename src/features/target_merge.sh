#!/system/bin/sh
# Thin wrapper — delegates to target.sh --merge
MODDIR=${0%/*}
exec sh "$MODDIR/target.sh" --merge
