plan "target.sh --list-raw / --set — WebUI path + FIXED_TARGETS"

# ---------- Tricky Store: txt backend ----------
bootstrap
source_libs
mk_module tricky_store "Tricky Store"
detect_keystore_manager
cat > "$KSM_TARGETS" << 'EOF'
[a section]
com.google.android.gms
com.existing.app!
com.pinned.app?
EOF

_tc_out=$(run_feature target.sh --list-raw)
assert_contains "txt list-raw: bare entry" "$_tc_out" "com.google.android.gms"
assert_contains "txt list-raw: force suffix kept" "$_tc_out" "com.existing.app!"
assert_contains "txt list-raw: conditional suffix kept" "$_tc_out" "com.pinned.app?"
assert_not_contains "txt list-raw: section dropped" "$_tc_out" "[a section]"

SPECTER_LOG_LEVEL=debug PATH="$BIN_DIR:/usr/bin:/bin" MODDIR="$TEST_ROOT" SPECTER_DIR="$SPECTER_DIR" CONFIG_DIR="$CONFIG_DIR" TRICKY_DIR="$TRICKY_DIR" \
  sh "$REPO_ROOT/src/features/target.sh" --list-raw >"$TEST_ROOT/list_raw_out" 2>/dev/null
assert_not_contains "txt list-raw debug: no log_d on stdout" "$(cat "$TEST_ROOT/list_raw_out")" "[D]"

_tc_staging="$TEST_ROOT/staging_txt.txt"
printf '%s\n' 'com.new.app' 'not a package' > "$_tc_staging"
run_feature target.sh --set "$_tc_staging" >/dev/null
_tc_txt=$(cat "$KSM_TARGETS")
assert_contains "txt set: user entry" "$_tc_txt" "com.new.app"
assert_not_contains "txt set: junk line dropped" "$_tc_txt" "not a package"
assert_eq "txt set: android not re-added" "0" "$(grep -cx 'android' "$KSM_TARGETS" || true)"
assert_contains "txt set: FIXED gms" "$_tc_txt" "com.google.android.gms"
assert_contains "txt set: FIXED vending" "$_tc_txt" "com.android.vending"
assert_file_not_exists "txt set: staging consumed" "$_tc_staging"
assert_file_exists "txt set: backup" "${KSM_TARGETS}.bak"
assert_contains "txt set: section preserved" "$_tc_txt" "[a section]"
_tc_new_line=$(grep -n 'com.new.app' "$KSM_TARGETS" | cut -d: -f1)
_tc_sec_line=$(grep -n '\[a section\]' "$KSM_TARGETS" | cut -d: -f1)
[ -n "$_tc_new_line" ] && [ -n "$_tc_sec_line" ] && [ "$_tc_new_line" -lt "$_tc_sec_line" ] \
  && ok "txt set: new app in default block" || fail "txt set: new app in default block"
assert_not_contains "txt set: unselected member dropped" "$_tc_txt" "com.existing.app"
assert_not_contains "txt set: unselected pinned dropped" "$_tc_txt" "com.pinned.app"

# pinned suffix kept; no bare duplicate of gms
_tc_staging="$TEST_ROOT/staging_pin.txt"
printf 'com.google.android.gms?\ncom.other.app\n' > "$_tc_staging"
run_feature target.sh --set "$_tc_staging" >/dev/null
_tc_pin=$(cat "$KSM_TARGETS")
assert_contains "txt set: gms? kept" "$_tc_pin" "com.google.android.gms?"
_tc_bare_gms=$(grep -cx 'com.google.android.gms' "$KSM_TARGETS" || true)
assert_eq "txt set: no bare gms dup" "0" "$_tc_bare_gms"
assert_eq "txt set: android not re-added after pin" "0" "$(grep -cx 'android' "$KSM_TARGETS" || true)"

_tc_staging="$TEST_ROOT/staging_nonewline.txt"
printf '%s' 'io.example.app' > "$_tc_staging"
run_feature target.sh --set "$_tc_staging" >/dev/null
assert_eq "txt set: no-newline pkg own line" "1" "$(grep -cx 'io.example.app' "$KSM_TARGETS" || true)"
assert_eq "txt set: fixed target not glued" "0" "$(grep -cx 'io.example.appcom.android.vending' "$KSM_TARGETS" || true)"

# ---------- OhMyKeymint: toml backend ----------
bootstrap
source_libs
mk_module oh_my_keymint "OhMyKeymint"
mkdir -p "$OMK_DIR"
cat > "$OMK_INJECTOR" << 'EOF'
[main]
enable = true

scoop = [
  "com.omk.app",
  "com.google.android.gms",
]
EOF
detect_keystore_manager

_tc_out2=$(run_feature target.sh --list-raw)
assert_contains "toml list-raw: reads scoop" "$_tc_out2" "com.google.android.gms"
assert_not_contains "toml list-raw: not target.txt" "$_tc_out2" "com.existing.app"

_tc_staging2="$TEST_ROOT/staging_toml.txt"
printf 'com.new.app?\n' > "$_tc_staging2"
run_feature target.sh --set "$_tc_staging2" >/dev/null
_tc_toml=$(cat "$OMK_INJECTOR")
assert_contains "toml set: entry added" "$_tc_toml" "com.new.app"
assert_not_contains "toml set: suffix stripped" "$_tc_toml" "com.new.app?"
assert_contains "toml set: FIXED gms" "$_tc_toml" "com.google.android.gms"
assert_contains "toml set: siblings kept" "$_tc_toml" "[main]"
assert_file_not_exists "toml set: target.txt untouched" "$TARGET_TXT"

