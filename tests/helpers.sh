_pass=0; _fail=0

plan() { echo "=== $1 ==="; }

ok() { _label="$1"; _pass=$((_pass + 1)); echo "  PASS  $_label"; }

fail() { _label="$1" _detail="${2:-}"; _fail=$((_fail + 1)); echo "  FAIL  $_label"; [ -n "$_detail" ] && echo "        $_detail"; }

assert_eq() { _label="$1" _expected="$2" _actual="$3"; if [ "$_expected" = "$_actual" ]; then ok "$_label"; else fail "$_label" "expected [$_expected] got [$_actual]"; fi; }

assert_contains() { _label="$1" _haystack="$2" _needle="$3"; case "$_haystack" in *"$_needle"*) ok "$_label" ;; *) fail "$_label" "expected to contain [$_needle]" ;; esac; }

assert_not_contains() { _label="$1" _haystack="$2" _needle="$3"; case "$_haystack" in *"$_needle"*) fail "$_label" "unexpectedly contained [$_needle]" ;; *) ok "$_label" ;; esac; }

assert_file_exists() { _label="$1" _file="$2"; [ -f "$_file" ] && ok "$_label" || fail "$_label" "file [$_file] does not exist"; }

assert_file_not_exists() { _label="$1" _file="$2"; [ ! -f "$_file" ] && ok "$_label" || fail "$_label" "file [$_file] should not exist"; }

assert_file_eq() { _label="$1" _file="$2" _expected="$3"; [ -f "$_file" ] && assert_eq "$_label" "$_expected" "$(cat "$_file")" || fail "$_label" "file [$_file] does not exist"; }

assert_exit_code() { assert_eq "$1" "$2" "$3"; }

assert_prop_eq() { _label="$1" _prop="$2" _expected="$3"; _val=$(prop_value "$_prop"); assert_eq "$_label" "$_expected" "$_val"; }

assert_prop_set() { _label="$1" _prop="$2"; if prop_was_set "$_prop"; then ok "$_label"; else fail "$_label" "prop [$_prop] was not set"; fi; }

assert_prop_not_set() { _label="$1" _prop="$2"; prop_was_set "$_prop" && fail "$_label" "prop [$_prop] was unexpectedly set" || ok "$_label"; }

assert_log_contains() { _label="$1" _log="$2" _pattern="$3"; log_contains "$_log" "$_pattern" && ok "$_label" || fail "$_label" "log [$_log] missing pattern [$_pattern]"; }

assert_log_not_contains() { _label="$1" _log="$2" _pattern="$3"; log_contains "$_log" "$_pattern" && fail "$_label" "log [$_log] unexpectedly contains pattern" || ok "$_label"; }

done_testing() { echo "---"; echo "  Total: $((_pass + _fail)) | Pass: $_pass | Fail: $_fail"; echo ""; return $_fail; }
