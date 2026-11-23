#!/usr/bin/env bash
# Test script for check_changelog.sh
# Runs in a temporary git repo to verify behavior

set -euo pipefail

SCRIPT="$(cd "$(dirname "$0")" && pwd)/check_changelog.sh"

if [ ! -f "$SCRIPT" ]; then
  echo "FAIL: check_changelog.sh not found at $SCRIPT"
  exit 1
fi

TEST_DIR=$(mktemp -d)
echo "Test directory: $TEST_DIR"

cd "$TEST_DIR"

# Initialize git repo
git init -q
git config user.email "test@test.com"
git config user.name "Test User"

# Create initial commit
echo "# CHANGELOG" > CHANGELOG.md
mkdir -p frontend/src
echo "console.log('test')" > frontend/src/test.js
git add .
git commit -q -m "Initial commit"

BASE_SHA=$(git rev-parse HEAD)

# Test 1: Source file changed, no CHANGELOG change -> should exit 1
echo "Test 1: Source file changed, no CHANGELOG change"
echo "// new code" > frontend/src/new.js
git add frontend/src/new.js
git commit -q -m "Add new source file"

HEAD_SHA=$(git rev-parse HEAD)

set +e
bash "$SCRIPT" "$BASE_SHA" "$HEAD_SHA" > /dev/null 2>&1
EXIT_CODE=$?
set -e
if [ "$EXIT_CODE" -eq 1 ]; then
  echo "PASS: Exited 1 as expected"
else
  echo "FAIL: Expected exit 1, got $EXIT_CODE"
  exit 1
fi

# Reset for next test
git reset --hard HEAD~1

# Test 2: Source file changed AND CHANGELOG changed -> should exit 0
echo "Test 2: Source file changed AND CHANGELOG changed"
echo "// new code" > frontend/src/new.js
echo "### CL-TEST" >> CHANGELOG.md
git add frontend/src/new.js CHANGELOG.md
git commit -q -m "Add new source file with CHANGELOG"

HEAD_SHA=$(git rev-parse HEAD)

set +e
bash "$SCRIPT" "$BASE_SHA" "$HEAD_SHA" > /dev/null 2>&1
EXIT_CODE=$?
set -e
if [ "$EXIT_CODE" -eq 0 ]; then
  echo "PASS: Exited 0 as expected"
else
  echo "FAIL: Expected exit 0, got $EXIT_CODE"
  exit 1
fi

# Test 3: No source files changed -> should exit 0
echo "Test 3: No source files changed"
git reset --hard HEAD~1
echo "### CL-TEST2" >> CHANGELOG.md
git add CHANGELOG.md
git commit -q -m "Only CHANGELOG"

HEAD_SHA=$(git rev-parse HEAD)

set +e
bash "$SCRIPT" "$BASE_SHA" "$HEAD_SHA" > /dev/null 2>&1
EXIT_CODE=$?
set -e
if [ "$EXIT_CODE" -eq 0 ]; then
  echo "PASS: Exited 0 as expected"
else
  echo "FAIL: Expected exit 0, got $EXIT_CODE"
  exit 1
fi

# Test 4: Config file changed (should be watched)
echo "Test 4: Config file changed, no CHANGELOG"
git reset --hard HEAD~1
echo "// config change" > frontend/src/config.js
git add frontend/src/config.js
git commit -q -m "Change config"

HEAD_SHA=$(git rev-parse HEAD)

set +e
bash "$SCRIPT" "$BASE_SHA" "$HEAD_SHA" > /dev/null 2>&1
EXIT_CODE=$?
set -e
if [ "$EXIT_CODE" -eq 1 ]; then
  echo "PASS: Exited 1 as expected"
else
  echo "FAIL: Expected exit 1, got $EXIT_CODE"
  exit 1
fi

# Cleanup
cd /
rm -rf "$TEST_DIR"

echo "All tests passed!"