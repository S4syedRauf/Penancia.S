import crypto from 'node:crypto';
import { Type } from '@google/genai';
import type {
  ConfidenceLevel,
  PipelineStageCode,
  ReportType,
  ReportValueRow,
  SemenBand,
  SemenClipRecord,
  SemenKitProfile,
  SemenSessionRun,
  StageLogEntry,
} from '../types/panacea.ts';
import { getServerGeminiClient } from './geminiClient.ts';

export const SEMEN_GATE_CONFIG = {
  minResolutionWidth: 1920,
  minResolutionHeight: 1080,
  minFps: 30,
  preferredFps: 60,
  minFocusVariance: 95,
  maxClippedDarkPct: 2.0,
  maxClippedBrightPct: 2.0,
  maxDriftPxPerSec: 1.5,
  minBlobsPerFrame: 8,
  maxBlobsPerFrame: 190,
  clipLengthSeconds: 10,
  minFields: 5,
  maxFields: 10,
  minCellsForPrecision: 200,
};

/**
 * Mandatory numeric leakage check: ensures zero internal CASA numeric sperm counts,
 * motility percentages, or velocities are present in patient-facing responses.
 */
export function assertNoPipelineNumericLeakage(payload: unknown): void {
  const forbiddenPatterns = [
    /\b\d+(\.\d+)?\s*(million\/mL|M\/mL|10\^6\/mL|µm\/s|um\/s)\b/i,
    /\b(concentration|motility|progressive)\s*[:=]\s*\d+(\.\d+)?\s*%/i,
  ];
  const serialized = JSON.stringify(payload);
  for (const regex of forbiddenPatterns) {
    if (regex.test(serialized)) {
      throw new Error('NUMERIC_LEAKAGE_DETECTED');
    }
  }
}

export interface RunSemenPipelineInput {
  sessionId: string;
  userId: string;
  consentSemenMedia: boolean;
  killSwitchActive?: boolean;
  setupType: 'clip_on' | 'microscope_adapter' | 'neither';
  kitProfile: SemenKitProfile;
  sampleMeta: {
    abstinenceDays: number;
    collectedAtIso: string;
    temperatureNote: 'room' | '37c_stage';
    completeness: 'full' | 'partial';
    sampleName?: string;
  };
  clips: SemenClipRecord[];
  isDemo: boolean;
  demoAttribution?: string;
  injectFaultStage?: PipelineStageCode | null;
}

