import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { APP_IMAGES } from '../data/assets.ts';
import {
  CONSENT_DEFINITIONS,
  PANACEA_PLAN_TEMPLATES,
  PANACEA_TEST_CATALOG,
} from '../data/panaceaCatalogs.ts';
import type {
  AuditEventRecord,
  ConsentKey,
  ConsentRecord,
  FeatureFlags,
  FollowUpTask,
  GatedCheckInEntry,
  LabOrder,
  PanaceaUserProfile,
  PartnerApplication,
  PlanActionStatus,
  QuestionnaireResponseRow,
  ScreeningRun,
  SemenSessionRun,
  SymptomEntry,
  TestBasketSelection,
  VaultReport,
  WearableDailyMetric,
} from '../types/panacea.ts';

export interface OutboxRecord {
  id: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payloadSummary: string; // Strictly zero PHI
  createdAt: string;
  delivered: boolean;
}

export interface SlotHoldRecord {
  holdId: string;
  partnerId: string;
  siteId: string;
  mode: 'home_collection' | 'centre_appointment';
  slotLabel: string;
  distanceKm: number;
  totalPriceAed: number;
  expiresAt: string;
}

export interface IdempotencyRecord {
  key: string;
  bodyHash: string;
  responseStatus: number;
  responseBody: unknown;
  createdAt: string;
}

export interface PanaceaStoreData {
  user: PanaceaUserProfile;
  consents: Record<ConsentKey, ConsentRecord>;
  questionnaireResponses: QuestionnaireResponseRow[];
  screeningRuns: ScreeningRun[];
  testBasket: TestBasketSelection[];
  orders: LabOrder[];
  slotHolds: SlotHoldRecord[];
  idempotencyKeys: Record<string, IdempotencyRecord>;
  outboxMessages: OutboxRecord[];
  reports: VaultReport[];
  followUpTasks: FollowUpTask[];
  partnerApplications: PartnerApplication[];
  semenSessions: SemenSessionRun[];
  symptoms: SymptomEntry[];
  checkIns: GatedCheckInEntry[];
  wearables: WearableDailyMetric[];
  planCompletions: Record<string, Record<string, PlanActionStatus>>; // date -> templateCode -> status
  auditEvents: AuditEventRecord[];
  featureFlags: FeatureFlags;
}

const DATA_DIR = path.resolve(process.cwd(), '.panacea-data');
const STORE_PATH = path.join(DATA_DIR, 'store.json');