# ---------- JingMatrix TEESimulator: json backend, default profile only ----------
bootstrap
source_libs
mk_module teesim "TEESimulator"
mkdir -p "$TEESIM_DIR"
cat > "$TEESIM_CONFIG" << 'EOF'
{
  "version": 1,
  "profiles": {
    "default": {
      "keybox": "keybox.xml",
      "mode": "patch",
      "patchLevel": { "system": "today", "vendor": "YYYY-MM-05", "boot": "YYYY-MM-05" },
      "osVersion": "",
      "brand": "", "device": "", "product": "", "manufacturer": "", "model": "",
      "serial": "", "imei": "", "meid": "", "imei2": "",
      "apps": ["com.google.android.gms"]
    },
    "work": {
      "keybox": "keybox.xml",
      "mode": "patch",
      "patchLevel": { "system": "today", "vendor": "YYYY-MM-05", "boot": "YYYY-MM-05" },
      "osVersion": "",
      "brand": "", "device": "", "product": "", "manufacturer": "", "model": "",
      "serial": "", "imei": "", "meid": "", "imei2": "",
      "apps": ["com.eltavine.duckdetector"]
    }
  }
}
EOF
detect_keystore_manager
_tc_out3=$(run_feature target.sh --list-raw)
assert_contains "json list-raw: default profile app" "$_tc_out3" "com.google.android.gms"
assert_not_contains "json list-raw: other profile hidden" "$_tc_out3" "com.eltavine.duckdetector"

_tc_staging3="$TEST_ROOT/staging_json.txt"
printf 'com.google.android.gms\ncom.new.json.app\n' > "$_tc_staging3"
run_feature target.sh --set "$_tc_staging3" >/dev/null
_tc_cfg=$(cat "$TEESIM_CONFIG")
assert_contains "json set: new app on default" "$_tc_cfg" "com.new.json.app"
assert_contains "json set: other profile kept" "$_tc_cfg" '"work"'
assert_contains "json set: other profile apps kept" "$_tc_cfg" "com.eltavine.duckdetector"

# ---------- list generation (overwrite & merge) ----------
bootstrap
source_libs
mk_module tricky_store "Tricky Store"
detect_keystore_manager

# Overwrite mode
_gen_out=$(run_feature target.sh)
assert_contains "overwrite: mode announced" "$_gen_out" "Mode: overwrite"
assert_contains "overwrite: fixed target" "$(cat "$KSM_TARGETS")" "com.google.android.gms"
assert_contains "overwrite: pm target" "$(cat "$KSM_TARGETS")" "com.dpejoh.specter"
assert_not_contains "overwrite: temp file consumed cleanly" "$_gen_out" "No such file"
assert_not_contains "overwrite: count not zero" "$_gen_out" "Wrote 0 entries"

# Overwrite with default mode force (!)
cfg_set target_default_mode "force"
run_feature target.sh >/dev/null
assert_contains "overwrite: force suffix applied" "$(cat "$KSM_TARGETS")" "com.dpejoh.specter!"
assert_not_contains "overwrite: fixed target stays bare" "$(cat "$KSM_TARGETS")" "com.google.android.gms!"

# Merge mode
cfg_set target_default_mode "bare"
cat > "$KSM_TARGETS" << 'EOF'
com.existing.app
com.google.android.gms
EOF
_merge_out=$(run_feature target.sh --merge)
assert_contains "merge: mode announced" "$_merge_out" "Mode: merge"
assert_contains "merge: new app added" "$(cat "$KSM_TARGETS")" "com.dpejoh.specter"
assert_contains "merge: existing kept" "$(cat "$KSM_TARGETS")" "com.existing.app"

# Merge-denylist seeds mandatory targets when the list is empty
rm -f "$KSM_TARGETS"
cat > "$BIN_DIR/magisk" << 'MOCK'
#!/bin/sh
[ "$1" = "--denylist" ] && [ "$2" = "ls" ] && echo "com.denied.app|10123"
exit 0
MOCK
chmod +x "$BIN_DIR/magisk"
_deny_out=$(run_feature target.sh --merge-denylist)
assert_contains "denylist: mode announced" "$_deny_out" "Mode: merge-denylist"
assert_contains "denylist: entry added" "$(cat "$KSM_TARGETS")" "com.denied.app"
assert_contains "denylist: fixed target seeded" "$(cat "$KSM_TARGETS")" "com.google.android.gms"
assert_not_contains "denylist: fixed target stays bare" "$(cat "$KSM_TARGETS")" "com.google.android.gms!"
rm -f "$BIN_DIR/magisk"

# Blacklist filtering during overwrite
touch "$SPECTER_DIR/blacklist_enabled"
echo "com.dpejoh.specter" > "$SPECTER_DIR/blacklist.txt"
run_feature target.sh >/dev/null
assert_not_contains "blacklist: blacklisted pkg dropped" "$(cat "$KSM_TARGETS")" "com.dpejoh.specter"
assert_contains "blacklist: fixed target preserved" "$(cat "$KSM_TARGETS")" "com.google.android.gms"

# ---------- argument handling ----------
bootstrap
source_libs
mk_module tricky_store "Tricky Store"
detect_keystore_manager
run_feature target.sh --set "$TEST_ROOT/does_not_exist" >/dev/null 2>&1
assert_exit_code "set: missing staging file fails" 1 "$?"

done_testing
