export type Language = 'en' | 'ar';

// Preserving original bottom navigation tab IDs & names as requested
export type PrimaryTab = 'diary' | 'activity' | 'meals' | 'profile' | 'premium';

export type SubView =
  | null
  | 'health-check'
  | 'report-vault'
  | 'lab-booking'
  | 'semen-prescreen'
  | 'analytics' // Direction View
  | 'activity-history' // History + Symptoms + Gated Check-Ins
  | 'notifications' // Stay Alert & Neutral Notifications
  | 'watch' // Wearable Connectors
  | 'consent-centre'
  | 'partner-portal'
  | 'partner-apply'
  | 'data-rights'
  | 'ask-assistant'
  | 'privacy'
  | 'help';

export type ConsentKey =
  | 'app_data'
  | 'reports_store'
  | 'reports_ai'
  | 'semen_media'
  | 'share_clinic'
  | 'wearable_read'
  | 'research'
  | 'noon_assist'
  | 'notifications';

export interface ConsentRecord {
  key: ConsentKey;
  version: string;
  state: boolean;
  changedAt: string;
}

export type PlanDurationChoice = 30 | 40 | 60 | 74 | 90 | 'custom';

export interface PanaceaUserProfile {
  userId: string;
  alias: string;
  language: Language;
  timeZone: string;
  discreetMode: boolean;
  recoveryEmail: string;
  recoveryPhone: string;
  avatar: string;
  dubaiDistrict: string;
  userLat: number;
  userLng: number;
  allergies: string[];
  planDuration: PlanDurationChoice;
  customPlanDays: number;
  planStartDate: string;
  extended15Days: boolean;
  createdAt: string;
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
  conditionalOn?: { questionId: string; values: string[] };
  options: QuestionOption[];
}

export interface QuestionnaireResponseRow {
  responseId: string;
  definitionVersion: string;
  questionId: string;
  answerJson: string | string[] | null;
  status: QuestionStatus;
  answeredAt: string;
}

export type CarePathway = 'self_care' | 'primary_care' | 'andrology' | 'urgent';
export type ScreeningUrgency = 'Routine' | 'Timely' | 'Urgent';

export interface ScreeningRun {
  runId: string;
  ruleVersion: string;
  pathway: CarePathway;
  urgency: ScreeningUrgency;
  titleEn: string;
  titleAr: string;
  reasonEn: string;
  reasonAr: string;
  reasonCodes: string[];
  used: string[];
  missing: string[];
  nextActionEn: string;
  nextActionAr: string;
  nextActionView: SubView;
  urgentTriggered: boolean;
  createdAt: string;
}

export interface TestCatalogItem {
  id: string;
  code: string;
  nameEn: string;
  nameAr: string;
  purposeEn: string;
  purposeAr: string;
  limitsEn: string;
  limitsAr: string;
  prerequisitesEn: string;
  prerequisitesAr: string;
  requiresClinicianOrder: boolean;
  bookableInPrototype: boolean;
  gatedReasonEn?: string;
  gatedReasonAr?: string;
  indicativePriceAed: number | null;
}

export interface TestBasketSelection {
  testId: string;
  selected: boolean;
  alreadyDone: boolean;
  attachedReportId?: string | null;
  clinicianAuthorized: boolean;
}

// Report Vault
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
  | 'ExtractionFailed'
  | 'ManualEntry';

export type ReportType = 'semen_analysis' | 'hormones' | 'blood_count' | 'urine' | 'scan' | 'other';
export type PrivacyMode = 'full' | 'cropped' | 'covered' | 'unknown';
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
  confirmedBy?: string;
  confirmedAt?: string;
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
  extractionJson: {
    engineVersion: string;
    headerMaskedFields: string[];
    rawLines: Array<{ text: string; confidence: ConfidenceLevel }>;
  };
  values: ReportValueRow[];
  summary: ReportSummaryV1 | null;
  summaryVersion: number;
  signedByPartner?: string;
  createdAt: string;
  confirmedAt: string | null;
}

