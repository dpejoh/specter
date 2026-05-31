# Test assertion helpers
# Usage: . ./helpers.sh  (from test scripts that have sourced mock_env.sh)

_pass=0
_fail=0

plan() { echo "=== $1 ==="; }

ok() {
  _label="$1"
  _pass=$((_pass + 1))
  echo "  PASS  $_label"
}

fail() {
  _label="$1" _detail="${2:-}"
  _fail=$((_fail + 1))
  echo "  FAIL  $_label"
  [ -n "$_detail" ] && echo "        $_detail"
}

assert_eq() {
  _label="$1" _expected="$2" _actual="$3"
  if [ "$_expected" = "$_actual" ]; then
    ok "$_label"
  else
    fail "$_label" "expected [$_expected] got [$_actual]"
  fi
}

assert_ne() {
  _label="$1" _unexpected="$2" _actual="$3"
  if [ "$_unexpected" != "$_actual" ]; then
    ok "$_label"
  else
    fail "$_label" "unexpected value [$_actual]"
  fi
}

assert_contains() {
  _label="$1" _haystack="$2" _needle="$3"
  case "$_haystack" in *"$_needle"*)
    ok "$_label"; return 0
  esac
  fail "$_label" "expected to contain [$_needle]"
}

assert_not_contains() {
  _label="$1" _haystack="$2" _needle="$3"
  case "$_haystack" in *"$_needle"*)
    fail "$_label" "unexpectedly contained [$_needle]"
    ;;
  *)
    ok "$_label"
    ;;
  esac
}

assert_prop_eq() {
  _label="$1" _prop="$2" _expected="$3"
  _val=$(prop_value "$_prop")
  assert_eq "$_label" "$_expected" "$_val"
}

assert_prop_set() {
  _label="$1" _prop="$2"
  if prop_was_set "$_prop"; then
    _val=$(prop_value "$_prop")
    ok "$_label"
  else
    fail "$_label" "prop [$_prop] was not set"
  fi
}

assert_prop_not_set() {
  _label="$1" _prop="$2"
  if prop_was_set "$_prop"; then
    _val=$(prop_value "$_prop")
    fail "$_label" "prop [$_prop] was unexpectedly set to [$_val]"
  else
    ok "$_label"
  fi
}

assert_log_contains() {
  _label="$1" _log="$2" _pattern="$3"
  if log_contains "$_log" "$_pattern"; then
    ok "$_label"
  else
    _content=$(get_log "$_log" 5)
    fail "$_label" "log [$_log] missing pattern [$_pattern]. Last entries: $_content"
  fi
}

assert_log_not_contains() {
  _label="$1" _log="$2" _pattern="$3"
  if log_contains "$_log" "$_pattern"; then
    _content=$(get_log "$_log" 5)
    fail "$_label" "log [$_log] unexpectedly contains [$_pattern]. Last entries: $_content"
  else
    ok "$_label"
  fi
}

assert_file_exists() {
  _label="$1" _file="$2"
  if [ -f "$_file" ]; then
    ok "$_label"
  else
    fail "$_label" "file [$_file] does not exist"
  fi
}

assert_file_not_exists() {
  _label="$1" _file="$2"
  if [ ! -f "$_file" ]; then
    ok "$_label"
  else
    fail "$_label" "file [$_file] should not exist"
  fi
}

assert_file_eq() {
  _label="$1" _file="$2" _expected="$3"
  if [ -f "$_file" ]; then
    _val=$(cat "$_file")
    assert_eq "$_label" "$_expected" "$_val"
  else
    fail "$_label" "file [$_file] does not exist"
  fi
}

assert_exit_code() {
  _label="$1" _expected="$2" _actual="$3"
  assert_eq "$_label" "$_expected" "$_actual"
}

done_testing() {
  echo "---"
  echo "  Total: $((_pass + _fail)) | Pass: $_pass | Fail: $_fail"
  echo ""
  return $_fail
}
