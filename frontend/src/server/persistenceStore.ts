import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { getRequestIdentity, type RequestIdentity } from './requestIdentity.ts';
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

const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), '.panacea-data'));
const LEGACY_STORE_PATH = path.join(DATA_DIR, 'store.json');
const LOCAL_IDENTITY: RequestIdentity = {
  userId: 'usr_panacea_dubai_01',
  tenantId: 'local',
  storageKey: 'local-demo',
  includeDemoData: true,
};

export function getTodayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function createInitialStoreData(identity?: RequestIdentity): PanaceaStoreData {
  const now = new Date().toISOString();
  const today = getTodayISO();
  const includeDemoData = identity?.includeDemoData ?? true;
  const userId = identity?.userId ?? LOCAL_IDENTITY.userId;

  const consents = {} as Record<ConsentKey, ConsentRecord>;
  for (const def of CONSENT_DEFINITIONS) {
    consents[def.key] = {
      key: def.key,
      version: def.version,
      state:
        def.key === 'app_data' ||
        (includeDemoData && (def.key === 'reports_store' || def.key === 'notifications')),
      changedAt: now,
    };
  }

  const initialPlanForToday: Record<string, PlanActionStatus> = {};
  PANACEA_PLAN_TEMPLATES.forEach((tpl, idx) => {
    initialPlanForToday[tpl.templateCode] = includeDemoData && idx < 2 ? 'done' : 'pending';
  });

  const seededReport: VaultReport = {
    docId: 'rep_dhc_sample_1',
    userId,
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
      userId,
      alias: includeDemoData ? 'Omar-DXB-482' : `User-${identity?.storageKey.slice(0, 8) || 'local'}`,
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
    reports: includeDemoData ? [seededReport] : [],
    followUpTasks: includeDemoData ? [seededTask] : [],
    partnerApplications: [],
    semenSessions: [],
    symptoms: includeDemoData
      ? [
          {
            id: 'sym_init_1',
            date: today,
            time: '08:15',
            title: 'Baseline Check-in (No urgent symptoms)',
            severity: 'mild',
            notes: 'Optional symptom diary entry example — user-reported only.',
            source: 'user_reported',
          },
        ]
      : [],
    checkIns: [],
    wearables: includeDemoData
      ? [
          {
            localDate: today,
            sleepHours: 7.4,
            restingHrBpm: 62,
            hrvRmssdMs: 48,
            steps: 6850,
            source: 'Apple HealthKit',
          },
        ]
      : [],
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
      askLlmMode: includeDemoData ? 'Full' : 'TemplatesOnly',
      homeResearchEnabled: includeDemoData,
      homeResearchKillSwitch: !includeDemoData,
      patientResultBandsEnabled: false,
      labAdapterMode: 'simulated_dubai_fixture',
      noonAutoOrderEnabled: false,
    },
  };
}

const memoryStores = new Map<string, PanaceaStoreData>();

function currentIdentity(): RequestIdentity {
  const identity = getRequestIdentity();
  if (identity) return identity;
  if (process.env.AUTH_REQUIRE_ENTRA === 'true') {
    throw new Error('A verified request identity is required to access clinical state.');
  }
  return LOCAL_IDENTITY;
}

function storePath(identity: RequestIdentity): string {
  return path.join(DATA_DIR, 'users', identity.storageKey, 'store.json');
}

function useMemoryStore(): boolean {
  return process.env.PERSISTENCE_MODE === 'memory';
}

function ensureDir(identity: RequestIdentity): void {
  fs.mkdirSync(path.dirname(storePath(identity)), { recursive: true, mode: 0o700 });
}

export function loadStore(): PanaceaStoreData {
  const identity = currentIdentity();
  const cached = memoryStores.get(identity.storageKey);
  if (cached) return cached;
  if (!useMemoryStore()) {
    const filePath = storePath(identity);
    ensureDir(identity);

    if (fs.existsSync(filePath)) {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as PanaceaStoreData;
      if (!parsed?.user || !parsed.consents || parsed.user.userId !== identity.userId) {
        throw new Error('Stored clinical state failed its ownership validation.');
      }
      memoryStores.set(identity.storageKey, parsed);
      return parsed;
    }

    // Migrate only the explicitly local single-user demo. A cloud legacy file is
    // never assigned to the first person who signs in.
    if (identity.tenantId === 'local' && fs.existsSync(LEGACY_STORE_PATH)) {
      const legacy = JSON.parse(fs.readFileSync(LEGACY_STORE_PATH, 'utf8')) as PanaceaStoreData;
      legacy.user.userId = identity.userId;
      saveStore(legacy);
      return legacy;
    }
  }

  const initial = createInitialStoreData(identity);
  saveStore(initial);
  return initial;
}

export function saveStore(data: PanaceaStoreData): void {
  const identity = currentIdentity();
  if (data.user.userId !== identity.userId) {
    throw new Error('Refusing to persist clinical state for a different user.');
  }
  memoryStores.set(identity.storageKey, data);
  if (useMemoryStore()) return;

  ensureDir(identity);
  const filePath = storePath(identity);
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tmpPath, filePath);
}

export function resetStore(): PanaceaStoreData {
  const fresh = createInitialStoreData(currentIdentity());
  saveStore(fresh);
  return fresh;
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
