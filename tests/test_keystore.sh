plan "keystore.sh — detection, TOML helpers, patch, targets, keybox, restarts"

# ---------- detection ----------
bootstrap
source_libs
detect_keystore_manager
assert_eq "detect: neither -> none" "none" "$KSM"

bootstrap
source_libs
mkdir -p "$OMK_DIR"
detect_keystore_manager
assert_eq "detect: stale omk dir -> none" "none" "$KSM"

bootstrap
source_libs
mk_module tricky_store "Tricky Store"
detect_keystore_manager
assert_eq "detect: tricky_store" "trickystore" "$KSM"
assert_eq "detect: format txt" "txt" "$KSM_FORMAT"

bootstrap
source_libs
mk_module oh_my_keymint "OhMyKeymint"
detect_keystore_manager
assert_eq "detect: omk" "omk" "$KSM"
assert_eq "detect: format toml" "toml" "$KSM_FORMAT"

bootstrap
source_libs
mk_module tricky_store "Tricky Store"
mk_module oh_my_keymint "OhMyKeymint"
detect_keystore_manager
assert_eq "detect: both -> trickystore" "trickystore" "$KSM"

bootstrap
source_libs
mk_module teesim "TEESimulator"
mkdir -p "$TEESIM_DIR"
detect_keystore_manager
assert_eq "detect: teesim" "teesim" "$KSM"
assert_eq "detect: format json" "json" "$KSM_FORMAT"

bootstrap
source_libs
mk_module tricky_store "Tricky Store"
mk_module teesim "TEESimulator"
mkdir -p "$TEESIM_DIR"
detect_keystore_manager
assert_eq "detect: ts+teesim -> trickystore" "trickystore" "$KSM"

bootstrap
source_libs
mk_module teesim "TEESimulator"
mkdir -p "$TEESIM_DIR"
set_cfg "keystore_manager" "teesim"
detect_keystore_manager
assert_eq "detect: override=teesim" "teesim" "$KSM"

bootstrap
source_libs
mk_module tricky_store "Tricky Store"
mk_module oh_my_keymint "OhMyKeymint"
set_cfg "keystore_manager" "omk"
detect_keystore_manager
assert_eq "detect: override=omk" "omk" "$KSM"

bootstrap
source_libs
mk_module oh_my_keymint "OhMyKeymint"
set_cfg "keystore_manager" "trickystore"
detect_keystore_manager
assert_eq "detect: override=trickystore" "trickystore" "$KSM"

bootstrap
source_libs
mk_module tricky_store "Tricky Store"
detect_keystore_manager
ksm_available && _avail=true || _avail=false
assert_eq "available: yes" "true" "$_avail"

bootstrap
source_libs
detect_keystore_manager
ksm_available && _avail2=true || _avail2=false
assert_eq "available: no" "false" "$_avail2"

# ---------- TOML scoop: write preserves siblings; fail-closed; in-place ----------
bootstrap
source_libs
_toml_file="$TEST_ROOT/injector.toml"
cat > "$_toml_file" << 'EOF'
[main]
enable = true

scoop = [
  "com.google.android.gms",
]

[filter]
mode = "strict"
EOF
printf 'com.new.app\n' | _toml_write_scoop "$_toml_file"
_scoop_out=$(_toml_read_scoop "$_toml_file")
assert_contains "scoop write: new app" "$_scoop_out" "com.new.app"
assert_not_contains "scoop write: old gone" "$_scoop_out" "com.google.android.gms"
assert_contains "scoop write: siblings kept" "$(cat "$_toml_file")" "[filter]"
_inode_before=$(stat -c %i "$_toml_file")
printf 'com.new.app\n' | _toml_write_scoop "$_toml_file"
assert_eq "scoop write: in-place inode" "$_inode_before" "$(stat -c %i "$_toml_file")"

