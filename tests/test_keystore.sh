plan "keystore.sh — manager detection, TOML helpers, target/security-patch commits"

# ---------- detection: neither installed ----------
bootstrap
source_libs
detect_keystore_manager
assert_eq "detect: neither installed -> none" "none" "$KSM"

# ---------- detection: stale OMK data dir without module -> none ----------
bootstrap
source_libs
mkdir -p "$OMK_DIR"
detect_keystore_manager
assert_eq "detect: stale omk dir without module -> none" "none" "$KSM"

# ---------- detection: OMK config files without module.prop -> none ----------
bootstrap
source_libs
mkdir -p "$OMK_DIR"
printf '[main]\nbackend = "injector"\n' > "$OMK_CONFIG"
detect_keystore_manager
assert_eq "detect: omk config without module.prop -> none" "none" "$KSM"

# ---------- detection: Tricky Store only ----------
bootstrap
source_libs
mk_module tricky_store "Tricky Store"
detect_keystore_manager
assert_eq "detect: tricky_store only -> trickystore" "trickystore" "$KSM"
assert_eq "detect: format is txt" "txt" "$KSM_FORMAT"

# ---------- detection: OMK only ----------
bootstrap
source_libs
mk_module oh_my_keymint "OhMyKeymint"
detect_keystore_manager
assert_eq "detect: oh_my_keymint only -> omk" "omk" "$KSM"
assert_eq "detect: format is toml" "toml" "$KSM_FORMAT"

# ---------- detection: both installed, Tricky Store wins by default ----------
bootstrap
source_libs
mk_module tricky_store "Tricky Store"
mk_module oh_my_keymint "OhMyKeymint"
detect_keystore_manager
assert_eq "detect: both installed -> trickystore wins" "trickystore" "$KSM"

# ---------- detection: override forces omk even with both installed ----------
bootstrap
source_libs
mk_module tricky_store "Tricky Store"
mk_module oh_my_keymint "OhMyKeymint"
set_cfg "keystore_manager" "omk"
detect_keystore_manager
assert_eq "detect: override=omk wins" "omk" "$KSM"

# ---------- detection: override=trickystore forces even if only OMK installed ----------
bootstrap
source_libs
mk_module oh_my_keymint "OhMyKeymint"
set_cfg "keystore_manager" "trickystore"
detect_keystore_manager
assert_eq "detect: override=trickystore forces" "trickystore" "$KSM"

# ---------- ksm_available ----------
bootstrap
source_libs
mk_module tricky_store "Tricky Store"
detect_keystore_manager
ksm_available && _avail=true || _avail=false
assert_eq "available: tricky_store dir exists (mock creates it)" "true" "$_avail"

bootstrap
source_libs
detect_keystore_manager
ksm_available && _avail2=true || _avail2=false
assert_eq "available: none -> false" "false" "$_avail2"

# ---------- _toml_read_scoop / _toml_write_scoop round-trip ----------
bootstrap
source_libs
_toml_file="$TEST_ROOT/injector.toml"
cat > "$_toml_file" << 'EOF'
[main]
enable = true

scoop = [
  "com.google.android.gms",
  "com.android.vending",
]

[filter]
mode = "strict"
EOF
_scoop_out=$(_toml_read_scoop "$_toml_file")
assert_contains "toml read: has gms" "$_scoop_out" "com.google.android.gms"
assert_contains "toml read: has vending" "$_scoop_out" "com.android.vending"

printf 'com.new.app\ncom.other.app\n' | _toml_write_scoop "$_toml_file"
_scoop_out2=$(_toml_read_scoop "$_toml_file")
assert_contains "toml write: has new.app" "$_scoop_out2" "com.new.app"
assert_not_contains "toml write: old entries gone" "$_scoop_out2" "com.google.android.gms"
assert_contains "toml write: preserves other sections" "$(cat "$_toml_file")" "[filter]"

cp "$_toml_file" "${_toml_file}.snapshot"
printf 'com.new.app\ncom.other.app\n' | _toml_write_scoop "$_toml_file"
assert_eq "toml write: idempotent (same input -> same output)" "$(cat "${_toml_file}.snapshot")" "$(cat "$_toml_file")"

# ---------- _toml_write_scoop: missing scoop key gets injected before first section ----------
bootstrap
source_libs
_noscoop="$TEST_ROOT/noscoop.toml"
cat > "$_noscoop" << 'EOF'
[main]
enable = true
EOF
printf 'pkg.one\n' | _toml_write_scoop "$_noscoop"
assert_contains "toml write: injects scoop when absent" "$(cat "$_noscoop")" "scoop = ["
_scoop_injected=$(_toml_read_scoop "$_noscoop")
assert_eq "toml write: injected value readable" "pkg.one" "$_scoop_injected"

