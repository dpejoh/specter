plan "lib/props.sh — apply_vbmeta_props function"

# apply_vbmeta_props() no longer sets digest (moved to boot_hash.sh)
# Only tests the lib function — the feature script vbmeta.sh was removed
# and its logic rolled into boot_hash.sh + lib/props.sh

# ---- digest is NOT set by apply_vbmeta_props ----
bootstrap
source_libs
echo "abc123digest" > "$VBMETA_DIGEST"
apply_vbmeta_props
assert_prop_not_set "vbmeta: digest not set by apply_vbmeta_props" "ro.boot.vbmeta.digest"

# ---- preserves existing avb props ----
bootstrap
source_libs
set_prop "ro.boot.vbmeta.avb_version" "2.0"
set_prop "ro.boot.vbmeta.hash_alg" "sha512"
apply_vbmeta_props
assert_prop_eq "vbmeta: avb_version preserved" "ro.boot.vbmeta.avb_version" "2.0"
assert_prop_eq "vbmeta: hash_alg preserved"    "ro.boot.vbmeta.hash_alg" "sha512"

# ---- sets defaults when missing ----
bootstrap
source_libs
apply_vbmeta_props
assert_prop_eq "vbmeta: avb_version set to default"          "ro.boot.vbmeta.avb_version" "1.3"
assert_prop_eq "vbmeta: hash_alg set to default"             "ro.boot.vbmeta.hash_alg" "sha256"
assert_prop_eq "vbmeta: invalidate_on_error set to default"  "ro.boot.vbmeta.invalidate_on_error" "yes"
assert_prop_eq "vbmeta: size set to default"                 "ro.boot.vbmeta.size" "4096"

# ---- no crash when digest file missing ----
bootstrap
source_libs
rm -f "$VBMETA_DIGEST"
apply_vbmeta_props
assert_prop_not_set "vbmeta: digest not set when file missing" "ro.boot.vbmeta.digest"
assert_prop_eq "vbmeta: avb_version still set" "ro.boot.vbmeta.avb_version" "1.3"

done_testing