// Lab Booking, 5.000 km Rule & Specimen State Machine
export type SpecimenOrderState =
  | 'Draft'
  | 'NeedsAuthorization'
  | 'QuoteReady'
  | 'SlotHeld'
  | 'PaymentPending'
  | 'PartnerPending'
  | 'Booked'
  | 'CollectorAssigned'
  | 'CentreCheckIn'
  | 'Collected'
  | 'InTransit'
  | 'Received'
  | 'Accepted'
  | 'Processing'
  | 'ReportReady'
  | 'FollowUpPending'
  | 'Complete'
  | 'HoldExpired'
  | 'PaymentFailed'
  | 'PartnerRejected'
  | 'CollectionMissed'
  | 'SpecimenRejected'
  | 'RecollectionRequested'
  | 'Cancelled'
  | 'RefundPending'
  | 'Refunded'
  | 'ReportCorrected';

export interface PartnerLabSite {
  partnerId: string;
  siteId: string;
  nameEn: string;
  nameAr: string;
  emirate: 'Dubai' | 'Abu Dhabi';
  isSyntheticFixture: boolean;
  lat: number;
  lng: number;
  addressEn: string;
  addressAr: string;
  phone: string;
  maxHomeRadiusKm: number;
  acceptsHomeSemenPickup: boolean;
  homeWindowMinutes: number;
  homeSlotsAvailable: number;
  centreSlotsAvailable: number;
  supportsDirectDropOff: boolean;
  requiresClinicianOrderForSemen: boolean;
  baseTestFeeAed: number;
  homeCollectionFeeAed: number;
  turnaroundEstimateEn: string;
  turnaroundEstimateAr: string;
  cancellationTermsEn: string;
  cancellationTermsAr: string;
  collectionGuideVersion: string;
  collectionGuideEn: string[];
  collectionGuideAr: string[];
}

export interface ConsentPack {
  grantId: string;
  recipientPartnerId: string;
  recipientName: string;
  purpose: string;
  selectedFields: string[];
  optionalFieldsIncluded: string[];
  consentVersion: string;
  expiresAt: string;
  grantedAt: string;
  revoked: boolean;
}

export interface PartnerEvent {
  eventId: string;
  orderId: string;
  state: SpecimenOrderState;
  actorRole: 'system' | 'collector' | 'lab_tech' | 'lab_director' | 'patient';
  actorName: string;
  note: string;
  timestamp: string;
}

export interface LabOrder {
  orderId: string;
  userId: string;
  ticketCode: string;
  partnerId: string;
  partnerNameEn: string;
  partnerNameAr: string;
  siteId: string;
  testCode: string;
  testNameEn: string;
  mode: 'home_collection' | 'centre_appointment';
  distanceKm: number;
  slotLabel: string;
  totalPriceAed: number;
  isSimulated: boolean;
  state: SpecimenOrderState;
  stateVersion: number;
  consentPack: ConsentPack | null;
  rejectionReason?: string;
  recollectionParentOrderId?: string | null;
  linkedReportId?: string | null;
  events: PartnerEvent[];
  createdAt: string;
  updatedAt: string;
}

export type FollowUpStatus =
  | 'NotStarted'
  | 'InProgress'
  | 'WaitingOnPartner'
  | 'UserActionNeeded'
  | 'HumanContactRequired'
  | 'Acknowledged'
  | 'Completed'
  | 'Overdue'
  | 'Cancelled';

export interface FollowUpTask {
  taskId: string;
  orderId?: string;
  titleEn: string;
  titleAr: string;
  whatIsKnownEn: string;
  whatIsUnknownEn: string;
  lastConfirmedEvent: string;
  lastConfirmedAt: string;
  ownerName: string;
  ownerRole: string;
  expectedContactWindow: string;
  priority: 'critical' | 'timely' | 'routine';
  status: FollowUpStatus;
  userAcknowledgedAt?: string | null;
  humanResolutionNote?: string | null;
  resolvedByHuman?: string | null;
  resolvedAt?: string | null;
}

export interface PartnerApplication {
  applicationId: string;
  labName: string;
  emirate: string;
  licenceNumber: string;
  contactEmail: string;
  servicesOffered: string[];
  status: 'PendingHumanReview';
  submittedAt: string;
}