# ---------- _toml_set_trust_key: existing key replaced ----------
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
assert_contains "trust key: replaced" "$(cat "$_cfg_toml")" 'security_patch = "2026-06-05"'
assert_contains "trust key: sibling key untouched" "$(cat "$_cfg_toml")" "os_version = 17"
assert_contains "trust key: other sections preserved" "$(cat "$_cfg_toml")" "[device]"

cp "$_cfg_toml" "${_cfg_toml}.snapshot"
_toml_set_trust_key "$_cfg_toml" security_patch '"2026-06-05"'
assert_eq "trust key: idempotent" "$(cat "${_cfg_toml}.snapshot")" "$(cat "$_cfg_toml")"

# ---------- _toml_set_trust_key: section exists without the key ----------
bootstrap
source_libs
_cfg_toml2="$TEST_ROOT/config2.toml"
cat > "$_cfg_toml2" << 'EOF'
[trust]
os_version = 17
EOF
_toml_set_trust_key "$_cfg_toml2" security_patch '"2026-06-05"'
assert_contains "trust key: appended into existing section" "$(cat "$_cfg_toml2")" 'security_patch = "2026-06-05"'

# ---------- _toml_set_trust_key: no [trust] section at all ----------
bootstrap
source_libs
_cfg_toml3="$TEST_ROOT/config3.toml"
cat > "$_cfg_toml3" << 'EOF'
[main]
foo = 1
EOF
_toml_set_trust_key "$_cfg_toml3" security_patch '"2026-06-05"'
assert_contains "trust key: creates [trust] section" "$(cat "$_cfg_toml3")" "[trust]"
assert_contains "trust key: value set in new section" "$(cat "$_cfg_toml3")" 'security_patch = "2026-06-05"'

# ---------- ksm_set_security_patch: Tricky Store (txt) ----------
bootstrap
source_libs
mk_module tricky_store "Tricky Store"
detect_keystore_manager
ksm_set_security_patch "2026-06-05"
assert_file_eq "security patch txt: written as all=" "$KSM_SECURITY" "all=2026-06-05"
assert_file_not_exists "security patch txt: no restart.all created" "$OMK_RESTART_DIR/restart.all"

# ---------- ksm_set_security_patch: OMK (toml) ----------
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
assert_contains "security patch toml: value set" "$(cat "$KSM_SECURITY")" 'security_patch = "2026-06-05"'
assert_file_not_exists "security patch toml: no restart markers created" "$OMK_RESTART_DIR/restart.keymint"
assert_file_not_exists "security patch toml: no restart.all created" "$OMK_RESTART_DIR/restart.all"

# ---------- security_patch.sh --get: OMK returns current value ----------
bootstrap
source_libs
mk_module oh_my_keymint "OhMyKeymint"
mkdir -p "$OMK_DIR"
cat > "$OMK_CONFIG" << 'EOF'
[trust]
os_version = 17
security_patch = "2026-06-05"
EOF
_sp_get_out=$(run_feature security_patch.sh --get)
assert_eq "security_patch.sh --get omk" "2026-06-05" "$_sp_get_out"

# ---------- security_patch.sh --set: OMK updates config.toml ----------
bootstrap
source_libs
mk_module oh_my_keymint "OhMyKeymint"
mkdir -p "$OMK_DIR"
cat > "$OMK_CONFIG" << 'EOF'
[trust]
os_version = 17
security_patch = "auto"
EOF
run_feature security_patch.sh --set 2026-07-05 >/dev/null
assert_contains "security_patch.sh --set omk" "$(cat "$OMK_CONFIG")" 'security_patch = "2026-07-05"'

# ---------- security_patch.sh default: Tricky Store uses build.prop patch ----------
bootstrap
source_libs
mk_module tricky_store "Tricky Store"
set_prop "ro.build.version.security_patch" "2026-08-05"
set_prop "ro.vendor.build.security_patch" "2026-08-01"
detect_keystore_manager
run_feature security_patch.sh >/dev/null
assert_contains "security patch default txt: system line" "$(cat "$KSM_SECURITY")" "system=202608"
assert_contains "security patch default txt: boot line" "$(cat "$KSM_SECURITY")" "boot=2026-08-05"
assert_contains "security patch default txt: vendor line" "$(cat "$KSM_SECURITY")" "vendor=2026-08-01"
assert_file_not_exists "security patch default txt: no restart markers" "$OMK_RESTART_DIR/restart.keymint"