bootstrap
source_libs
_missing_toml="$TEST_ROOT/does-not-exist.toml"
printf 'pkg.one\n' | _toml_write_scoop "$_missing_toml" 2>/dev/null; _tw_rc=$?
assert_exit_code "scoop write: missing file fails" 1 "$_tw_rc"
assert_file_not_exists "scoop write: missing not created" "$_missing_toml"

# ---------- TOML trust: replace preserves siblings; create section; fail-closed ----------
bootstrap
source_libs
_cfg_toml="$TEST_ROOT/config.toml"
cat > "$_cfg_toml" << 'EOF'
[trust]
os_version = 17
security_patch = "auto"

[device]
brand = "google"
EOF
_toml_set_trust_key "$_cfg_toml" security_patch '"2026-06-05"'
assert_contains "trust: replaced" "$(cat "$_cfg_toml")" 'security_patch = "2026-06-05"'
assert_contains "trust: sibling kept" "$(cat "$_cfg_toml")" "os_version = 17"
assert_contains "trust: other section kept" "$(cat "$_cfg_toml")" "[device]"
_inode_trust=$(stat -c %i "$_cfg_toml")
_toml_set_trust_key "$_cfg_toml" security_patch '"2026-06-05"'
assert_eq "trust: in-place inode" "$_inode_trust" "$(stat -c %i "$_cfg_toml")"

bootstrap
source_libs
_cfg_new="$TEST_ROOT/config_new.toml"
printf '[main]\nfoo = 1\n' > "$_cfg_new"
_toml_set_trust_key "$_cfg_new" security_patch '"2026-06-05"'
assert_contains "trust: creates [trust]" "$(cat "$_cfg_new")" "[trust]"
assert_contains "trust: value set" "$(cat "$_cfg_new")" 'security_patch = "2026-06-05"'

bootstrap
source_libs
_missing_cfg="$TEST_ROOT/missing-config.toml"
_toml_set_trust_key "$_missing_cfg" security_patch '"2026-06-05"' 2>/dev/null; _tsk_rc=$?
assert_exit_code "trust: missing file fails" 1 "$_tsk_rc"
assert_file_not_exists "trust: missing not created" "$_missing_cfg"

# ---------- security patch get/set once per backend ----------
bootstrap
source_libs
mk_module tricky_store "Tricky Store"
detect_keystore_manager
set_prop "ro.vendor.build.security_patch" "2026-06-01"
ksm_set_security_patch "2026-06-05"
assert_contains "patch txt: system" "$(cat "$KSM_SECURITY")" "system=202606"
assert_contains "patch txt: boot" "$(cat "$KSM_SECURITY")" "boot=2026-06-05"
assert_contains "patch txt: vendor" "$(cat "$KSM_SECURITY")" "vendor=2026-06-01"
assert_eq "patch get txt" "2026-06-05" "$(ksm_get_security_patch)"
assert_file_not_exists "patch txt: no restart" "$OMK_RESTART_DIR/restart.all"

bootstrap
source_libs
mk_module oh_my_keymint "OhMyKeymint"
mkdir -p "$OMK_DIR"
cat > "$OMK_CONFIG" << 'EOF'
[trust]
os_version = 17
security_patch = "auto"
EOF
detect_keystore_manager
ksm_set_security_patch "2026-06-05"
assert_contains "patch toml: set" "$(cat "$KSM_SECURITY")" 'security_patch = "2026-06-05"'
assert_eq "patch get toml" "2026-06-05" "$(ksm_get_security_patch)"
assert_file_not_exists "patch toml: no restart" "$OMK_RESTART_DIR/restart.keymint"

# ---------- first boot: apply when unset vs preserve when set ----------
bootstrap
source_libs
mk_module tricky_store "Tricky Store"
mkdir -p "$TEST_ROOT/system"
printf 'ro.build.version.security_patch=2026-10-05\n' > "$TEST_ROOT/system/build.prop"
export SPECTER_SYSTEM_BUILD_PROP="$TEST_ROOT/system/build.prop"
detect_keystore_manager
SPECTER_FIRST_BOOT=1 run_feature security_patch.sh >/dev/null
assert_contains "first boot: device applied" "$(cat "$KSM_SECURITY")" "boot=2026-10-05"

