plan "scheduler runs the keybox watch"

_scheduler=$(cat "$REPO_ROOT/src/lib/scheduler.sh")
assert_contains "watch task present" "$_scheduler" "keybox_watch:keybox_watch.sh:3600:toggle_keybox_info"
assert_contains "watch minimum interval" "$_scheduler" '[ "$_name" = "keybox_watch" ] && [ "$_cfg_interval" -lt 60 ]'
assert_contains "hma task present" "$_scheduler" "hma:hma.sh:21600:toggle_auto_hma"
assert_contains "hma watcher present" "$_scheduler" "features/hma.sh --watch"
assert_contains "hma watcher gated" "$_scheduler" '_hma_val'
assert_contains "hma watcher runs without auto-target" "$_scheduler" '|| [ "$(cfg_get toggle_auto_hma 1)" = "1" ]'
assert_contains "target watcher respects polling" "$_scheduler" '_at_method:-instant'
assert_contains "hma retry on failure" "$_scheduler" '[ "$_name" = "hma" ] && [ "$_task_rc" -ne 0 ]'
assert_contains "hma failure retry delay" "$_scheduler" "retrying in 5m"
assert_contains "hma missing config forces run" "$_scheduler" '[ "$_hma_cfg_ok" = "1" ] || _last_run=0'
assert_not_contains "old keybox-info task removed" "$_scheduler" "keybox_info:keybox_info.sh:21600"
assert_contains "setup inputs are watched" "$_scheduler" "_setup_info_stale()"
assert_not_contains "setup has no fixed timer" "$_scheduler" "setup_info:setup_info.sh:900"
assert_contains "module snapshot rebuilds on module change" "$_scheduler" "features/modules_state.sh"
assert_contains "instant auto-target uses 6h cleanup" "$_scheduler" "_cfg_interval=21600"
assert_not_contains "proactive auto-keybox rotation removed" "$_scheduler" "autokeybox:keybox.sh"
assert_contains "keybox refresh migration present" "$_scheduler" ".keybox_refresh_migrated"

done_testing
