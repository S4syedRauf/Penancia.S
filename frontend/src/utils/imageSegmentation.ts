export interface ForegroundComponentResult {
  labels: Int32Array;
  largestLabel: number;
  pixelCount: number;
  bounds: { minX: number; minY: number; maxX: number; maxY: number } | null;
}

/**
 * Labels 4-connected foreground pixels and returns the largest component.
 * This prevents disconnected debris or frame edges from distorting cell dimensions.
 */
export function findLargestForegroundComponent(
  mask: Uint8Array,
  width: number,
  height: number,
): ForegroundComponentResult {
  if (mask.length !== width * height || width <= 0 || height <= 0) {
    throw new Error('Mask dimensions do not match the supplied image size.');
  }

  const labels = new Int32Array(mask.length);
  const stack = new Int32Array(mask.length);
  let largestLabel = 0;
  let largestSize = 0;
  let largestBounds: ForegroundComponentResult['bounds'] = null;
  let nextLabel = 0;

  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || labels[start] !== 0) continue;
    nextLabel += 1;
    let stackSize = 1;
    let componentSize = 0;
    stack[0] = start;
    labels[start] = nextLabel;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;

    while (stackSize > 0) {
      const index = stack[--stackSize];
      const x = index % width;
      const y = Math.floor(index / width);
      componentSize += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);

      if (x > 0) visit(index - 1);
      if (x + 1 < width) visit(index + 1);
      if (y > 0) visit(index - width);
      if (y + 1 < height) visit(index + width);
    }

    if (componentSize > largestSize) {
      largestLabel = nextLabel;
      largestSize = componentSize;
      largestBounds = { minX, minY, maxX, maxY };
    }

    function visit(index: number) {
      if (mask[index] && labels[index] === 0) {
        labels[index] = nextLabel;
        stack[stackSize++] = index;
      }
    }
  }

  return { labels, largestLabel, pixelCount: largestSize, bounds: largestBounds };
}
