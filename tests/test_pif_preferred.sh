plan "pif preferred device list membership"

bootstrap
. "$REPO_ROOT/src/lib/pif_preferred.sh"

_LIST='{"model":["Pixel 6","Pixel 10 Pro"],"product":["oriole_beta","mustang_beta"]}'

pif_product_in_list "$_LIST" "mustang_beta"
assert_eq "mustang in list" "0" "$?"

pif_product_in_list "$_LIST" "oriole_beta"
assert_eq "oriole in list" "0" "$?"

pif_product_in_list "$_LIST" "raven_beta"
assert_eq "missing product" "1" "$?"

pif_product_in_list "$_LIST" ""
assert_eq "empty product" "1" "$?"

pif_product_in_list "$_LIST" "beta"
assert_eq "no bare substring match" "1" "$?"

_choice=$(pif_choose_preferred "$_LIST" "Pixel 6|oriole_beta
Gone|raven_beta")
assert_eq "choose filters to live preferred" "Pixel 6|oriole_beta" "$_choice"

pif_choose_preferred "$_LIST" "Gone|raven_beta"
assert_eq "choose fails when none live" "1" "$?"

_choice=$(pif_choose_preferred "$_LIST" "Pixel 6|oriole_beta
Pixel 10 Pro|mustang_beta")
case "$_choice" in
  "Pixel 6|oriole_beta"|"Pixel 10 Pro|mustang_beta") ok "choose picks from multi pool" ;;
  *) fail "choose picks from multi pool" "got [$_choice]" ;;
esac

done_testing