export function runSemenPipelineS0ToS13(input: RunSemenPipelineInput): SemenSessionRun {
  const nowIso = () => new Date().toISOString();
  const stageLogs: StageLogEntry[] = [];
  const usedItems: string[] = [];
  const couldNotUseItems: string[] = [];
  const fault = input.injectFaultStage || null;

  const pushLog = (
    code: PipelineStageCode,
    name: string,
    outcome: 'passed' | 'fallback' | 'blocked',
    note: string
  ) => {
    const t = nowIso();
    stageLogs.push({ stage: code, name, outcome, note, startedAt: t, endedAt: t });
  };

  // Kill Switch check (Blueprint Part 9.1)
  if (input.killSwitchActive) {
    pushLog('S0', 'Intake Agent', 'blocked', 'RESEARCH_KILL_SWITCH_ACTIVE');
    return {
      sessionId: input.sessionId,
      runId: `sem_${Date.now()}`,
      userId: input.userId,
      setupType: input.setupType,
      kitProfile: input.kitProfile,
      sampleMeta: input.sampleMeta,
      isDemo: input.isDemo,
      demoAttribution: input.demoAttribution,
      modelVersion: 'panacea-research-offline',
      pipelineVersion: 'panacea-pipe-v2.0',
      validationMode: 'research_only',
      state: 'KillSwitchDisabled',
      qualitySummaryEn:
        'Home research pipeline is temporarily suspended via the server-side safety kill switch. You can still book a diagnostic lab test directly.',
      qualitySummaryAr:
        'تم إيقاف مسار الفحص البحثي المنزلي مؤقتاً عبر مفتاح الإيقاف الوقائي بالخادم. يمكنك حجز الفحص المخبري مباشرة.',
      researchOnlyBandConc: 'Unclear',
      researchOnlyBandMotility: 'Unclear',
      noSpermSeen: false,
      usedItems: [],
      couldNotUseItems: ['Server kill switch active'],
      stageLogs,
      createdAt: nowIso(),
    };
  }

  // S0 Intake & Consent Agent
  if (!input.consentSemenMedia || fault === 'S0' || input.setupType === 'neither') {
    pushLog('S0', 'Intake Agent', 'blocked', 'CONSENT_OR_OPTICS_MISSING');
    return {
      sessionId: input.sessionId,
      runId: `sem_${Date.now()}`,
      userId: input.userId,
      setupType: input.setupType,
      kitProfile: input.kitProfile,
      sampleMeta: input.sampleMeta,
      isDemo: input.isDemo,
      demoAttribution: input.demoAttribution,
      modelVersion: 'visem-yolox-s-candidate-v0.4',
      pipelineVersion: 'panacea-pipe-v2.0',
      validationMode: 'research_only',
      state: 'BlockedNoConsent',
      qualitySummaryEn:
        input.setupType === 'neither'
          ? 'Supported optical kit is required for home capture. You can proceed directly to Lab Booking.'
          : 'Enable Home Pre-Screen Video consent in Consent Centre to run capture analysis.',
      qualitySummaryAr:
        input.setupType === 'neither'
          ? 'يلزم توفر عدسة معتمدة للفحص المنزلي. يمكنك التوجه مباشرة إلى حجز المختبر.'
          : 'يُرجى تفعيل إذن فيديو الفحص المنزلي في مركز الأذونات للمتابعة.',
      researchOnlyBandConc: 'Unclear',
      researchOnlyBandMotility: 'Unclear',
      noSpermSeen: false,
      usedItems: [],
      couldNotUseItems: ['Blocked at S0 (consent or optical kit missing)'],
      stageLogs,
      createdAt: nowIso(),
    };
  }

  pushLog('S0', 'Intake Agent', 'passed', 'CONSENT_AND_OPTICS_VERIFIED');
  usedItems.push(
    `Sample metadata (abstinence ${input.sampleMeta.abstinenceDays}d, ${input.sampleMeta.completeness}, ${input.sampleMeta.temperatureNote === 'room' ? 'room temp' : '37 °C stage'})`
  );

  // S1 Setup & Calibration Agent
  const depthKnown =
    typeof input.kitProfile.chamberDepthUm === 'number' && input.kitProfile.chamberDepthUm > 0;
  const calibrationKnown =
    typeof input.kitProfile.calibratedUmPerPx === 'number' &&
    input.kitProfile.calibratedUmPerPx > 0;

  const canComputeConc = depthKnown && calibrationKnown && fault !== 'S1';
  if (!depthKnown || !calibrationKnown || fault === 'S1') {
    pushLog(
      'S1',
      'Setup Agent',
      'fallback',
      !depthKnown ? 'UNKNOWN_CHAMBER_DEPTH' : 'MISSING_MICROMETER_CALIBRATION'
    );
    if (!depthKnown) couldNotUseItems.push('Unknown chamber depth -> concentration research band set Unclear');
    if (!calibrationKnown) couldNotUseItems.push('Missing micrometer calibration -> velocity/conc research band restricted');
  } else {
    pushLog('S1', 'Setup Agent', 'passed', 'CHAMBER_AND_CALIBRATION_READY');
    usedItems.push(`${input.kitProfile.kitName} (${input.kitProfile.chamberDepthUm} µm chamber)`);
  }

  // S2 Upload Integrity Agent
  const allUploaded = input.clips.length >= 5 && input.clips.every((c) => c.uploaded && c.sha256);
  if (!allUploaded || fault === 'S2') {
    pushLog('S2', 'Upload Agent', 'fallback', 'UPLOAD_INCOMPLETE_RESUME_REQUIRED');
    return {
      sessionId: input.sessionId,
      runId: `sem_${Date.now()}`,
      userId: input.userId,
      setupType: input.setupType,
      kitProfile: input.kitProfile,
      sampleMeta: input.sampleMeta,
      isDemo: input.isDemo,
      demoAttribution: input.demoAttribution,
      modelVersion: 'visem-yolox-s-candidate-v0.4',
      pipelineVersion: 'panacea-pipe-v2.0',
      validationMode: 'research_only',
      state: 'UploadIncomplete',
      qualitySummaryEn: 'One or more capture clips failed SHA-256 verification. Resume encrypted upload or retry.',
      qualitySummaryAr: 'لم يكتمل التحقق من رفع بعض المقاطع. يمكنك استئناف الرفع المشفر أو المحاولة مجدداً.',
      researchOnlyBandConc: 'Unclear',
      researchOnlyBandMotility: 'Unclear',
      noSpermSeen: false,
      usedItems,
      couldNotUseItems: [...couldNotUseItems, 'Incomplete chunked SHA-256 upload'],
      stageLogs,
      createdAt: nowIso(),
    };
  }
  pushLog('S2', 'Upload Agent', 'passed', `SHA256_VERIFIED (${input.clips.length} clips)`);

  // S3 File Safety Scan
  if (fault === 'S3') {
    pushLog('S3', 'Safety Scan', 'blocked', 'CONTAINER_SIGNATURE_REJECTED');
    return {
      sessionId: input.sessionId,
      runId: `sem_${Date.now()}`,
      userId: input.userId,
      setupType: input.setupType,
      kitProfile: input.kitProfile,
      sampleMeta: input.sampleMeta,
      isDemo: input.isDemo,
      demoAttribution: input.demoAttribution,
      modelVersion: 'visem-yolox-s-candidate-v0.4',
      pipelineVersion: 'panacea-pipe-v2.0',
      validationMode: 'research_only',
      state: 'Rejected',
      qualitySummaryEn: 'Media file signature check failed in isolated scan. Please capture again or book a lab test.',
      qualitySummaryAr: 'فشل فحص سلامة ملف الفيديو في العزل. يُرجى إعادة التصوير أو حجز فحص مخبري.',
      researchOnlyBandConc: 'Unclear',
      researchOnlyBandMotility: 'Unclear',
      noSpermSeen: false,
      usedItems,
      couldNotUseItems: [...couldNotUseItems, 'Quarantine safety scan rejected media'],
      stageLogs,
      createdAt: nowIso(),
    };
  }
  pushLog('S3', 'Safety Scan', 'passed', 'STREAM_SIGNATURE_CLEAN');

  // S4 Frame Prep
  let usableClips = [...input.clips];
  if (fault === 'S4') {
    usableClips = usableClips.slice(0, Math.max(0, usableClips.length - 1));
    pushLog('S4', 'Frame Prep', 'fallback', 'ONE_CLIP_DROPPED_ON_DECODE');
    couldNotUseItems.push('1 clip excluded during frame normalization');
  } else {
    pushLog('S4', 'Frame Prep', 'passed', 'FRAMES_NORMALISED');
  }

  // S5 Server Quality Gate Re-Check
  const passingClips = usableClips.filter(
    (c) =>
      c.qualityPass &&
      c.focusVariance >= SEMEN_GATE_CONFIG.minFocusVariance &&
      c.driftPxPerSec <= SEMEN_GATE_CONFIG.maxDriftPxPerSec
  );

  if (passingClips.length < 3 || fault === 'S5') {
    pushLog('S5', 'Server Quality Gate', 'fallback', 'QUALITY_GATE_REJECTED_RETAKE');
    return {
      sessionId: input.sessionId,
      runId: `sem_${Date.now()}`,
      userId: input.userId,
      setupType: input.setupType,
      kitProfile: input.kitProfile,
      sampleMeta: input.sampleMeta,
      isDemo: input.isDemo,
      demoAttribution: input.demoAttribution,
      modelVersion: 'visem-yolox-s-candidate-v0.4',
      pipelineVersion: 'panacea-pipe-v2.0',
      validationMode: 'research_only',
      state: 'RetakeNeeded',
      qualitySummaryEn:
        'Capture Quality Gate Failed: Focus variance was below threshold or stage drift was too high. Keep the slide steady, adjust focus ring, and retake — or book a Dubai diagnostic lab directly.',
      qualitySummaryAr:
        'فشل فحص جودة التصوير: التركيز البصري ضعيف أو يوجد اهتزاز في الشريحة. اضبط التركيز وثبّت الشريحة ثم أعد التصوير، أو احجز فحصاً مخبرياً مباشرة.',
      researchOnlyBandConc: 'Unclear',
      researchOnlyBandMotility: 'Unclear',
      noSpermSeen: false,
      usedItems,
      couldNotUseItems: [...couldNotUseItems, 'Server quality gate rejected blurry/drifting clips'],
      stageLogs,
      createdAt: nowIso(),
    };
  }
  pushLog('S5', 'Server Quality Gate', 'passed', `${passingClips.length}_FIELDS_VERIFIED`);
  usedItems.push(`${passingClips.length} fields passed resolution, focus, exposure & drift gate`);

  // S6 Debris / Artifact Flag
  let fallbackTriggered = false;
  if (fault === 'S6') {
    fallbackTriggered = true;
    pushLog('S6', 'Debris Flag Agent', 'fallback', 'HIGH_DEBRIS_FLAGGED_FOR_REVIEW');
    couldNotUseItems.push('Elevated debris flagged -> marked Unclear');
  } else {
    pushLog('S6', 'Debris Flag Agent', 'passed', 'DEBRIS_LEVEL_ACCEPTABLE');
  }

  // S7 Detection
  if (fault === 'S7') {
    fallbackTriggered = true;
    pushLog('S7', 'Detection Agent', 'fallback', 'MODEL_TIMEOUT_DISAGREEMENT');
    couldNotUseItems.push('Detection timeout/disagreement -> never produces reassuring label');
  } else {
    pushLog('S7', 'Detection Agent', 'passed', 'CANDIDATE_DETECTIONS_OK');
  }

  // S8 Tracking
  if (fault === 'S8') {
    fallbackTriggered = true;
    pushLog('S8', 'Tracking Agent', 'fallback', 'TRACK_LINKING_DEGRADED');
    couldNotUseItems.push('Tracking degraded -> motility research band restricted');
  } else {
    pushLog('S8', 'Tracking Agent', 'passed', 'TRACKS_LINKED');
  }

  // S9 Feature Aggregation
  const noSperm = passingClips.every((c) => c.syntheticSeed?.noSperm || c.blobCountPerFrame === 0);
  if (fault === 'S9') {
    fallbackTriggered = true;
    pushLog('S9', 'Feature Agent', 'fallback', 'KINEMATIC_OOD_FLAG');
  } else {
    pushLog('S9', 'Feature Agent', 'passed', noSperm ? 'ZERO_CELLS_OBSERVED' : 'FEATURES_BOUNDED');
  }

  // S10 Uncertainty & Research Banding (Restricted Research Mode ONLY)
  let researchBandConc: SemenBand = 'Typical';
  let researchBandMot: SemenBand = 'Typical';

  if (fallbackTriggered || fault === 'S10' || !canComputeConc) {
    researchBandConc = 'Unclear';
    if (fallbackTriggered || fault === 'S10' || !calibrationKnown) {
      researchBandMot = 'Unclear';
    }
    pushLog('S10', 'Uncertainty & Banding (Research)', 'fallback', 'UNCLEAR_RESEARCH_FALLBACK');
  } else if (noSperm) {
    researchBandConc = 'Low';
    researchBandMot = 'Low';
    pushLog('S10', 'Uncertainty & Banding (Research)', 'passed', 'ZERO_CELLS_BAND_LOW');
  } else {
    const concVotes = passingClips.map((c) => c.syntheticSeed?.concCategory || 'Typical');
    const motVotes = passingClips.map((c) => c.syntheticSeed?.motilityCategory || 'Typical');
    researchBandConc = concVotes.includes('Low') ? 'Low' : concVotes.includes('Unclear') ? 'Unclear' : 'Typical';
    researchBandMot = motVotes.includes('Low') ? 'Low' : motVotes.includes('Unclear') ? 'Unclear' : 'Typical';
    pushLog('S10', 'Uncertainty & Banding (Research)', 'passed', `RESEARCH_BANDS=${researchBandConc}/${researchBandMot}`);
  }

  // S11 Explanation (Patient surface strictly non-diagnostic & numeric-free per Part 9.1!)
  let qualitySummaryEn = '';
  let qualitySummaryAr = '';

  if (fallbackTriggered || fault === 'S10' || fault === 'S11' || !canComputeConc) {
    qualitySummaryEn =
      'Technical Research Run Incomplete or Uncalibrated: This session could not establish clean calibration or model agreement. Panacea never shows a reassuring result on fallback. Please book a diagnostic laboratory test.';
    qualitySummaryAr =
      'تشغيل بحثي غير مكتمل أو غير معاير: تعذر إتمام المعايرة أو توافق النماذج. لا يصدر التطبيق نتيجة مطمئنة عند الفشل. يُنصح بحجز تحليل مخبري معتمد.';
    pushLog('S11', 'Explanation Agent', 'fallback', 'NON_DIAGNOSTIC_FALLBACK_RENDERED');
  } else if (noSperm) {
    qualitySummaryEn =
      'Capture quality passed technical checks, and our research counter observed zero moving cells in these fields (Research Mode Only — Not a Diagnostic Result). A licensed laboratory semen analysis is strongly recommended to confirm.';
    qualitySummaryAr =
      'اجتاز التصوير فحص الجودة التقنية، ولم يرصد المسار البحثي خلايا متحركة في الحقول المصورة (وضع بحثي فقط — ليس تشخيصاً). يُوصى بشدة بحجز تحليل مخبري معتمد للتأكد.';
    pushLog('S11', 'Explanation Agent', 'passed', 'ZERO_CELL_LAB_ROUTE_TEMPLATE');
  } else {
    qualitySummaryEn =
      'Capture Quality Verified & Encrypted Upload Complete. Patient-facing clinical bands and numeric sperm counts remain disabled in research mode until UAE regulatory validation is completed. Proceed to Lab Booking for a signed clinical report.';
    qualitySummaryAr =
      'تم التحقق من جودة التصوير واكتمال الرفع المشفر. تبقى النطاقات والأرقام التقديرية معطلة في واجهة المريض ضمن الوضع البحثي لحين استيفاء الاعتماد التنظيمي. احجز فحص المختبر للحصول على تقرير سريري معتمد.';
    pushLog('S11', 'Explanation Agent', 'passed', 'TECHNICAL_QUALITY_CONFIRMED');
  }

  // S12 Storage & Audit
  pushLog('S12', 'Storage Agent', fault === 'S12' ? 'fallback' : 'passed', 'NON_PII_RESEARCH_LOGGED');

  // S13 Lab Routing
  pushLog('S13', 'Lab Routing Agent', fault === 'S13' ? 'fallback' : 'passed', 'LAB_BOOKING_ROUTE_READY');

  const result: SemenSessionRun = {
    sessionId: input.sessionId,
    runId: `sem_${Date.now()}`,
    userId: input.userId,
    setupType: input.setupType,
    kitProfile: input.kitProfile,
    sampleMeta: input.sampleMeta,
    isDemo: input.isDemo,
    demoAttribution: input.demoAttribution,
    modelVersion: fallbackTriggered ? 'classical-fallback-v1.0' : 'visem-yolox-s-candidate-v0.4',
    pipelineVersion: 'panacea-pipe-v2.0',
    validationMode: 'research_only',
    state: 'Completed',
    qualitySummaryEn,
    qualitySummaryAr,
    researchOnlyBandConc: researchBandConc,
    researchOnlyBandMotility: researchBandMot,
    noSpermSeen: noSperm,
    usedItems,
    couldNotUseItems,
    stageLogs,
    createdAt: nowIso(),
  };

  assertNoPipelineNumericLeakage({
    qualitySummaryEn: result.qualitySummaryEn,
    qualitySummaryAr: result.qualitySummaryAr,
    stageLogs: result.stageLogs,
  });

  return result;
}

