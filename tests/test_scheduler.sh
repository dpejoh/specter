plan "scheduler runs the keybox watch"

_scheduler=$(cat "$REPO_ROOT/src/lib/scheduler.sh")
assert_contains "watch task present" "$_scheduler" "keybox_watch:keybox_watch.sh:300:toggle_keybox_info"
assert_contains "watch minimum interval" "$_scheduler" '[ "$_name" = "keybox_watch" ] && [ "$_cfg_interval" -lt 60 ]'
assert_not_contains "old keybox-info task removed" "$_scheduler" "keybox_info:keybox_info.sh:21600"
assert_contains "setup inputs are watched" "$_scheduler" "_setup_info_stale()"
assert_not_contains "setup has no fixed timer" "$_scheduler" "setup_info:setup_info.sh:900"

done_testing
