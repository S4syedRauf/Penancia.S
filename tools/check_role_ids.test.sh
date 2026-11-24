#!/usr/bin/env bash
# Test script for check_role_ids.sh
# Creates temporary Bicep files with valid and invalid role IDs to verify the check works

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CHECK_SCRIPT="$SCRIPT_DIR/check_role_ids.sh"
ALLOW_LIST="$SCRIPT_DIR/../infra/role-ids.md"

if [[ ! -f "$CHECK_SCRIPT" ]]; then
  echo "ERROR: check_role_ids.sh not found at $CHECK_SCRIPT"
  exit 1
fi

if [[ ! -f "$ALLOW_LIST" ]]; then
  echo "ERROR: role-ids.md not found at $ALLOW_LIST"
  exit 1
fi

run_test() {
  local test_name="$1"
  local test_dir="$2"
  local expected_result="$3"  # "PASS" or "FAIL"
  
  echo "Test: $test_name"
  OUTPUT=$("$CHECK_SCRIPT" --bicep-dir "$test_dir" --allow-list "$ALLOW_LIST" 2>&1 || true)
  
  if [[ "$expected_result" == "PASS" ]]; then
    if echo "$OUTPUT" | grep -q "SUCCESS"; then
      echo "  PASS"
      return 0
    else
      echo "  FAIL: Expected SUCCESS"
      echo "Output: $OUTPUT"
      return 1
    fi
  else
    if echo "$OUTPUT" | grep -q "FAILURE"; then
      echo "  PASS"
      return 0
    else
      echo "  FAIL: Expected FAILURE"
      echo "Output: $OUTPUT"
      return 1
    fi
  fi
}

# Test 1: Valid role ID should pass
TEST_DIR=$(mktemp -d)
cat > "$TEST_DIR/valid.bicep" <<'EOF'
resource testRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: 'test'
  scope: resourceGroup()
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6')
    principalId: 'test'
    principalType: 'ServicePrincipal'
  }
}
EOF
run_test "Valid role ID (Key Vault Secrets User)" "$TEST_DIR" "PASS" || exit 1
rm -rf "$TEST_DIR"

# Test 2: Invalid role ID should fail
TEST_DIR=$(mktemp -d)
cat > "$TEST_DIR/invalid.bicep" <<'EOF'
resource testRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: 'test'
  scope: resourceGroup()
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '00000000-0000-0000-0000-000000000000')
    principalId: 'test'
    principalType: 'ServicePrincipal'
  }
}
EOF
run_test "Invalid role ID" "$TEST_DIR" "FAIL" || exit 1
rm -rf "$TEST_DIR"

# Test 3: Mixed valid and invalid should fail
TEST_DIR=$(mktemp -d)
cat > "$TEST_DIR/mixed.bicep" <<'EOF'
resource validRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: 'valid'
  scope: resourceGroup()
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'ba92f5b4-2d11-453d-a403-e96b0029c9fe')
    principalId: 'test'
    principalType: 'ServicePrincipal'
  }
}
resource invalidRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: 'invalid'
  scope: resourceGroup()
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '11111111-1111-1111-1111-111111111111')
    principalId: 'test'
    principalType: 'ServicePrincipal'
  }
}
EOF
run_test "Mixed valid and invalid" "$TEST_DIR" "FAIL" || exit 1
rm -rf "$TEST_DIR"

# Test 4: No role IDs should pass
TEST_DIR=$(mktemp -d)
cat > "$TEST_DIR/empty.bicep" <<'EOF'
resource storage 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: 'teststorage'
  location: 'uaenorth'
  sku: { name: 'Standard_LRS' }
  kind: 'StorageV2'
}
EOF
run_test "No role IDs" "$TEST_DIR" "PASS" || exit 1
rm -rf "$TEST_DIR"

# Test 5: Real infra files should pass
echo "Test: Real infra files"
OUTPUT=$("$CHECK_SCRIPT" 2>&1 || true)
if echo "$OUTPUT" | grep -q "SUCCESS"; then
  echo "  PASS"
else
  echo "  FAIL: Expected SUCCESS"
  echo "Output: $OUTPUT"
  exit 1
fi

echo ""
echo "All tests passed!"