# ---------- security_patch.sh default: OMK uses build.prop patch ----------
bootstrap
source_libs
mk_module oh_my_keymint "OhMyKeymint"
mkdir -p "$OMK_DIR"
cat > "$OMK_CONFIG" << 'EOF'
[trust]
os_version = 17
security_patch = "auto"
EOF
set_prop "ro.build.version.security_patch" "2026-09-05"
detect_keystore_manager
run_feature security_patch.sh >/dev/null
assert_contains "security patch default toml: value set" "$(cat "$OMK_CONFIG")" 'security_patch = "2026-09-05"'
assert_file_not_exists "security patch default toml: no restart markers" "$OMK_RESTART_DIR/restart.keymint"

# ---------- ksm_read_targets / ksm_commit_targets: Tricky Store preserves suffixes+comments ----------
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
assert_contains "targets txt read: bare form, no suffix" "$_kt_out" "com.existing.app"
assert_not_contains "targets txt read: section header excluded" "$_kt_out" "["

_kt_staging="$TEST_ROOT/staging_txt.txt"
cat > "$_kt_staging" << 'EOF'
[a section]
android
com.existing.app!
com.new.app
EOF
ksm_commit_targets "$_kt_staging"
assert_contains "targets txt commit: section preserved" "$(cat "$KSM_TARGETS")" "[a section]"
assert_contains "targets txt commit: suffix preserved" "$(cat "$KSM_TARGETS")" "com.existing.app!"
assert_contains "targets txt commit: new entry present" "$(cat "$KSM_TARGETS")" "com.new.app"
assert_file_exists "targets txt commit: backup created" "${KSM_TARGETS}.bak"
assert_file_not_exists "targets txt commit: no restart markers created" "$OMK_RESTART_DIR/restart.keymint"
assert_file_not_exists "targets txt commit: no restart.all created" "$OMK_RESTART_DIR/restart.all"

# ---------- ksm_read_targets / ksm_commit_targets: OMK strips suffixes into scoop ----------
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
assert_contains "targets toml commit: new.app present, no suffix" "$_kt_out2" "com.new.app"
assert_not_contains "targets toml commit: suffix stripped" "$_kt_out2" "com.new.app!"
assert_contains "targets toml commit: other.app present" "$_kt_out2" "com.other.app"
assert_file_not_exists "targets toml commit: no restart.keymint created" "$OMK_RESTART_DIR/restart.keymint"
assert_file_not_exists "targets toml commit: no restart.all created" "$OMK_RESTART_DIR/restart.all"
assert_contains "targets toml commit: other sections preserved" "$(cat "$OMK_INJECTOR")" "[main]"

# ---------- ksm_reload touches only the keymint restart trigger ----------
bootstrap
source_libs
mk_module oh_my_keymint "OhMyKeymint"
mkdir -p "$OMK_DIR"
detect_keystore_manager
ksm_reload
assert_file_exists "reload: restart.keymint created" "$OMK_RESTART_DIR/restart.keymint"
assert_file_not_exists "reload: no restart.injector created" "$OMK_RESTART_DIR/restart.injector"
assert_file_not_exists "reload: no restart.all created" "$OMK_RESTART_DIR/restart.all"

# ---------- ksm_reload_full touches all three OMK restart triggers ----------
bootstrap
source_libs
mk_module oh_my_keymint "OhMyKeymint"
mkdir -p "$OMK_DIR"
detect_keystore_manager
ksm_reload_full
assert_file_exists "full reload: restart.keymint created" "$OMK_RESTART_DIR/restart.keymint"
assert_file_exists "full reload: restart.injector created" "$OMK_RESTART_DIR/restart.injector"
assert_file_exists "full reload: restart.all created" "$OMK_RESTART_DIR/restart.all"

# ---------- ksm_reload_commit batches deferred reloads ----------
bootstrap
source_libs
mk_module oh_my_keymint "OhMyKeymint"
mkdir -p "$OMK_DIR"
detect_keystore_manager
SPECTER_KSM_RELOAD_DEFERRED=1 SPECTER_DIR="$SPECTER_DIR" ksm_reload
SPECTER_KSM_RELOAD_DEFERRED=1 SPECTER_DIR="$SPECTER_DIR" ksm_reload_full
assert_file_not_exists "deferred: no immediate restart.keymint" "$OMK_RESTART_DIR/restart.keymint"
SPECTER_KSM_RELOAD_DEFERRED=1 SPECTER_DIR="$SPECTER_DIR" ksm_reload_commit
assert_file_exists "deferred commit: restart.keymint created" "$OMK_RESTART_DIR/restart.keymint"
assert_file_exists "deferred commit: restart.injector created" "$OMK_RESTART_DIR/restart.injector"
assert_file_exists "deferred commit: restart.all created" "$OMK_RESTART_DIR/restart.all"

