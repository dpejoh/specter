. "$(dirname "$0")/helpers.sh"

plan "vbmeta.sh — apply_vbmeta_props + feature script"

# ---- apply_vbmeta_props: sets digest from cache ----
bootstrap
source_libs
echo "abc123digest" > "$VBMETA_DIGEST"
apply_vbmeta_props
assert_prop_eq "vbmeta: digest from cache" "ro.boot.vbmeta.digest" "abc123digest"

# ---- apply_vbmeta_props: preserves existing avb props ----
bootstrap
source_libs
set_prop "ro.boot.vbmeta.avb_version" "2.0"
set_prop "ro.boot.vbmeta.hash_alg" "sha512"
apply_vbmeta_props
assert_prop_eq "vbmeta: avb_version preserved" "ro.boot.vbmeta.avb_version" "2.0"
assert_prop_eq "vbmeta: hash_alg preserved"    "ro.boot.vbmeta.hash_alg" "sha512"

# ---- apply_vbmeta_props: sets defaults when missing ----
bootstrap
source_libs
apply_vbmeta_props
assert_prop_eq "vbmeta: avb_version set to default"          "ro.boot.vbmeta.avb_version" "1.2"
assert_prop_eq "vbmeta: hash_alg set to default"             "ro.boot.vbmeta.hash_alg" "sha256"
assert_prop_eq "vbmeta: invalidate_on_error set to default"  "ro.boot.vbmeta.invalidate_on_error" "yes"
assert_prop_eq "vbmeta: size set to default"                 "ro.boot.vbmeta.size" "4096"

# ---- apply_vbmeta_props: no crash when digest file missing ----
bootstrap
source_libs
rm -f "$VBMETA_DIGEST"
apply_vbmeta_props
assert_prop_not_set "vbmeta: digest not set when file missing" "ro.boot.vbmeta.digest"
assert_prop_eq "vbmeta: avb_version still set" "ro.boot.vbmeta.avb_version" "1.2"

# ---- feature script: exits when toggle off ----
bootstrap
source_libs
set_cfg "toggle_vbmeta" "0"
_output=$(run_feature "vbmeta.sh" 2>&1 || true)
assert_eq "feature: exits with toggle=0" "" "$_output"
assert_prop_not_set "feature: no props set when toggle=0" "ro.boot.vbmeta.avb_version"

# ---- feature script: sets all props when toggle on, no cache ----
bootstrap
source_libs
set_cfg "toggle_vbmeta" "1"
run_feature "vbmeta.sh" 2>&1 || true
assert_prop_eq "feature: avb_version set"          "ro.boot.vbmeta.avb_version" "1.2"
assert_prop_eq "feature: hash_alg set"             "ro.boot.vbmeta.hash_alg" "sha256"
assert_prop_eq "feature: invalidate_on_error set"  "ro.boot.vbmeta.invalidate_on_error" "yes"
assert_prop_eq "feature: size set"                 "ro.boot.vbmeta.size" "4096"

done_testing
