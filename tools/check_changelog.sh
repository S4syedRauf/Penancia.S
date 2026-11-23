#!/usr/bin/env bash
# CHANGELOG enforcement script
# Exits with code 1 if source files changed but CHANGELOG.md did not.
# Usage: check_changelog.sh <base-sha> <head-sha>
#   base-sha: the PR base commit (e.g., ${{ github.event.pull_request.base.sha }})
#   head-sha: the PR head commit (e.g., ${{ github.sha }})

set -euo pipefail

BASE_SHA="${1:-}"
HEAD_SHA="${2:-}"

if [ -z "$BASE_SHA" ] || [ -z "$HEAD_SHA" ]; then
  echo "Usage: $0 <base-sha> <head-sha>"
  echo "  base-sha: PR base commit SHA"
  echo "  head-sha: PR head commit SHA"
  exit 1
fi

# Files that require a CHANGELOG entry when modified
WATCHED_PATHS=(
  "src/"
  "models/"
  "frontend/src/"
  "infra/"
  "contracts/"
)

# Check if CHANGELOG.md was modified in the PR
if git diff --name-only "$BASE_SHA" "$HEAD_SHA" | grep -q "^CHANGELOG.md$"; then
  echo "✓ CHANGELOG.md was modified in this PR"
  exit 0
fi

# Check if any watched files were modified in the PR
CHANGED_FILES=$(git diff --name-only "$BASE_SHA" "$HEAD_SHA")
REQUIRES_CHANGELOG=false

for file in $CHANGED_FILES; do
  for path in "${WATCHED_PATHS[@]}"; do
    if [[ "$file" == "$path"* ]]; then
      REQUIRES_CHANGELOG=true
      echo "⚠ Changed file requires CHANGELOG entry: $file"
      break 2
    fi
  done
done

if [ "$REQUIRES_CHANGELOG" = true ]; then
  echo "✗ CHANGELOG.md was not modified but source files changed in this PR."
  echo "Please add a CHANGELOG entry following the template in docs/BLUEPRINT.md Section 15.3"
  exit 1
fi

echo "✓ No watched source files changed, or CHANGELOG.md was updated"
exit 0