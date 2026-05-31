#!/usr/bin/env bash
# Specter boot script test runner
# Usage: ./tests/run.sh [test_name...]
#   (no args) -> run all tests
#   args -> run only matching test files (e.g. ./run.sh boot_hardening common)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT/tests"

# Pre-flight checks
for dep in bash mktemp; do
  command -v "$dep" >/dev/null 2>&1 || { echo "Missing dependency: $dep"; exit 1; }
done

declare -a TESTS
if [ $# -gt 0 ]; then
  for _arg; do
    _matched=false
    for _f in test_*.sh; do
      case "$_f" in *"$_arg"*) TESTS+=("$_f"); _matched=true ;; esac
    done
    [ "$_matched" = false ] && echo "WARN: no test matching '$_arg' found" >&2
  done
else
  for _f in test_*.sh; do TESTS+=("$_f"); done
fi

[ ${#TESTS[@]} -eq 0 ] && echo "No tests found." && exit 1

total_pass=0
total_fail=0
total_files=0
total_assertions=0

echo "=============================================="
echo "  Specter Boot Script Test Suite"
echo "  Repo: $REPO_ROOT"
echo "=============================================="
echo ""

# Source mock_env once for helpers (but each test calls its own bootstrap)
. ./mock_env.sh
. ./helpers.sh 2>/dev/null || true

for _test_file in "${TESTS[@]}"; do
  [ ! -f "$_test_file" ] && echo "  SKIP  $_test_file (not found)" && continue

  total_files=$((total_files + 1))
  _test_name="${_test_file%.sh}"
  _test_name="${_test_name#test_}"
  echo "---"
  echo ""

  # Reset global counters for the test
  _pass_before=$_pass
  _fail_before=$_fail

  # Run the test in a subshell to isolate state
  (
    . ./mock_env.sh
    . ./helpers.sh 2>/dev/null
    set +e
    . "$_test_file"
    _r=$?
    exit $_r
  )
  _test_rc=$?

  # Count what was added
  echo "  (file: $_test_file, rc=$_test_rc)"
  echo ""

  unset _test_name _pass_before _fail_before
done

echo "=============================================="
echo "  All tests completed."
echo "=============================================="
exit 0