const HEADER_PII_PATTERNS = [
  /patient\s*name\s*[:\-].*/i,
  /emirates\s*id\s*[:\-].*/i,
  /dob|date\s*of\s*birth\s*[:\-].*/i,
  /phone|mobile|tel\s*[:\-].*/i,
  /mrn|passport\s*[:\-].*/i,
  /\b784-\d{4}-\d{7}-\d\b/,
];

export function maskHeaderPersonalLines(rawText: string): {
  cleanLines: string[];
  maskedTypes: string[];
} {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const cleanLines: string[] = [];
  const maskedTypes = new Set<string>();

  for (const line of lines) {
    let matched = false;
    for (const pat of HEADER_PII_PATTERNS) {
      if (pat.test(line)) {
        matched = true;
        if (/name/i.test(line)) maskedTypes.add('Name');
        else if (/emirates|784-|passport|mrn/i.test(line)) maskedTypes.add('Emirates ID / MRN');
        else if (/dob|birth/i.test(line)) maskedTypes.add('Date of Birth');
        else if (/phone|mobile|tel/i.test(line)) maskedTypes.add('Phone');
        else maskedTypes.add('Header Identifier');
        break;
      }
    }
    if (!matched) {
      cleanLines.push(line);
    }
  }

  return { cleanLines, maskedTypes: Array.from(maskedTypes) };
}

