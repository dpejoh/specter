plan "pif preferred + imported device seam"

bootstrap
. "$REPO_ROOT/src/lib/pif_preferred.sh"

_LIST='{"model":["Pixel 6","Pixel 10 Pro"],"product":["oriole_beta","mustang_beta"]}'

pif_product_in_list "$_LIST" "mustang_beta"
assert_eq "mustang in list" "0" "$?"
pif_product_in_list "$_LIST" "beta"
assert_eq "no bare substring match" "1" "$?"

# --- validate Inject-style pif.prop ---
_tmp=$(mktemp -d)
printf '%s\n' 'FINGERPRINT=google/blazer/blazer:17/CP2A.1/1:user/release-keys' 'MODEL=Pixel 10 Pro' 'MANUFACTURER=Google' >"$_tmp/ok.prop"
printf '%s\n' 'MODEL=Pixel 10 Pro' >"$_tmp/no_fp.prop"
printf '%s\n' 'FINGERPRINT=google/blazer/blazer:17/CP2A.1/1:user/release-keys' >"$_tmp/no_model.prop"

pif_prop_valid "$_tmp/ok.prop"
assert_eq "valid prop" "0" "$?"

pif_prop_valid "$_tmp/no_fp.prop"
assert_eq "missing fingerprint" "1" "$?"

pif_prop_valid "$_tmp/no_model.prop"
assert_eq "missing model" "1" "$?"

assert_eq "read model" "Pixel 10 Pro" "$(pif_prop_get "$_tmp/ok.prop" MODEL)"

# --- choose mixes Canary + Imported ---
SPECTER_DIR="$_tmp"
mkdir -p "$SPECTER_DIR/pif_imported"
cp "$_tmp/ok.prop" "$SPECTER_DIR/pif_imported/abc.prop"

_choice=$(pif_choose_preferred "$_LIST" "Gone|raven_beta
Pixel 10 Pro|imported:abc")
assert_eq "choose keeps imported when canary gone" "Pixel 10 Pro|imported:abc" "$_choice"

pif_choose_preferred "$_LIST" "Gone|raven_beta
Gone|imported:missing"
assert_eq "choose fails when imported file missing" "1" "$?"

_choice=$(pif_choose_preferred "$_LIST" "Pixel 6|oriole_beta
Pixel 10 Pro|imported:abc")
case "$_choice" in
  "Pixel 6|oriole_beta"|"Pixel 10 Pro|imported:abc") ok "choose picks from mixed pool" ;;
  *) fail "choose picks from mixed pool" "got [$_choice]" ;;
esac

# --- apply imported copy ---
_out="$_tmp/data_adb_pif.prop"
pif_apply_imported "abc" "$_out"
assert_file_eq "apply writes prop as-is" "$_out" "$(cat "$_tmp/ok.prop")"

rm -rf "$_tmp"
done_testing
