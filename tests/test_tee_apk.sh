plan "tee_apk.sh — target append, versionCode compare"

bootstrap
source_libs
. "$REPO_ROOT/src/lib/tee_apk.sh"

# ---- specter_vc_newer ----
specter_vc_newer 2 "" && _r=0 || _r=1
assert_eq "newer: empty installed => upgrade" 0 "$_r"

specter_vc_newer 2 1 && _r=0 || _r=1
assert_eq "newer: bundled > installed" 0 "$_r"

specter_vc_newer 1 1 && _r=0 || _r=1
assert_eq "newer: equal => no" 1 "$_r"

specter_vc_newer 1 2 && _r=0 || _r=1
assert_eq "newer: bundled < installed => no" 1 "$_r"

# ---- ensure_specter_target ----
bootstrap
source_libs
. "$REPO_ROOT/src/lib/tee_apk.sh"
mk_module tricky_store "Tricky Store"
detect_keystore_manager
: > "$TARGET_TXT"
ensure_specter_target
assert_file_eq "target: appends package" "$TARGET_TXT" "com.dpejoh.specter"
ensure_specter_target
assert_file_eq "target: idempotent" "$TARGET_TXT" "com.dpejoh.specter"

bootstrap
source_libs
. "$REPO_ROOT/src/lib/tee_apk.sh"
mk_module tricky_store "Tricky Store"
detect_keystore_manager
printf 'android\ncom.android.vending\n' > "$TARGET_TXT"
ensure_specter_target
assert_contains "target: keeps existing" "$(cat "$TARGET_TXT")" "android"
assert_contains "target: adds specter" "$(cat "$TARGET_TXT")" "com.dpejoh.specter"

done_testing