bootstrap
source_libs
mk_module oh_my_keymint "OhMyKeymint"
mkdir -p "$OMK_DIR"
cat > "$OMK_CONFIG" << 'EOF'
[trust]
os_version = 17
security_patch = "auto"
EOF
mkdir -p "$TEST_ROOT/system"
printf 'ro.build.version.security_patch=2026-10-05\n' > "$TEST_ROOT/system/build.prop"
export SPECTER_SYSTEM_BUILD_PROP="$TEST_ROOT/system/build.prop"
detect_keystore_manager
SPECTER_FIRST_BOOT=1 run_feature security_patch.sh >/dev/null
assert_contains "first boot: auto preserved" "$(cat "$OMK_CONFIG")" 'security_patch = "auto"'
assert_not_contains "first boot: device not written" "$(cat "$OMK_CONFIG")" "2026-10-05"

# ---------- targets (JM): txt preserves suffixes; toml strips into scoop ----------
bootstrap
source_libs
mk_module tricky_store "Tricky Store"
detect_keystore_manager
cat > "$KSM_TARGETS" << 'EOF'
[a section]
android
com.existing.app!
EOF
_kt_out=$(ksm_read_targets)
assert_contains "targets txt read: bare" "$_kt_out" "com.existing.app"
assert_not_contains "targets txt read: no section" "$_kt_out" "["

_kt_staging="$TEST_ROOT/staging_txt.txt"
cat > "$_kt_staging" << 'EOF'
[a section]
android
com.existing.app!
com.new.app
EOF
ksm_commit_targets "$_kt_staging"
assert_contains "targets txt: section kept" "$(cat "$KSM_TARGETS")" "[a section]"
assert_contains "targets txt: suffix kept" "$(cat "$KSM_TARGETS")" "com.existing.app!"
assert_contains "targets txt: new entry" "$(cat "$KSM_TARGETS")" "com.new.app"
assert_file_exists "targets txt: backup" "${KSM_TARGETS}.bak"
assert_file_not_exists "targets txt: no restart" "$OMK_RESTART_DIR/restart.keymint"

bootstrap
source_libs
mk_module oh_my_keymint "OhMyKeymint"
mkdir -p "$OMK_DIR"
cat > "$OMK_INJECTOR" << 'EOF'
[main]
enable = true

scoop = [
  "android",
]
EOF
detect_keystore_manager
_kt_staging2="$TEST_ROOT/staging_toml.txt"
cat > "$_kt_staging2" << 'EOF'
android
com.new.app!
com.other.app?
EOF
ksm_commit_targets "$_kt_staging2"
_kt_out2=$(ksm_read_targets)
assert_contains "targets toml: new.app" "$_kt_out2" "com.new.app"
assert_not_contains "targets toml: suffix stripped" "$_kt_out2" "com.new.app!"
assert_contains "targets toml: other.app" "$_kt_out2" "com.other.app"
assert_contains "targets toml: siblings kept" "$(cat "$OMK_INJECTOR")" "[main]"
assert_file_not_exists "targets toml: no restart" "$OMK_RESTART_DIR/restart.keymint"

