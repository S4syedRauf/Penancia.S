import type { StageLogEntry } from '../types/panacea';
import { findLargestForegroundComponent } from './imageSegmentation';

export interface ImageAnalysisResult {
  width: number;
  height: number;
  sha256: string;
  focusVariance: number;
  clippedDarkPct: number;
  clippedBrightPct: number;
  cellDetected: boolean;
  morphologyCategory: 'Normal' | 'Tapered' | 'Pyriform' | 'Amorphous' | 'Unclassified';
  acrosomeCoveragePct: number;
  headLengthUm: number;
  headWidthUm: number;
  lengthToWidthRatio: number;
  midpieceDefect: boolean | null;
  tailDefect: boolean | null;
  tziScore: number | null;
  stageLogs: StageLogEntry[];
  annotatedPreviewDataUrl?: string;
}

/**
 * Computes SHA-256 hex string of a File or ArrayBuffer using browser Web Crypto.
 */
export async function computeFileSha256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Extracts a high-quality video frame from any HTML5-compatible video format.
 */
export async function extractFrameFromVideo(file: File): Promise<{ canvas: HTMLCanvasElement; width: number; height: number; duration: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    const url = URL.createObjectURL(file);
    video.src = url;

    let resolved = false;
    const cleanup = () => {
      URL.revokeObjectURL(url);
      video.remove();
    };

    video.onloadedmetadata = () => {
      const seekTime = Math.min(1.0, (video.duration || 1) / 2);
      video.currentTime = seekTime;
    };

    video.onseeked = () => {
      if (resolved) return;
      resolved = true;
      try {
        const width = video.videoWidth || 1280;
        const height = video.videoHeight || 720;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          cleanup();
          reject(new Error('Canvas 2D context unavailable'));
          return;
        }
        ctx.drawImage(video, 0, 0, width, height);
        cleanup();
        resolve({ canvas, width, height, duration: video.duration || 0 });
      } catch (err) {
        cleanup();
        reject(err);
      }
    };

    video.onerror = () => {
      cleanup();
      reject(new Error('Browser could not decode video container. Please ensure standard MP4, WebM, or MOV format.'));
    };

    // Timeout safety for unresponsive video codecs
    setTimeout(() => {
      if (!resolved) {
        cleanup();
        reject(new Error('Video frame extraction timed out. Please upload a still image (.bmp, .png, .jpg).'));
      }
    }, 8000);
  });
}

/**
 * Reads any image (BMP, PNG, JPG) or extracts a frame from video and performs cytological morphometric analysis.
 * Non-blocking, handles downscaling to max 1024px to prevent UI freezes on large micrographs.
 */
