#!/usr/bin/env bash
# Validates that Azure Functions [QueueTrigger] attributes in C# match
# the Storage Queues and identity-based MediaQueues settings in Bicep.

set -euo pipefail

ROOT_DIR="${1:-.}"
WORKFLOW_DIR="$ROOT_DIR/src/Penancia.S.Workflow"
MAIN_BICEP="$ROOT_DIR/infra/main.bicep"
STORAGE_BICEP="$ROOT_DIR/infra/modules/storage.bicep"

if [ ! -d "$WORKFLOW_DIR" ] || [ ! -f "$MAIN_BICEP" ] || [ ! -f "$STORAGE_BICEP" ]; then
  echo "ERROR: Missing expected directories/files under '$ROOT_DIR'"
  exit 1
fi

# 1. Extract all [QueueTrigger("queue-name", Connection = "conn-name")] from C#
TRIGGERS=$(grep -rn 'QueueTrigger(' "$WORKFLOW_DIR" || true)
if [ -z "$TRIGGERS" ]; then
  echo "ERROR: No [QueueTrigger(...)] attributes found under $WORKFLOW_DIR"
  exit 1
fi

# 2. Ensure NO QueueTrigger uses AzureWebJobsStorage
if echo "$TRIGGERS" | grep -q 'Connection *= *"AzureWebJobsStorage"'; then
  echo "ERROR: Found [QueueTrigger] using AzureWebJobsStorage instead of MediaQueues:"
  echo "$TRIGGERS" | grep 'AzureWebJobsStorage'
  exit 1
fi

# 3. Extract queue names and Connection names and verify each
FAIL=0
while IFS= read -r line; do
  QUEUE_NAME=$(echo "$line" | sed -n 's/.*QueueTrigger("\([^"]*\)".*/\1/p')
  CONN_NAME=$(echo "$line" | sed -n 's/.*Connection *= *"\([^"]*\)".*/\1/p')

  if [ -z "$QUEUE_NAME" ] || [ -z "$CONN_NAME" ]; then
    echo "ERROR: Could not parse queue name or Connection from: $line"
    FAIL=1
    continue
  fi

  if [ "$CONN_NAME" != "MediaQueues" ]; then
    echo "ERROR: QueueTrigger '$QUEUE_NAME' uses Connection='$CONN_NAME', expected 'MediaQueues'"
    FAIL=1
  fi

  # Verify queue exists in storage.bicep
  if ! grep -q "name: '$QUEUE_NAME'" "$STORAGE_BICEP"; then
    echo "ERROR: Queue '$QUEUE_NAME' referenced by C# QueueTrigger is missing from $STORAGE_BICEP"
    FAIL=1
  fi

  # Verify queue exists in main.bicep
  if ! grep -q "'$QUEUE_NAME'" "$MAIN_BICEP"; then
    echo "ERROR: Queue '$QUEUE_NAME' referenced by C# QueueTrigger is not wired in $MAIN_BICEP"
    FAIL=1
  fi
done <<< "$TRIGGERS"

# 4. Verify identity-based MediaQueues__ settings in main.bicep
for setting in "MediaQueues__queueServiceUri" "MediaQueues__credential" "MediaQueues__clientId"; do
  if ! grep -q "name: '$setting'" "$MAIN_BICEP"; then
    echo "ERROR: Missing required Workflow env setting '$setting' in $MAIN_BICEP"
    FAIL=1
  fi
done

if ! grep -q "value: 'managedidentity'" "$MAIN_BICEP"; then
  echo "ERROR: MediaQueues__credential must be set to 'managedidentity' in $MAIN_BICEP"
  FAIL=1
fi

if [ "$FAIL" -ne 0 ]; then
  exit 1
fi

echo "SUCCESS: All QueueTrigger bindings match Bicep queues and identity-based MediaQueues config."