# ---------- teesim json ----------
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
      "mode": "generation",
      "patchLevel": { "system": "today", "vendor": "YYYY-MM-05", "boot": "YYYY-MM-05" },
      "osVersion": "",
      "brand": "google",
      "device": "", "product": "", "manufacturer": "", "model": "",
      "serial": "", "imei": "", "meid": "", "imei2": "",
      "apps": ["com.google.android.gms", "com.android.vending"]
    }
  }
}
EOF
detect_keystore_manager
ksm_set_mode patch
assert_eq "teesim: mode on default" "patch" "$(ksm_get_mode)"
assert_not_contains "teesim: no specter profile" "$(cat "$TEESIM_CONFIG")" '"specter"'
_before_set=$(ksm_get_security_patch) || _before_set=""
assert_eq "teesim: sentinel boot not a date" "" "$_before_set"
ksm_set_security_patch "2026-03-05"
assert_eq "teesim: patch on default" "2026-03-05" "$(ksm_get_security_patch)"
printf 'android\ncom.google.android.gms!\ncom.new.app\n' > "$TEST_ROOT/staging_teesim.txt"
ksm_commit_targets "$TEST_ROOT/staging_teesim.txt"
_cfg=$(cat "$TEESIM_CONFIG")
assert_contains "teesim: only default profile" "$_cfg" '"default"'
assert_not_contains "teesim: still no specter" "$_cfg" '"specter"'
assert_contains "teesim: mode preserved" "$_cfg" '"mode": "patch"'
assert_contains "teesim: brand preserved" "$_cfg" '"brand": "google"'
assert_contains "teesim: new.app on default" "$(ksm_read_targets)" "com.new.app"
assert_contains "teesim: gms on default" "$(ksm_read_targets)" "com.google.android.gms"
assert_not_contains "teesim: vending removed" "$(ksm_read_targets)" "com.android.vending"
ksm_set_security_patch "2026-06-05"
assert_eq "teesim: patch" "2026-06-05" "$(ksm_get_security_patch)"
assert_contains "teesim: system YYYY-MM" "$(cat "$TEESIM_CONFIG")" '"system": "2026-06"'
ksm_set_mode generation
assert_eq "teesim: mode set" "generation" "$(ksm_get_mode)"
printf '%s\n' '{"version":1,"profiles":{"default":{"keybox":"keybox.xml","mode":"patch","patchLevel":{"system":"today","vendor":"YYYY-MM-05","boot":"YYYY-MM-05"},"osVersion":"","brand":"","device":"","product":"","manufacturer":"","model":"","serial":"","imei":"","meid":"","imei2":"","apps":["com.google.android.gms"]},"specter":{"keybox":"keybox.xml","mode":"patch","patchLevel":{"system":"today","vendor":"YYYY-MM-05","boot":"YYYY-MM-05"},"osVersion":"","brand":"","device":"","product":"","manufacturer":"","model":"","serial":"","imei":"","meid":"","imei2":"","apps":["com.eltavine.duckdetector"]}}}' > "$TEESIM_CONFIG"
ksm_set_mode generation
assert_not_contains "teesim: mode on every profile" "$(cat "$TEESIM_CONFIG")" '"mode": "patch"'

printf '<AndroidAttestation/>\n' > "$TEST_ROOT/teesim_kb.xml"
ksm_install_keybox "$TEST_ROOT/teesim_kb.xml" copy
assert_contains "teesim: keybox" "$(cat "$TEESIM_KEYBOX")" "<AndroidAttestation/>"

mkdir -p "$MODULES_BASE/teesim"
cat > "$MODULES_BASE/teesim/config.default.json" << 'EOF'
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
      "apps": ["com.google.android.gms", "com.android.vending"]
    }
  }
}
EOF
rm -f "$TEESIM_CONFIG"
_teesim_repair_config "$TEESIM_CONFIG"
assert_contains "teesim repair: missing→seed" "$(ksm_read_targets)" "com.google.android.gms"
printf '%s\n' '{"version":1,"profiles":{"other":{"keybox":"keybox.xml","mode":"generation","patchLevel":{"system":"today","vendor":"YYYY-MM-05","boot":"YYYY-MM-05"},"osVersion":"","brand":"","device":"","product":"","manufacturer":"","model":"","serial":"","imei":"","meid":"","imei2":"","apps":["com.example.app"]}}}' > "$TEESIM_CONFIG"
_teesim_repair_config "$TEESIM_CONFIG"
assert_contains "teesim repair: default restored" "$(cat "$TEESIM_CONFIG")" '"default"'
assert_contains "teesim repair: other kept" "$(cat "$TEESIM_CONFIG")" '"other"'
assert_contains "teesim repair: seed apps" "$(ksm_read_targets)" "com.android.vending"

