export type Language = 'en' | 'ar';

export type MainScreenTab =
  | 'home'
  | 'questionnaire'
  | 'semen'
  | 'reports'
  | 'plan'
  | 'ask'
  | 'wearables'
  | 'care'
  | 'settings';

export type ConsentKey =
  | 'app_data'
  | 'reports_store'
  | 'reports_ai'
  | 'semen_media'
  | 'wearable_read'
  | 'share_clinic'
  | 'research'
  | 'noon_assist';

export interface ConsentRecord {
  key: ConsentKey;
  version: string;
  state: boolean;
  changedAt: string;
}

export interface SahatnaUser {
  userId: string;
  username: string;
  language: Language;
  timeZone: string;
  recoveryEmail?: string;
  recoveryPhone?: string;
  createdAt: string;
  deletedAt?: string | null;
}

export type QuestionStatus = 'answered' | 'prefer_not_to_say' | 'not_sure' | 'not_answered';

export interface QuestionOption {
  value: string;
  labelEn: string;
  labelAr: string;
}

export interface QuestionnaireQuestion {
  id: string;
  blockNumber: 1 | 2 | 3 | 4 | 5;
  blockTitleEn: string;
  blockTitleAr: string;
  textEn: string;
  textAr: string;
  helperEn?: string;
  helperAr?: string;
  answerType: 'single' | 'multi';
  urgentIfYes?: boolean;
  options: QuestionOption[];
}

export interface QuestionnaireResponseRow {
  responseId: string;
  userId: string;
  definitionVersion: string;
  questionId: string;
  answerJson: string | string[] | null;
  status: QuestionStatus;
  answeredAt: string;
}

export type ScreeningColour = 'green' | 'yellow' | 'red';
export type ScreeningUrgency = 'Routine' | 'Timely' | 'Urgent';

export interface ScreeningRun {
  runId: string;
  userId: string;
  ruleVersion: string;
  colour: ScreeningColour;
  urgency: ScreeningUrgency;
  reasonEn: string;
  reasonAr: string;
  reasonCodes: string[];
  used: string[];
  missing: string[];
  nextActionEn: string;
  nextActionAr: string;
  nextActionRoute: MainScreenTab;
  urgentTriggered: boolean;
  createdAt: string;
}

// Report Vault (Part 5)
export type ReportState =
  | 'Created'
  | 'Receiving'
  | 'Quarantined'
  | 'Scanning'
  | 'Extracting'
  | 'NeedsUserReview'
  | 'Confirmed'
  | 'Summarised'
  | 'Rejected'
  | 'ExtractionFailed';

export type ReportType = 'semen_analysis' | 'hormones' | 'blood_count' | 'urine' | 'scan' | 'other';
export type PrivacyMode = 'full' | 'folded' | 'unknown';
export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface ReportValueRow {
  valueId: string;
  testCode: string;
  testNameAsWritten: string;
  aiValue: string | number | null;
  userValue: string | number | null;
  unit: string;
  refLow: number | null;
  refHigh: number | null;
  flag: 'low' | 'normal' | 'high' | 'none';
  confidence: ConfidenceLevel;
  confirmed: boolean;
  sourcePage: number;
}

export interface ReportSummaryV1 {
  schema_version: 1;
  doc_id: string;
  report_date: string;
  report_type: ReportType;
  lab_name_as_written: string | null;
  abstinence_days: number | null;
  values: Array<{
    test_code: string;
    test_name_as_written: string;
    value: string | number | null;
    unit: string;
    ref_low: number | null;
    ref_high: number | null;
    flag: 'low' | 'normal' | 'high' | 'none';
    confirmed_by_user: boolean;
    source_page: number;
  }>;
  free_text_findings: string[];
  not_found: string[];
  plain_text_summary: string;
}

export interface VaultReport {
  docId: string;
  userId: string;
  fileName: string;
  mime: string;
  privacyMode: PrivacyMode;
  state: ReportState;
  stateMessage: string;
  originalPreviewDataUrl?: string;
  maskedPreviewDataUrl?: string;
  extractionJson: {
    engineVersion: string;
    headerMaskedFields: string[];
    rawLines: Array<{ text: string; confidence: ConfidenceLevel }>;
  };
  values: ReportValueRow[];
  summary: ReportSummaryV1 | null;
  summaryVersion: number;
  createdAt: string;
  confirmedAt: string | null;
}

// Home Semen Pre-Screen (Part 6)
export type SemenSetupType = 'clip_on' | 'microscope_adapter' | 'neither';
export type SemenBand = 'Low' | 'Typical' | 'Unclear';

export interface SemenKitProfile {
  kitId: string;
  kitName: string;
  type: 'clip_on' | 'microscope_adapter';
  magnification: string;
  chamberDepthUm: number | null;
  fieldWidthUmDefault: number;
  objective?: '20x' | '40x';
  illumination?: 'bright-field' | 'phase-contrast';
  calibratedUmPerPx?: number | null;
  calibratedAt?: string | null;
}

