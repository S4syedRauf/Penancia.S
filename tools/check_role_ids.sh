#!/usr/bin/env bash
# Check that all role definition IDs in Bicep files are in the allow-list
# Usage: ./tools/check_role_ids.sh [--bicep-dir DIR] [--allow-list FILE]

set -euo pipefail

ALLOW_LIST="infra/role-ids.md"
BICEP_DIR="infra"

while [[ $# -gt 0 ]]; do
  case $1 in
    --bicep-dir)
      BICEP_DIR="$2"
      shift 2
      ;;
    --allow-list)
      ALLOW_LIST="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

BICEP_FILES=$(find "$BICEP_DIR" -name "*.bicep" -type f)

if [[ ! -f "$ALLOW_LIST" ]]; then
  echo "ERROR: Allow list not found at $ALLOW_LIST"
  exit 1
fi

# Extract allowed GUIDs from the markdown table (lines with | GUID |)
ALLOWED_GUIDS=$(grep -E '^\| [^|]+ \| [0-9a-f-]{36} \|' "$ALLOW_LIST" | sed -E 's/.*\| ([0-9a-f-]{36}) \|.*/\1/' | sort -u)

if [[ -z "$ALLOWED_GUIDS" ]]; then
  echo "ERROR: No allowed GUIDs found in $ALLOW_LIST"
  exit 1
fi

echo "Allowed role definition IDs:"
echo "$ALLOWED_GUIDS" | sed 's/^/  /'

# Extract all roleDefinitionId GUIDs from Bicep files
# Pattern: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'GUID')
# Use || true to prevent pipefail from exiting when grep finds no matches
FOUND_GUIDS=$(grep -rhoE --include="*.bicep" "subscriptionResourceId\([^)]*'Microsoft\.Authorization/roleDefinitions'[^)]*'([0-9a-f-]{36})'" $BICEP_FILES 2>/dev/null | sed -E "s/.*'([0-9a-f-]{36})'.*/\1/" | sort -u || true)

if [[ -z "$FOUND_GUIDS" ]]; then
  echo "No role definition IDs found in Bicep files"
  echo ""
  echo "SUCCESS: All role definition IDs are allowed."
  exit 0
fi

echo ""
echo "Found role definition IDs in Bicep files:"
echo "$FOUND_GUIDS" | sed 's/^/  /'

# Check each found GUID against allow list
EXIT_CODE=0
while IFS= read -r guid; do
  if ! echo "$ALLOWED_GUIDS" | grep -q "^${guid}$"; then
    echo ""
    echo "ERROR: Role definition ID '$guid' is NOT in the allow list ($ALLOW_LIST)"
    echo "       Found in:"
    grep -rl "subscriptionResourceId.*'${guid}'" $BICEP_FILES | sed 's/^/         /'
    EXIT_CODE=1
  fi
done <<< "$FOUND_GUIDS"

if [[ $EXIT_CODE -eq 0 ]]; then
  echo ""
  echo "SUCCESS: All role definition IDs are allowed."
else
  echo ""
  echo "FAILURE: One or more role definition IDs are not allowed."
  echo "         Add them to $ALLOW_LIST with proper source URL if they are valid."
fi

exit $EXIT_CODE