export function getTodayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function createInitialStoreData(): PanaceaStoreData {
  const now = new Date().toISOString();
  const today = getTodayISO();

  const consents = {} as Record<ConsentKey, ConsentRecord>;
  for (const def of CONSENT_DEFINITIONS) {
    consents[def.key] = {
      key: def.key,
      version: def.version,
      state: def.key === 'app_data' || def.key === 'reports_store' || def.key === 'notifications',
      changedAt: now,
    };
  }

  const initialPlanForToday: Record<string, PlanActionStatus> = {};
  PANACEA_PLAN_TEMPLATES.forEach((tpl, idx) => {
    initialPlanForToday[tpl.templateCode] = idx < 2 ? 'done' : 'pending';
  });

  const seededReport: VaultReport = {
    docId: 'rep_dhc_sample_1',
    userId: 'usr_panacea_dubai_01',
    fileName: 'AlRazi_DHCC_Semen_Report_Sample.pdf',
    mime: 'application/pdf',
    privacyMode: 'covered',
    state: 'Summarised',
    stateMessage: 'Confirmed by user and summarised with provenance.',
    extractionJson: {
      engineVersion: 'panacea-ocr-rules-v2.0',
      headerMaskedFields: ['Name', 'Emirates ID / MRN'],
      rawLines: [
        { text: 'Lab: Al Razi Andrology & Diagnostic Hub (Dubai Sample)', confidence: 'high' },
        { text: 'Report Date: 2026-10-03 · Abstinence: 4 days', confidence: 'high' },
        { text: 'Sperm concentration: 18.5 million/mL (Ref >= 16)', confidence: 'high' },
        { text: 'Total motility: 46 % (Ref >= 42%)', confidence: 'high' },
      ],
    },
    values: [
      {
        valueId: 'val_seed_1',
        testCode: 'SEMEN_CONC',
        testNameAsWritten: 'Sperm concentration',
        aiValue: 18.5,
        userValue: 18.5,
        unit: 'million/mL',
        refLow: 16,
        refHigh: null,
        flag: 'normal',
        confidence: 'high',
        confirmed: true,
        sourcePage: 1,
        confirmedBy: 'User verified',
        confirmedAt: now,
      },
      {
        valueId: 'val_seed_2',
        testCode: 'SEMEN_MOT_TOTAL',
        testNameAsWritten: 'Total motility',
        aiValue: 46,
        userValue: 46,
        unit: '%',
        refLow: 42,
        refHigh: null,
        flag: 'normal',
        confidence: 'high',
        confirmed: true,
        sourcePage: 1,
        confirmedBy: 'User verified',
        confirmedAt: now,
      },
    ],
    summary: {
      schema_version: 1,
      doc_id: 'rep_dhc_sample_1',
      report_date: '2026-10-03',
      report_type: 'semen_analysis',
      lab_name_as_written: 'Al Razi Andrology & Diagnostic Hub (Dubai Sample)',
      abstinence_days: 4,
      values: [
        {
          test_code: 'SEMEN_CONC',
          test_name_as_written: 'Sperm concentration',
          value: 18.5,
          unit: 'million/mL',
          ref_low: 16,
          ref_high: null,
          flag: 'normal',
          confirmed_by_user: true,
          source_page: 1,
        },
        {
          test_code: 'SEMEN_MOT_TOTAL',
          test_name_as_written: 'Total motility',
          value: 46,
          unit: '%',
          ref_low: 42,
          ref_high: null,
          flag: 'normal',
          confirmed_by_user: true,
          source_page: 1,
        },
      ],
      free_text_findings: ['Sample liquefied normally within 30 minutes (Demo Fixture).'],
      not_found: ['Vitality', 'DNA Fragmentation'],
      plain_text_summary:
        'From your confirmed sample report (2026-10-03): Sperm concentration 18.5 million/mL (Ref >= 16) and Total motility 46% (Ref >= 42%). Keep sharing directly with your clinician.',
    },
    summaryVersion: 1,
    createdAt: now,
    confirmedAt: now,
  };

  const seededTask: FollowUpTask = {
    taskId: 'fup_baseline_review',
    titleEn: 'Complete Adaptive 26-Q Health Check or Confirm Next Lab Step',
    titleAr: 'إكمال التقييم الصحي التكيفي أو تأكيد خطوة المختبر التالية',
    whatIsKnownEn: 'Dubai-first account initialised with baseline habit plan (74-day recommended).',
    whatIsUnknownEn: 'Current symptom triggers, heat exposures, and abstinence history need user confirmation.',
    lastConfirmedEvent: 'Account Initialised',
    lastConfirmedAt: now,
    ownerName: 'User & Panacea Coordination Desk',
    ownerRole: 'Patient / Care Coordinator',
    expectedContactWindow: 'Self-paced · Coordinator review if clinical trigger arises',
    priority: 'routine',
    status: 'UserActionNeeded',
    userAcknowledgedAt: null,
    humanResolutionNote: null,
    resolvedByHuman: null,
    resolvedAt: null,
  };

  return {
    user: {
      userId: 'usr_panacea_dubai_01',
      alias: 'Omar-DXB-482',
      language: 'en',
      timeZone: 'Asia/Dubai',
      discreetMode: false,
      recoveryEmail: '',
      recoveryPhone: '',
      avatar: APP_IMAGES.avatar,
      dubaiDistrict: 'Oud Metha / DHCC South (~3.000 km)',
      userLat: 25.2116,
      userLng: 55.2974,
      allergies: [],
      planDuration: 74,
      customPlanDays: 74,
      planStartDate: today,
      extended15Days: false,
      createdAt: now,
    },
    consents,
    questionnaireResponses: [],
    screeningRuns: [],
    testBasket: PANACEA_TEST_CATALOG.map((t) => ({
      testId: t.id,
      selected: t.code === 'SEMEN_ANALYSIS',
      alreadyDone: false,
      attachedReportId: null,
      clinicianAuthorized: !t.requiresClinicianOrder,
    })),
    orders: [],
    slotHolds: [],
    idempotencyKeys: {},
    outboxMessages: [],
    reports: [seededReport],
    followUpTasks: [seededTask],
    partnerApplications: [],
    semenSessions: [],
    symptoms: [
      {
        id: 'sym_init_1',
        date: today,
        time: '08:15',
        title: 'Baseline Check-in (No urgent symptoms)',
        severity: 'mild',
        notes: 'Optional symptom diary entry example — user-reported only.',
        source: 'user_reported',
      },
    ],
    checkIns: [],
    wearables: [
      {
        localDate: today,
        sleepHours: 7.4,
        restingHrBpm: 62,
        hrvRmssdMs: 48,
        steps: 6850,
        source: 'Apple HealthKit',
      },
    ],
    planCompletions: {
      [today]: initialPlanForToday,
    },
    auditEvents: [
      {
        id: 'aud_boot_1',
        actorType: 'system',
        action: 'PANACEA_RUNTIME_BOOTED',
        target: 'dubai-first-v2.0',
        at: now,
      },
    ],
    featureFlags: {
      askLlmMode: 'Full',
      homeResearchEnabled: true,
      homeResearchKillSwitch: false,
      patientResultBandsEnabled: false,
      labAdapterMode: 'simulated_dubai_fixture',
      noonAutoOrderEnabled: false,
    },
  };
}