export async function analyzeSpermImage(
  file: File,
  umPerPx = 0.05
): Promise<ImageAnalysisResult> {
  // 1. Compute SHA-256 on the original raw file bytes
  const sha256 = await computeFileSha256(file);

  const isVideo = file.type.startsWith('video/') || /\.(mp4|mov|avi|webm|mkv)$/i.test(file.name);
  let origWidth = 0;
  let origHeight = 0;
  let sourceCanvas: HTMLCanvasElement | null = null;
  let sourceImg: HTMLImageElement | null = null;

  if (isVideo) {
    const extracted = await extractFrameFromVideo(file);
    origWidth = extracted.width;
    origHeight = extracted.height;
    sourceCanvas = extracted.canvas;
  } else {
    // Load image into memory with robust decoding error message
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Failed to read file from disk.'));
      reader.readAsDataURL(file);
    });

    sourceImg = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.crossOrigin = 'anonymous';
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('This image could not be decoded. If using a compressed or palette-based BMP, please convert it to PNG or standard 24-bit uncompressed BMP.'));
      el.src = dataUrl;
    });

    origWidth = sourceImg.naturalWidth || sourceImg.width;
    origHeight = sourceImg.naturalHeight || sourceImg.height;
  }

  if (!origWidth || !origHeight) {
    throw new Error('Unable to determine image dimensions.');
  }

  // Downscale to max 1024px for responsive in-browser processing without UI freeze
  const maxDim = 1024;
  const scale = Math.min(1, maxDim / Math.max(origWidth, origHeight));
  const width = Math.max(1, Math.round(origWidth * scale));
  const height = Math.max(1, Math.round(origHeight * scale));
  const effectiveUmPerPx = scale < 1 ? umPerPx / scale : umPerPx;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable in browser.');
  }

  if (sourceCanvas) {
    ctx.drawImage(sourceCanvas, 0, 0, width, height);
  } else if (sourceImg) {
    ctx.drawImage(sourceImg, 0, 0, width, height);
  }
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;

  // Yield to UI thread to prevent blocking
  await new Promise((r) => setTimeout(r, 0));

  // 1. Grayscale luminance and Laplacian focus variance
  const luma = new Float32Array(width * height);
  let darkCount = 0;
  let brightCount = 0;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    const pxIdx = i / 4;
    luma[pxIdx] = y;

    if (y < 12) darkCount++;
    if (y > 245) brightCount++;
  }

  const clippedDarkPct = Number(((darkCount / (width * height)) * 100).toFixed(2));
  const clippedBrightPct = Number(((brightCount / (width * height)) * 100).toFixed(2));

  // Compute 3x3 Laplacian variance for focus
  let lapSum = 0;
  let lapSqSum = 0;
  let lapCount = 0;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const lap =
        luma[idx - width] +
        luma[idx + width] +
        luma[idx - 1] +
        luma[idx + 1] -
        4 * luma[idx];
      lapSum += lap;
      lapSqSum += lap * lap;
      lapCount++;
    }
  }

  const lapMean = lapCount > 0 ? lapSum / lapCount : 0;
  const rawFocusVariance = lapCount > 0 ? Math.round(lapSqSum / lapCount - lapMean * lapMean) : 0;
  const focusVariance = Math.max(0, rawFocusVariance);

  // 2. Cell Detection & Morphology Segmentation
  // Background estimation from corners
  const bgR = (data[0] + data[(width - 1) * 4] + data[(height - 1) * width * 4]) / 3;
  const bgG = (data[1] + data[(width - 1) * 4 + 1] + data[(height - 1) * width * 4 + 1]) / 3;
  const bgB = (data[2] + data[(width - 1) * 4 + 2] + data[(height - 1) * width * 4 + 2]) / 3;

  const foregroundMask = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i += 1) {
    const offset = i * 4;
    const difference = Math.sqrt(
      (data[offset] - bgR) ** 2 + (data[offset + 1] - bgG) ** 2 + (data[offset + 2] - bgB) ** 2,
    );
    if (difference > 25) foregroundMask[i] = 1;
  }

  const component = findLargestForegroundComponent(foregroundMask, width, height);
  const cellPixels = component.pixelCount;
  const cellDetected = cellPixels > 100 && component.bounds !== null;
  const bounds = component.bounds;
  const cellWidthPx = cellDetected && bounds ? Math.max(1, bounds.maxX - bounds.minX + 1) : 0;
  const cellHeightPx = cellDetected && bounds ? Math.max(1, bounds.maxY - bounds.minY + 1) : 0;

  const lengthToWidthRatio = cellDetected
    ? Number((Math.max(cellWidthPx, cellHeightPx) / Math.min(cellWidthPx, cellHeightPx)).toFixed(2))
    : 0;

  let acrosomePixels = 0;
  let nucleusPixels = 0;
  if (cellDetected) {
    for (let i = 0; i < component.labels.length; i += 1) {
      if (component.labels[i] !== component.largestLabel) continue;
      const offset = i * 4;
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      if (b > r + 15) acrosomePixels += 1;
      else if (r > g + 10 || b > g + 10) nucleusPixels += 1;
    }
  }

  const totalHeadPixels = Math.max(1, acrosomePixels + nucleusPixels);
  const acrosomeCoveragePct = cellDetected
    ? Number(((acrosomePixels / totalHeadPixels) * 100).toFixed(1))
    : 0;

  // Preliminary threshold-based shape category; not a clinical Kruger assessment.
  let morphologyCategory: ImageAnalysisResult['morphologyCategory'] = 'Unclassified';
  if (cellDetected) {
    if (lengthToWidthRatio > 2.0) morphologyCategory = 'Tapered';
    else if (lengthToWidthRatio < 1.3) morphologyCategory = 'Pyriform';
    else if (acrosomeCoveragePct < 30 || acrosomeCoveragePct > 80) morphologyCategory = 'Amorphous';
    else morphologyCategory = 'Normal';
  }

  const headLengthUm = cellDetected ? Number((Math.max(cellWidthPx, cellHeightPx) * effectiveUmPerPx).toFixed(2)) : 0;
  const headWidthUm = cellDetected ? Number((Math.min(cellWidthPx, cellHeightPx) * effectiveUmPerPx).toFixed(2)) : 0;

  // A single 2D thresholded frame cannot establish these measurements.
  const midpieceDefect = null;
  const tailDefect = null;
  const tziScore = null;

  if (cellDetected && bounds) {
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = Math.max(2, Math.round(width / 400));
    ctx.strokeRect(bounds.minX, bounds.minY, cellWidthPx, cellHeightPx);
  }
  const annotatedPreviewDataUrl = canvas.toDataURL('image/jpeg', 0.88);

  // Generate honest S0-S13 Stage Trace Log
  const now = () => new Date().toISOString();
  const stageLogs: StageLogEntry[] = [
    {
      stage: 'S0',
      name: 'Intake & Optical Quality Gate',
      outcome: focusVariance >= 95 ? 'passed' : 'warning',
      note: `Source decoded at ${origWidth}×${origHeight}px. Laplacian focus variance measured at ${focusVariance}.`,
      startedAt: now(),
      endedAt: now(),
    },
    {
      stage: 'S1',
      name: 'Setup & Calibration Agent',
      outcome: 'warning',
      note: `Working scale of ${umPerPx} µm/px applied as an assumption; independent micrometer verification was not performed.`,
      startedAt: now(),
      endedAt: now(),
    },
    {
      stage: 'S2',
      name: 'Upload Integrity Agent',
      outcome: 'passed',
      note: `Cryptographic SHA-256 computed: ${sha256.slice(0, 16)}...`,
      startedAt: now(),
      endedAt: now(),
    },
    {
      stage: 'S3',
      name: 'Media Decode & Format Check',
      outcome: 'passed',
      note: 'Browser decoded the media successfully. No server-side malware scan was performed.',
      startedAt: now(),
      endedAt: now(),
    },
    {
      stage: 'S4',
      name: 'Frame Preparation & Normalization',
      outcome: 'passed',
      note: `Converted to luminance values and downscaled to ${width}×${height}px for deterministic analysis.`,
      startedAt: now(),
      endedAt: now(),
    },
    {
      stage: 'S5',
      name: 'Quality Gate Re-Check',
      outcome: clippedDarkPct <= 10 && clippedBrightPct <= 10 ? 'passed' : 'warning',
      note: `Measured dark clipping: ${clippedDarkPct}%; bright clipping: ${clippedBrightPct}%.`,
      startedAt: now(),
      endedAt: now(),
    },
    {
      stage: 'S6',
      name: 'Debris & Impurity Filtering',
      outcome: 'passed',
      note: 'Applied RGB background-difference thresholding; disconnected foreground components were excluded from measurement.',
      startedAt: now(),
      endedAt: now(),
    },
    {
      stage: 'S7',
      name: 'Cell Detection & Instance Mask',
      outcome: cellDetected ? 'passed' : 'warning',
      note: cellDetected
        ? `Largest cell-like foreground component isolated: ${cellPixels} pixels. Identity is not clinically verified.`
        : 'No eligible cell-like foreground component detected in this field. This does not establish absence of sperm.',
      startedAt: now(),
      endedAt: now(),
    },
    {
      stage: 'S8',
      name: 'Preliminary Shape Estimation',
      outcome: cellDetected ? 'passed' : 'warning',
      note: `Preliminary threshold-based shape category: ${cellDetected ? morphologyCategory : 'Unclassified'} (L/W ratio: ${lengthToWidthRatio || '—'}, Acrosome estimate: ${cellDetected ? acrosomeCoveragePct + '%' : '—'}). Not a clinical Kruger assessment.`,
      startedAt: now(),
      endedAt: now(),
    },
    {
      stage: 'S9',
      name: 'Midpiece & Flagellum Structural Trace',
      outcome: 'warning',
      note: 'Not assessed: a single thresholded 2D frame cannot reliably verify axial insertion or flagellar caliber.',
      startedAt: now(),
      endedAt: now(),
    },
    {
      stage: 'S10',
      name: 'Vitality & Membrane Integrity',
      outcome: 'warning',
      note: 'Vitality: Not measured (in-browser optical heuristic; clinical vitality requires eosin-nigrosin dye exclusion).',
      startedAt: now(),
      endedAt: now(),
    },
    {
      stage: 'S11',
      name: 'WHO 2021 Clinical Limits Rules Engine',
      outcome: 'warning',
      note: 'No clinical reference classification performed. This single-frame heuristic does not meet WHO 2021 semen-analysis requirements.',
      startedAt: now(),
      endedAt: now(),
    },
    {
      stage: 'S12',
      name: 'Guarded Image Report Synthesis',
      outcome: 'passed',
      note: `Image-derived report compiled. Shape: ${morphologyCategory}. Concentration, motility, vitality, midpiece, tail, and TZI are marked Not assessed.`,
      startedAt: now(),
      endedAt: now(),
    },
    {
      stage: 'S13',
      name: 'Secure Audit Vault & Lab Routing',
      outcome: 'passed',
      note: 'Image-derived measurements are ready for the local report. Formal diagnostic laboratory booking is available.',
      startedAt: now(),
      endedAt: now(),
    },
  ];

  return {
    width: origWidth,
    height: origHeight,
    sha256,
    focusVariance,
    clippedDarkPct,
    clippedBrightPct,
    cellDetected,
    morphologyCategory,
    acrosomeCoveragePct,
    headLengthUm,
    headWidthUm,
    lengthToWidthRatio,
    midpieceDefect,
    tailDefect,
    tziScore,
    stageLogs,
    annotatedPreviewDataUrl,
  };
}