export interface SemenClipRecord {
  clipId: string;
  fieldIndex: number;
  durationS: number;
  fps: number;
  width: number;
  height: number;
  focusVariance: number;
  clippedDarkPct: number;
  clippedBrightPct: number;
  driftPxPerSec: number;
  blobCountPerFrame: number;
  uploadProgress: number; // 0..100
  uploaded: boolean;
  sha256: string;
  qualityPass: boolean;
  syntheticSeed?: {
    concCategory: SemenBand;
    motilityCategory: SemenBand;
    noSperm?: boolean;
  };
}

export type PipelineStageCode =
  | 'S0'
  | 'S1'
  | 'S2'
  | 'S3'
  | 'S4'
  | 'S5'
  | 'S6'
  | 'S7'
  | 'S8'
  | 'S9'
  | 'S10'
  | 'S11'
  | 'S12'
  | 'S13';

export interface StageLogEntry {
  stage: PipelineStageCode;
  name: string;
  outcome: 'passed' | 'fallback' | 'blocked';
  note: string;
  startedAt: string;
  endedAt: string;
}

export interface SemenSessionRun {
  sessionId: string;
  runId: string;
  userId: string;
  setupType: SemenSetupType;
  kitProfile: SemenKitProfile;
  sampleMeta: {
    abstinenceDays: number;
    collectedAtIso: string;
    temperatureNote: 'room' | '37c_stage';
    sampleName?: string;
  };
  isDemo: boolean;
  demoAttribution?: string;
  modelVersion: string;
  pipelineVersion: string;
  validationMode: 'prototype' | 'validated';
  state: 'Completed' | 'BlockedNoConsent' | 'UploadIncomplete' | 'Rejected' | 'RetakeNeeded';
  bandConc: SemenBand;
  concReasonEn: string;
  concReasonAr: string;
  bandMotility: SemenBand;
  motilityReasonEn: string;
  motilityReasonAr: string;
  overallColour: ScreeningColour;
  noSpermSeen: boolean;
  explanationEn: string;
  explanationAr: string;
  usedItems: string[];
  couldNotUseItems: string[];
  stageLogs: StageLogEntry[];
  createdAt: string;
}

export interface RetestReminder {
  reminderId: string;
  labelNeutral: string; // e.g. "Your check-in is ready" (no health words!)
  dueDate: string;
  reasonType: 'home_repeat_1_2w' | 'routine_3m' | 'lab_followup';
  createdAt: string;
}

// 74-Day Plan (F9)
export interface PlanActionItem {
  templateCode: string;
  titleEn: string;
  titleAr: string;
  detailEn: string;
  detailAr: string;
  category: 'sleep' | 'nutrition' | 'heat' | 'movement' | 'stress';
}

export interface PlanCompletionMap {
  // keyed by `${localDate}::${templateCode}`
  [key: string]: 'done' | 'skipped';
}

// Nutrition & Noon (F10)
export interface FoodCatalogItem {
  id: string;
  nameEn: string;
  nameAr: string;
  categoryEn: string;
  categoryAr: string;
  reasonEn: string;
  reasonAr: string;
  allergyTags: string[];
  noonUrl?: string;
  verifiedOn?: string;
}

export interface NoonListItem {
  id: string;
  nameEn: string;
  nameAr: string;
  searchUrlEn: string;
  searchUrlAr: string;
  directUrl?: string;
}

// Wearables (F11)
export interface WearableDailyMetric {
  localDate: string;
  sleepHours: number | null;
  sleepMidpoint: string | null;
  restingHrBpm: number | null;
  hrvRmssdMs: number | null;
  steps: number | null;
  source: 'Apple HealthKit' | 'Android Health Connect' | 'Manual Demo Sync';
}

// Ask Agent (F12)
export interface AskActionButton {
  code: string;
  labelEn: string;
  labelAr: string;
  route: MainScreenTab;
}

export interface AskMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  sourceLabels?: string[];
  buttons?: AskActionButton[];
  urgentAlert?: boolean;
  modeUsed?: 'Full' | 'TemplatesOnly' | 'Off';
  createdAt: string;
}

// Care Directory & Share Grants (F13)
export interface CareProvider {
  id: string;
  nameEn: string;
  nameAr: string;
  emirate: 'Dubai' | 'Abu Dhabi' | 'Sharjah';
  type: 'Diagnostic Lab' | 'Urology & Andrology Clinic' | 'Hospital Centre';
  servicesEn: string[];
  phone: string;
  addressEn: string;
  addressAr: string;
  notesEn: string;
}

export interface ShareGrant {
  grantId: string;
  providerId: string;
  providerName: string;
  scope: string[];
  expiresAt: string;
  revoked: boolean;
  createdAt: string;
  shareCode: string;
}

// Admin & Feature Flags (F17)
export interface FeatureFlags {
  askLlmMode: 'Full' | 'TemplatesOnly' | 'Off';
  semenModuleEnabled: boolean;
  semenValidationMode: 'prototype' | 'validated';
  demoModeEnabled: boolean;
  noonAssistMode: 'links_only'; // partner_catalog / partner_checkout reserved for future
}

export interface AuditEventRecord {
  id: string;
  actorType: 'user' | 'pipeline' | 'admin' | 'system';
  action: string;
  target: string;
  at: string; // zero health data or PII
}
