#!/system/bin/sh
# Run script for KernelSU's native hot install. ksud bounds it to 30s;
# the live-apply (pipeline included) does not fit in that window, so
# start it detached and return at once. It logs to hotinstall.log.
MODDIR=${0%/*}
if command -v setsid >/dev/null 2>&1; then
  setsid sh "$MODDIR/hotinstall.sh" >/dev/null 2>&1 &
else
  sh "$MODDIR/hotinstall.sh" >/dev/null 2>&1 &
fi
exit 0