# ---------- keybox install: in-place overwrite; fail-closed ----------
bootstrap
source_libs
mk_module oh_my_keymint "OhMyKeymint"
mkdir -p "$OMK_DIR"
printf '<old/>\n' > "$OMK_KEYBOX"
detect_keystore_manager
_kb_src="$TEST_ROOT/src_keybox.xml"
printf '<AndroidAttestation/>\n' > "$_kb_src"
_kb_inode=$(stat -c %i "$KSM_KEYBOX")
ksm_install_keybox "$_kb_src" copy
assert_contains "keybox: content" "$(cat "$KSM_KEYBOX")" "<AndroidAttestation/>"
assert_file_exists "keybox: src kept on copy" "$_kb_src"
assert_eq "keybox: in-place inode" "$_kb_inode" "$(stat -c %i "$KSM_KEYBOX")"
assert_file_not_exists "keybox: no restart" "$OMK_RESTART_DIR/restart.keymint"

bootstrap
source_libs
mk_module oh_my_keymint "OhMyKeymint"
mkdir -p "$OMK_DIR"
detect_keystore_manager
_kb_fail="$TEST_ROOT/fail_keybox.xml"
printf '<Nope/>\n' > "$_kb_fail"
ksm_install_keybox "$_kb_fail" copy 2>/dev/null; _kb_rc=$?
assert_exit_code "keybox: missing dest fails" 1 "$_kb_rc"
assert_file_not_exists "keybox: dest not created" "$KSM_KEYBOX"

# ---------- OMK restart tools ----------
bootstrap
source_libs
mk_module tricky_store "Tricky Store"
detect_keystore_manager
PATH="$BIN_DIR:/usr/bin:/bin" \
SPECTER_DIR="$SPECTER_DIR" TRICKY_DIR="$TRICKY_DIR" MODULES_BASE="$MODULES_BASE" \
OMK_RESTART_DIR="$OMK_RESTART_DIR" \
sh "$REPO_ROOT/src/features/omk_restart_keymint.sh" 2>/dev/null; _ork_rc=$?
assert_exit_code "restart keymint: rejects non-omk" 1 "$_ork_rc"
assert_file_not_exists "restart keymint: no marker when rejected" "$OMK_RESTART_DIR/restart.keymint"

bootstrap
source_libs
mk_module oh_my_keymint "OhMyKeymint"
mkdir -p "$OMK_DIR"
detect_keystore_manager
PATH="$BIN_DIR:/usr/bin:/bin" \
SPECTER_DIR="$SPECTER_DIR" MODULES_BASE="$MODULES_BASE" OMK_DIR="$OMK_DIR" \
OMK_RESTART_DIR="$OMK_RESTART_DIR" \
sh "$REPO_ROOT/src/features/omk_restart_keymint.sh" 2>/dev/null; _ork_ok=$?
assert_exit_code "restart keymint: ok" 0 "$_ork_ok"
assert_file_exists "restart keymint: marker" "$OMK_RESTART_DIR/restart.keymint"
assert_file_not_exists "restart keymint: no injector" "$OMK_RESTART_DIR/restart.injector"

bootstrap
source_libs
mk_module oh_my_keymint "OhMyKeymint"
mkdir -p "$OMK_DIR"
detect_keystore_manager
PATH="$BIN_DIR:/usr/bin:/bin" \
SPECTER_DIR="$SPECTER_DIR" MODULES_BASE="$MODULES_BASE" OMK_DIR="$OMK_DIR" \
OMK_RESTART_DIR="$OMK_RESTART_DIR" \
sh "$REPO_ROOT/src/features/omk_restart_injector.sh" 2>/dev/null; _ori_ok=$?
assert_exit_code "restart injector: ok" 0 "$_ori_ok"
assert_file_exists "restart injector: marker" "$OMK_RESTART_DIR/restart.injector"
assert_file_not_exists "restart injector: no keymint" "$OMK_RESTART_DIR/restart.keymint"

done_testing