let memoryStore: PanaceaStoreData | null = null;

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function loadStore(): PanaceaStoreData {
  if (memoryStore) return memoryStore;
  try {
    ensureDir();
    if (fs.existsSync(STORE_PATH)) {
      const raw = fs.readFileSync(STORE_PATH, 'utf8');
      const parsed = JSON.parse(raw) as PanaceaStoreData;
      if (parsed && parsed.user && parsed.consents) {
        memoryStore = parsed;
        return memoryStore;
      }
    }
  } catch {
    // fallback cleanly to initial store
  }
  memoryStore = createInitialStoreData();
  saveStore(memoryStore);
  return memoryStore;
}

export function saveStore(data: PanaceaStoreData): void {
  memoryStore = data;
  try {
    ensureDir();
    const tmpPath = `${STORE_PATH}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmpPath, STORE_PATH);
  } catch {
    // Non-fatal in read-only edge envs
  }
}

export function resetStore(): PanaceaStoreData {
  memoryStore = createInitialStoreData();
  saveStore(memoryStore);
  return memoryStore;
}

export function appendAuditAndOutbox(
  store: PanaceaStoreData,
  params: {
    actorType: AuditEventRecord['actorType'];
    action: string;
    target: string;
    outboxAggregateType?: string;
    outboxAggregateId?: string;
    outboxEventType?: string;
  }
): void {
  const now = new Date().toISOString();
  store.auditEvents.unshift({
    id: `aud_${Date.now()}_${crypto.randomUUID().slice(0, 5)}`,
    actorType: params.actorType,
    action: params.action.slice(0, 72),
    target: params.target.slice(0, 72),
    at: now,
  });
  if (store.auditEvents.length > 120) {
    store.auditEvents.length = 120;
  }

  if (params.outboxAggregateType && params.outboxAggregateId && params.outboxEventType) {
    store.outboxMessages.unshift({
      id: `out_${Date.now()}_${crypto.randomUUID().slice(0, 5)}`,
      aggregateType: params.outboxAggregateType,
      aggregateId: params.outboxAggregateId,
      eventType: params.outboxEventType,
      payloadSummary: `${params.outboxEventType} -> ${params.outboxAggregateId}`,
      createdAt: now,
      delivered: true,
    });
    if (store.outboxMessages.length > 80) {
      store.outboxMessages.length = 80;
    }
  }
}

export function hashRequestPayload(body: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(body || {})).digest('hex');
}