# ---------- ksm_reload is a no-op for Tricky Store ----------
bootstrap
source_libs
mk_module tricky_store "Tricky Store"
detect_keystore_manager
ksm_reload
assert_file_not_exists "reload: TS creates no restart.keymint" "$OMK_RESTART_DIR/restart.keymint"
assert_file_not_exists "reload: TS creates no restart.all" "$OMK_RESTART_DIR/restart.all"

# ---------- ksm_secure is a no-op for Tricky Store (files stay untouched) ----------
bootstrap
source_libs
mk_module tricky_store "Tricky Store"
detect_keystore_manager
_sec_file="$TEST_ROOT/plain.txt"
echo hi > "$_sec_file"
ksm_secure "$_sec_file" 0600
assert_file_exists "secure: TS leaves file in place" "$_sec_file"

# ---------- ksm_heal_if_wedged helpers ----------
_omk_mk_alive() {
  mkdir -p "$OMK_RESTART_DIR" "$OMK_DIR"
  printf '%s\n' "$$" > "$OMK_RESTART_DIR/keymint-daemon.pid"
  printf '%s\n' "$$" > "$OMK_RESTART_DIR/injector-daemon.pid"
}

_omk_log_tf() {
  _age="${1:-0}"
  _now=$(date -u +%s)
  _ts=$(date -u -d "@$((_now - _age))" +"%Y-%m-%d %H:%M:%S" 2>/dev/null \
    || date -u -r "$((_now - _age))" +"%Y-%m-%d %H:%M:%S")
  printf '%s UTC WARN uid=1 OMK getSecurityLevel failed: TransactionFailed / Unknown\n' "$_ts" \
    > "$OMK_INJECTOR_LOG"
  unset _age _now _ts
}

# ---------- heal: non-OMK is a no-op ----------
bootstrap
source_libs
mk_module tricky_store "Tricky Store"
detect_keystore_manager
ksm_heal_if_wedged
assert_file_not_exists "heal: TS creates no restart.all" "$OMK_RESTART_DIR/restart.all"

# ---------- heal: healthy OMK (alive daemons, no TF) → no reload ----------
bootstrap
source_libs
mk_module oh_my_keymint "OhMyKeymint"
_omk_mk_alive
: > "$OMK_INJECTOR_LOG"
detect_keystore_manager
ksm_heal_if_wedged
assert_file_not_exists "heal: healthy omk → no restart.all" "$OMK_RESTART_DIR/restart.all"

# ---------- heal: recent TransactionFailed → full reload ----------
bootstrap
source_libs
mk_module oh_my_keymint "OhMyKeymint"
_omk_mk_alive
_omk_log_tf 0
detect_keystore_manager
ksm_heal_if_wedged
assert_file_exists "heal: recent TF → restart.all" "$OMK_RESTART_DIR/restart.all"
assert_file_exists "heal: recent TF → restart.keymint" "$OMK_RESTART_DIR/restart.keymint"
assert_file_exists "heal: recent TF → restart.injector" "$OMK_RESTART_DIR/restart.injector"

# ---------- heal: stale TransactionFailed (>5 min) → no reload ----------
bootstrap
source_libs
mk_module oh_my_keymint "OhMyKeymint"
_omk_mk_alive
_omk_log_tf 600
detect_keystore_manager
ksm_heal_if_wedged
assert_file_not_exists "heal: stale TF → no restart.all" "$OMK_RESTART_DIR/restart.all"

# ---------- heal: dead daemons → full reload ----------
bootstrap
source_libs
mk_module oh_my_keymint "OhMyKeymint"
mkdir -p "$OMK_DIR" "$OMK_RESTART_DIR"
: > "$OMK_INJECTOR_LOG"
detect_keystore_manager
ksm_heal_if_wedged
assert_file_exists "heal: dead daemons → restart.all" "$OMK_RESTART_DIR/restart.all"

# ---------- heal: cooldown blocks a second reload ----------
bootstrap
source_libs
mk_module oh_my_keymint "OhMyKeymint"
_omk_mk_alive
_omk_log_tf 0
detect_keystore_manager
ksm_heal_if_wedged
assert_file_exists "heal: cooldown setup reload" "$OMK_RESTART_DIR/restart.all"
rm -f "$OMK_RESTART_DIR"/restart.*
ksm_heal_if_wedged
assert_file_not_exists "heal: cooldown blocks second reload" "$OMK_RESTART_DIR/restart.all"

# ---------- heal: ignores deferred reload (immediate full restart) ----------
bootstrap
source_libs
mk_module oh_my_keymint "OhMyKeymint"
_omk_mk_alive
_omk_log_tf 0
detect_keystore_manager
SPECTER_KSM_RELOAD_DEFERRED=1 ksm_heal_if_wedged
assert_file_exists "heal: deferred ignored → restart.all now" "$OMK_RESTART_DIR/restart.all"

done_testing