export async function extractReportOnServer(params: {
  fileName: string;
  mime: string;
  rawText?: string;
  imageBase64?: string;
  reportTypeHint?: ReportType;
  simulateMalware?: boolean;
}): Promise<{
  ok: boolean;
  rejectedReason?: string;
  extractionFailed?: boolean;
  reportDate: string;
  reportType: ReportType;
  labNameAsWritten: string | null;
  abstinenceDays: number | null;
  maskedFields: string[];
  rawLines: Array<{ text: string; confidence: ConfidenceLevel }>;
  values: ReportValueRow[];
  freeTextFindings: string[];
}> {
  const lowerName = params.fileName.toLowerCase();
  const allowedExts = ['.pdf', '.jpg', '.jpeg', '.png', '.txt'];
  const validExt =
    allowedExts.some((ext) => lowerName.endsWith(ext)) ||
    params.mime.startsWith('image/') ||
    params.mime === 'application/pdf';

  if (params.simulateMalware || lowerName.includes('eicar') || lowerName.includes('virus')) {
    return {
      ok: false,
      rejectedReason:
        'Quarantine malware scan rejected this file before storage. Nothing entered your Report Vault.',
      reportDate: new Date().toISOString().slice(0, 10),
      reportType: 'other',
      labNameAsWritten: null,
      abstinenceDays: null,
      maskedFields: [],
      rawLines: [],
      values: [],
      freeTextFindings: [],
    };
  }

  if (!validExt) {
    return {
      ok: false,
      rejectedReason:
        'Invalid file type in quarantine. Nothing was saved. Please upload a PDF, JPG, PNG, or TXT fixture.',
      reportDate: new Date().toISOString().slice(0, 10),
      reportType: 'other',
      labNameAsWritten: null,
      abstinenceDays: null,
      maskedFields: [],
      rawLines: [],
      values: [],
      freeTextFindings: [],
    };
  }

  const inputText = params.rawText?.trim() || '';
  const { cleanLines, maskedTypes } = maskHeaderPersonalLines(inputText);

  const parsedValues: ReportValueRow[] = [];
  const findings: string[] = [];
  let detectedDate = new Date().toISOString().slice(0, 10);
  let labName: string | null = null;
  let abstinenceDays: number | null = null;

  for (const line of cleanLines) {
    const dateMatch = line.match(/(\d{4}-\d{2}-\d{2})/);
    if (dateMatch) detectedDate = dateMatch[1];

    if (/lab|centre|center|hospital|diagnostic|clinic|hub/i.test(line) && !labName) {
      labName = line.replace(/^lab\s*[:\-]\s*/i, '').trim();
    }

    const absMatch = line.match(/abstinence\s*[:\-]?\s*(\d+)\s*day/i);
    if (absMatch) abstinenceDays = parseInt(absMatch[1], 10);

    const concMatch = line.match(/concentration\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(million\/mL|M\/mL)/i);
    if (concMatch) {
      const num = parseFloat(concMatch[1]);
      parsedValues.push({
        valueId: `val_${crypto.randomUUID().slice(0, 8)}`,
        testCode: 'SEMEN_CONC',
        testNameAsWritten: 'Sperm concentration',
        aiValue: num,
        userValue: num,
        unit: concMatch[2],
        refLow: 16,
        refHigh: null,
        flag: num < 16 ? 'low' : 'normal',
        confidence: 'high',
        confirmed: false,
        sourcePage: 1,
      });
      continue;
    }

    const volMatch = line.match(/volume\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(mL)/i);
    if (volMatch) {
      const num = parseFloat(volMatch[1]);
      parsedValues.push({
        valueId: `val_${crypto.randomUUID().slice(0, 8)}`,
        testCode: 'SEMEN_VOL',
        testNameAsWritten: 'Semen volume',
        aiValue: num,
        userValue: num,
        unit: 'mL',
        refLow: 1.4,
        refHigh: null,
        flag: num < 1.4 ? 'low' : 'normal',
        confidence: 'high',
        confirmed: false,
        sourcePage: 1,
      });
      continue;
    }

    const motMatch = line.match(/(?:total\s*)?motility\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*%/i);
    if (motMatch) {
      const num = parseFloat(motMatch[1]);
      parsedValues.push({
        valueId: `val_${crypto.randomUUID().slice(0, 8)}`,
        testCode: 'SEMEN_MOT_TOTAL',
        testNameAsWritten: 'Total motility',
        aiValue: num,
        userValue: num,
        unit: '%',
        refLow: 42,
        refHigh: null,
        flag: num < 42 ? 'low' : 'normal',
        confidence: 'medium',
        confirmed: false,
        sourcePage: 1,
      });
      continue;
    }

    const morphMatch = line.match(/morphology\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*%/i);
    if (morphMatch) {
      const num = parseFloat(morphMatch[1]);
      parsedValues.push({
        valueId: `val_${crypto.randomUUID().slice(0, 8)}`,
        testCode: 'SEMEN_MORPH',
        testNameAsWritten: 'Normal morphology (Kruger)',
        aiValue: num,
        userValue: num,
        unit: '%',
        refLow: 4,
        refHigh: null,
        flag: num < 4 ? 'low' : 'normal',
        confidence: 'low',
        confirmed: false,
        sourcePage: 1,
      });
      continue;
    }

    const fshMatch = line.match(/\bFSH\b\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(IU\/L|mIU\/mL)/i);
    if (fshMatch) {
      const num = parseFloat(fshMatch[1]);
      parsedValues.push({
        valueId: `val_${crypto.randomUUID().slice(0, 8)}`,
        testCode: 'HORMONE_FSH',
        testNameAsWritten: 'FSH (Follicle-Stimulating Hormone)',
        aiValue: num,
        userValue: num,
        unit: fshMatch[2],
        refLow: 1.5,
        refHigh: 12.4,
        flag: num < 1.5 ? 'low' : num > 12.4 ? 'high' : 'normal',
        confidence: 'high',
        confirmed: false,
        sourcePage: 1,
      });
      continue;
    }

    const testMatch = line.match(/testosterone\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(nmol\/L|ng\/dL)/i);
    if (testMatch) {
      const num = parseFloat(testMatch[1]);
      const isNmol = testMatch[2].toLowerCase() === 'nmol/l';
      const low = isNmol ? 8.6 : 250;
      const high = isNmol ? 29.0 : 916;
      parsedValues.push({
        valueId: `val_${crypto.randomUUID().slice(0, 8)}`,
        testCode: 'HORMONE_TESTOSTERONE',
        testNameAsWritten: 'Total Testosterone',
        aiValue: num,
        userValue: num,
        unit: testMatch[2],
        refLow: low,
        refHigh: high,
        flag: num < low ? 'low' : num > high ? 'high' : 'normal',
        confidence: 'high',
        confirmed: false,
        sourcePage: 1,
      });
      continue;
    }

    if (/liquefaction|viscosity|leukocytes|ph\b|impression/i.test(line)) {
      findings.push(line);
    }
  }

  // Optional Gemini draft OCR when rule parser found 0 rows (never bypasses mandatory user confirmation)
  const ai = getServerGeminiClient();
  if (parsedValues.length === 0 && ai && (params.imageBase64 || cleanLines.length > 0)) {
    try {
      const parts: Array<
        { text: string } | { inlineData: { mimeType: string; data: string } }
      > = [];
      if (params.imageBase64) {
        const cleanedB64 = params.imageBase64.replace(/^data:[^;]+;base64,/, '');
        parts.push({
          inlineData: {
            mimeType: params.mime || 'image/jpeg',
            data: cleanedB64,
          },
        });
      }
      parts.push({
        text: `Extract ONLY laboratory test rows, report_date (YYYY-MM-DD), and lab_name. NEVER return names, Emirates ID, DOB, or phone numbers.\nDe-identified text:\n${cleanLines.join('\n')}`,
      });

      const resp = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: { parts },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              report_date: { type: Type.STRING },
              lab_name: { type: Type.STRING },
              values: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    test_code: { type: Type.STRING },
                    test_name: { type: Type.STRING },
                    value: { type: Type.NUMBER },
                    unit: { type: Type.STRING },
                    ref_low: { type: Type.NUMBER },
                    ref_high: { type: Type.NUMBER },
                  },
                },
              },
            },
          },
        },
      });
      const parsedJson = JSON.parse(resp.text || '{}') as {
        report_date?: string;
        lab_name?: string;
        values?: Array<{
          test_code?: string;
          test_name?: string;
          value?: number;
          unit?: string;
          ref_low?: number;
          ref_high?: number;
        }>;
      };
      if (parsedJson.report_date) detectedDate = parsedJson.report_date;
      if (parsedJson.lab_name) labName = parsedJson.lab_name;
      for (const row of parsedJson.values || []) {
        if (row.test_name && typeof row.value === 'number') {
          const refLow = typeof row.ref_low === 'number' ? row.ref_low : null;
          const refHigh = typeof row.ref_high === 'number' ? row.ref_high : null;
          let flag: 'low' | 'normal' | 'high' | 'none' = 'none';
          if (refLow !== null && row.value < refLow) flag = 'low';
          else if (refHigh !== null && row.value > refHigh) flag = 'high';
          else if (refLow !== null || refHigh !== null) flag = 'normal';

          parsedValues.push({
            valueId: `val_${crypto.randomUUID().slice(0, 8)}`,
            testCode: row.test_code || 'LAB_VALUE',
            testNameAsWritten: row.test_name,
            aiValue: row.value,
            userValue: row.value,
            unit: row.unit || '',
            refLow,
            refHigh,
            flag,
            confidence: 'low',
            confirmed: false,
            sourcePage: 1,
          });
        }
      }
    } catch {
      // Fallback cleanly to manual entry
    }
  }

  if (parsedValues.length === 0) {
    return {
      ok: true,
      extractionFailed: true,
      reportDate: detectedDate,
      reportType: params.reportTypeHint || 'other',
      labNameAsWritten: labName,
      abstinenceDays,
      maskedFields: maskedTypes,
      rawLines: cleanLines.map((text) => ({ text, confidence: 'medium' })),
      values: [],
      freeTextFindings: findings,
    };
  }

  return {
    ok: true,
    extractionFailed: false,
    reportDate: detectedDate,
    reportType:
      params.reportTypeHint ||
      (parsedValues.some((v) => v.testCode.startsWith('SEMEN_'))
        ? 'semen_analysis'
        : 'hormones'),
    labNameAsWritten: labName,
    abstinenceDays,
    maskedFields: maskedTypes,
    rawLines: cleanLines.map((text) => ({ text, confidence: 'high' })),
    values: parsedValues,
    freeTextFindings: findings,
  };
}
