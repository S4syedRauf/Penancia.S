import assert from 'node:assert/strict';
import test from 'node:test';
import type { SemenSessionRun } from '../types/panacea';
import type { ImageAnalysisResult } from './spermImageAnalyzer';
import { buildSemenReport, generateSemenReportHtml, getSemenReportFileName } from './semenReport';

const analysis: ImageAnalysisResult = {
  width: 1600,
  height: 1200,
  sha256: 'abc123def456',
  focusVariance: 187.42,
  clippedDarkPct: 1.25,
  clippedBrightPct: 0.5,
  cellDetected: true,
  morphologyCategory: 'Tapered',
  acrosomeCoveragePct: 52,
  headLengthUm: 5.4,
  headWidthUm: 2.7,
  lengthToWidthRatio: 2,
  midpieceDefect: null,
  tailDefect: null,
  tziScore: null,
  stageLogs: [],
  annotatedPreviewDataUrl: 'data:image/jpeg;base64,preview',
};

const run: SemenSessionRun = {
  sessionId: 'session-image-001',
  runId: 'run-image-001',
  userId: 'private-user',
  setupType: 'clip_on',
  kitProfile: {
    kitId: 'basic',
    kitName: 'Basic Kit',
    type: 'clip_on',
    chamberDepthUm: null,
    calibratedUmPerPx: 0.05,
    magnification: '100×',
    fieldWidthUmDefault: 420,
  },
  sampleMeta: {
    abstinenceDays: 3,
    collectedAtIso: '2026-11-21T10:00:00.000Z',
    temperatureNote: '37c_stage',
    completeness: 'full',
    sampleName: 'patient-upload.jpg',
  },
  isDemo: false,
  modelVersion: 'image-heuristic-v2',
  pipelineVersion: 'image-report-v2',
  validationMode: 'research_only',
  state: 'Completed',
  qualitySummaryEn: 'Image-derived summary',
  qualitySummaryAr: 'ملخص الصورة',
  researchOnlyBandConc: 'Unclear',
  researchOnlyBandMotility: 'Unclear',
  noSpermSeen: false,
  usedItems: [],
  couldNotUseItems: [],
  stageLogs: [],
  createdAt: '2026-11-21T10:05:00.000Z',
};

test('report uses measurements from the supplied image and never substitutes predefined bands', () => {
  const report = buildSemenReport(run, analysis, 'en');

  assert.equal(report.source.fileName, 'patient-upload.jpg');
  assert.equal(report.source.sha256, 'abc123def456');
  // When ENABLE_HEURISTIC_MORPHOLOGY and DEMO_MODE are false, heuristic fields show "Not available in this mode"
  assert.equal(report.candidate.morphology, 'Not available in this mode');
  assert.equal(report.candidate.headLength, 'Not measured');
  assert.equal(report.candidate.headWidth, 'Not measured');
  assert.equal(report.candidate.lengthToWidthRatio, 'Not measured');
  assert.equal(report.candidate.acrosomeCoverage, 'Not measured');
  assert.equal(report.capture.focusVariance, '187.42');
  assert.equal(report.capture.darkClipping, '1.25%');
  assert.equal(report.notAssessed.concentration, 'Not assessed');
  assert.equal(report.notAssessed.motility, 'Not assessed');
  assert.equal(report.notAssessed.vitality, 'Not assessed');

  const html = generateSemenReportHtml(report);
  // HTML should not contain heuristic values when flags are false
  assert.doesNotMatch(html, /Tapered/);
  assert.match(html, /187\.42/);
  assert.doesNotMatch(html, /Typical|researchOnlyBand|0\.8 TZI/);
  assert.match(html, /data:image\/jpeg;base64,preview/);
});

test('no candidate produces an honest no-measurement report', () => {
  const noCandidate = {
    ...analysis,
    cellDetected: false,
    morphologyCategory: 'Unclassified' as const,
    acrosomeCoveragePct: 0,
    headLengthUm: 0,
    headWidthUm: 0,
    lengthToWidthRatio: 0,
  };
  const report = buildSemenReport({ ...run, noSpermSeen: true }, noCandidate, 'en');

  assert.equal(report.candidate.status, 'No eligible cell-like structure detected');
  // When ENABLE_HEURISTIC_MORPHOLOGY and DEMO_MODE are false, heuristic fields show "Not available in this mode"
  assert.equal(report.candidate.morphology, 'Not available in this mode');
  assert.equal(report.candidate.headLength, 'Not measured');
  assert.equal(report.candidate.acrosomeCoverage, 'Not measured');
  assert.match(generateSemenReportHtml(report), /No eligible cell-like structure detected/);
});

test('download HTML escapes source metadata and uses a safe unique file name', () => {
  const unsafeRun = {
    ...run,
    runId: 'run/<unsafe>',
    sampleMeta: { ...run.sampleMeta, sampleName: '<img src=x onerror=alert(1)>.jpg' },
  };
  const report = buildSemenReport(unsafeRun, analysis, 'en');
  const html = generateSemenReportHtml(report);

  assert.doesNotMatch(html, /<img src=x onerror/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;\.jpg/);
  assert.match(getSemenReportFileName(report), /^panacea-image-report-run_unsafe_2026-11-21\.html$/);
});

test('fixture runs are explicitly identified as demonstrations', () => {
  const report = buildSemenReport({ ...run, isDemo: true }, analysis, 'en');
  assert.equal(report.source.kind, 'Demonstration fixture');
  assert.match(generateSemenReportHtml(report), /not a patient result/i);
});

test('report builders contain no heuristic fields when both flags are false', () => {
  const report = buildSemenReport(run, analysis, 'en');
  const html = generateSemenReportHtml(report);
  
  // Check that heuristic fields are not shown as measured values
  assert.doesNotMatch(html, /Estimated head length: \d/);
  assert.doesNotMatch(html, /Estimated head width: \d/);
  assert.doesNotMatch(html, /Length\/width: \d/);
  assert.doesNotMatch(html, /Acrosome coverage: \d/);
  assert.doesNotMatch(html, /Pyriform/);
  
  // Check that "Not measured" or "Not available" is shown instead
  assert.match(html, /Not measured|Not available/);
});
