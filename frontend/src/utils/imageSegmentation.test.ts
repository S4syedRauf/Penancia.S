import assert from 'node:assert/strict';
import test from 'node:test';
import { findLargestForegroundComponent } from './imageSegmentation';

test('segmentation measures the largest connected structure instead of the whole image', () => {
  const width = 8;
  const height = 6;
  const mask = new Uint8Array(width * height);
  // Main 3×2 structure at (1,1), plus disconnected debris at (6,4).
  for (const [x, y] of [[1,1],[2,1],[3,1],[1,2],[2,2],[3,2],[6,4]]) {
    mask[y * width + x] = 1;
  }

  const result = findLargestForegroundComponent(mask, width, height);
  assert.equal(result.pixelCount, 6);
  assert.deepEqual(result.bounds, { minX: 1, minY: 1, maxX: 3, maxY: 2 });
  assert.notEqual(result.labels[4 * width + 6], result.largestLabel);
  assert.ok(result.largestLabel > 0);
});

test('segmentation returns no candidate for an empty field', () => {
  const result = findLargestForegroundComponent(new Uint8Array(20), 5, 4);
  assert.equal(result.pixelCount, 0);
  assert.equal(result.largestLabel, 0);
  assert.equal(result.bounds, null);
});