// Home Semen Pre-Screen (Research Mode)
export type SemenSetupType = 'clip_on' | 'microscope_adapter' | 'neither';
export type SemenBand = 'Low' | 'Typical' | 'Unclear';
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
  uploadProgress: number;
  uploaded: boolean;
  sha256: string;
  qualityPass: boolean;
  syntheticSeed?: {
    concCategory: SemenBand;
    motilityCategory: SemenBand;
    noSperm?: boolean;
  };
}

export interface StageLogEntry {
  stage: PipelineStageCode;
  name: string;
  outcome: 'passed' | 'fallback' | 'blocked' | 'warning' | 'failed';
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
    completeness: 'full' | 'partial';
    sampleName?: string;
  };
  isDemo: boolean;
  demoAttribution?: string;
  modelVersion: string;
  pipelineVersion: string;
  validationMode: 'research_only';
  state: 'Completed' | 'BlockedNoConsent' | 'UploadIncomplete' | 'Rejected' | 'RetakeNeeded' | 'KillSwitchDisabled';
  qualitySummaryEn: string;
  qualitySummaryAr: string;
  researchOnlyBandConc: SemenBand;
  researchOnlyBandMotility: SemenBand;
  noSpermSeen: boolean;
  usedItems: string[];
  couldNotUseItems: string[];
  stageLogs: StageLogEntry[];
  createdAt: string;
}

// Plan Actions, Timeline, Symptoms, Wearables, Library
export type PlanActionStatus = 'pending' | 'done' | 'skipped' | 'paused';

export interface PlanActionTemplate {
  templateCode: string;
  titleEn: string;
  titleAr: string;
  detailEn: string;
  detailAr: string;
  defaultTime: string; // HH:mm
  endTime: string; // HH:mm
  category: 'sleep' | 'heat' | 'nutrition' | 'movement' | 'stress' | 'recheck';
  durationMinutes: number;
}

export interface SymptomEntry {
  id: string;
  date: string;
  time: string;
  title: string;
  severity: 'mild' | 'moderate' | 'severe';
  notes: string;
  source: 'user_reported';
}

export interface GatedCheckInEntry {
  id: string;
  instrument: 'IIEF-5' | 'PHQ-2';
  date: string;
  score: number;
  maxScore: number;
  noteEn: string;
  noteAr: string;
}

export interface WearableDailyMetric {
  localDate: string;
  sleepHours: number | null;
  restingHrBpm: number | null;
  hrvRmssdMs: number | null;
  steps: number | null;
  source: 'Apple HealthKit' | 'Android Health Connect';
}

export interface FoodCatalogItem {
  id: string;
  nameEn: string;
  nameAr: string;
  categoryEn: string;
  categoryAr: string;
  reasonEn: string;
  reasonAr: string;
  allergyTags: string[];
  image: string;
}

export interface LibraryArticle {
  id: string;
  category: 'library' | 'know_your_normal' | 'life_stages';
  titleEn: string;
  titleAr: string;
  summaryEn: string;
  summaryAr: string;
  sourceCitation: string;
  version: string;
  reviewedDate: string;
}

export interface AskActionButton {
  code: string;
  labelEn: string;
  labelAr: string;
  view: SubView;
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

export interface AuditEventRecord {
  id: string;
  actorType: 'user' | 'pipeline' | 'partner_staff' | 'system';
  action: string;
  target: string;
  at: string;
}

export interface FeatureFlags {
  askLlmMode: 'Full' | 'TemplatesOnly' | 'Off';
  homeResearchEnabled: boolean;
  homeResearchKillSwitch: boolean;
  patientResultBandsEnabled: false; // Strictly false per Blueprint Part 9.1 until clinical/regulatory approval
  labAdapterMode: 'simulated_dubai_fixture';
  noonAutoOrderEnabled: false; // Strictly false per Blueprint Part 12
  strictPiiAnonymization?: boolean;
  enableLocalModels?: boolean;
  enableCloudValidation?: boolean;
}
