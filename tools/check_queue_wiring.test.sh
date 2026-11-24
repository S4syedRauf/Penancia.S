#!/usr/bin/env bash
set -euo pipefail

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

setup_fixture() {
  local dir="$1"
  rm -rf "$dir"
  mkdir -p "$dir/src/Penancia.S.Workflow/Functions" "$dir/infra/modules"
  cp src/Penancia.S.Workflow/Functions/BlobEventsFunction.cs "$dir/src/Penancia.S.Workflow/Functions/"
  cp infra/main.bicep "$dir/infra/"
  cp infra/modules/storage.bicep "$dir/infra/modules/"
}

echo "Test 1: Real repo passes"
bash tools/check_queue_wiring.sh .

echo "Test 2: AzureWebJobsStorage in QueueTrigger fails"
setup_fixture "$TMP_DIR/t2"
sed -i.bak 's/Connection = "MediaQueues"/Connection = "AzureWebJobsStorage"/' "$TMP_DIR/t2/src/Penancia.S.Workflow/Functions/BlobEventsFunction.cs"
if bash tools/check_queue_wiring.sh "$TMP_DIR/t2" >/dev/null 2>&1; then
  echo "FAIL: Expected failure when using AzureWebJobsStorage"
  exit 1
fi
echo "  PASS"

echo "Test 3: Mismatched queue name fails"
setup_fixture "$TMP_DIR/t3"
sed -i.bak 's/blob-created-events/wrong-queue-name/' "$TMP_DIR/t3/src/Penancia.S.Workflow/Functions/BlobEventsFunction.cs"
if bash tools/check_queue_wiring.sh "$TMP_DIR/t3" >/dev/null 2>&1; then
  echo "FAIL: Expected failure when queue name does not match Bicep"
  exit 1
fi
echo "  PASS"

echo "Test 4: Missing MediaQueues__queueServiceUri in main.bicep fails"
setup_fixture "$TMP_DIR/t4"
sed -i.bak 's/MediaQueues__queueServiceUri/MediaQueues__wrong/' "$TMP_DIR/t4/infra/main.bicep"
if bash tools/check_queue_wiring.sh "$TMP_DIR/t4" >/dev/null 2>&1; then
  echo "FAIL: Expected failure when MediaQueues__queueServiceUri is missing"
  exit 1
fi
echo "  PASS"

echo "All queue wiring check tests passed!"
