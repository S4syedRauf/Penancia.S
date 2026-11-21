import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  CONSENT_DEFINITIONS,
  PLAN_TEMPLATES_74_DAY,
  SEMEN_KITS,
} from '../data/catalogs';
import {
  evaluateDeterministicScreening,
  hasUrgentQuestionnaireResponse,
} from '../engine/screeningEngine';
import { TRANSLATIONS, Translations } from '../i18n/translations';
import {
  AskMessage,
  AuditEventRecord,
  ConsentKey,
  ConsentRecord,
  FeatureFlags,
  Language,
  MainScreenTab,
  NoonListItem,
  PlanCompletionMap,
  QuestionnaireResponseRow,
  QuestionStatus,
  RetestReminder,
  SahatnaUser,
  ScreeningRun,
  SemenClipRecord,
  SemenKitProfile,
  SemenSessionRun,
  SemenSetupType,
  ShareGrant,
  VaultReport,
  WearableDailyMetric,
} from '../types/sahatna';

const STORAGE_KEY_PREFIX = 'sahatna_user_state_v1_';
const ACTIVE_USER_KEY = 'sahatna_active_userid_v1';
const USER_REGISTRY_KEY = 'sahatna_user_registry_v1';

const ADJECTIVES = ['Blue', 'Calm', 'Bright', 'Swift', 'Noble', 'Silver', 'Golden', 'Steady'];
const NOUNS = ['Falcon', 'Oryx', 'Palm', 'Dhow', 'Oasis', 'Dune', 'Pearl', 'Gazelle'];

export function generateRandomUsername(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = Math.floor(1000 + Math.random() * 9000);
  return `${adj}${noun}-${num}`;
}

export function getLocalIsoDate(timeZone = 'Asia/Dubai'): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

interface IncompleteSemenSession {
  sessionId: string;
  setupType: SemenSetupType;
  kitProfile: SemenKitProfile;
  sampleMeta: {
    abstinenceDays: number;
    collectedAtIso: string;
    temperatureNote: 'room' | '37c_stage';
    sampleName?: string;
  };
  clips: SemenClipRecord[];
  isDemo: boolean;
  demoAttribution?: string;
  currentGuideStep: number;
}

interface PersistedUserState {
  user: SahatnaUser;
  consents: Record<ConsentKey, ConsentRecord>;
  responses: Record<string, QuestionnaireResponseRow>;
  responseHistory: QuestionnaireResponseRow[];
  screeningRuns: ScreeningRun[];
  reports: VaultReport[];
  semenSetupType: SemenSetupType;
  activeKitProfile: SemenKitProfile;
  incompleteSemenSession: IncompleteSemenSession | null;
  semenRuns: SemenSessionRun[];
  retestReminders: RetestReminder[];
  planStartDate: string;
  planCompletions: PlanCompletionMap;
  noonList: NoonListItem[];
  wearableConnected: boolean;
  wearableSource: 'Apple HealthKit' | 'Android Health Connect' | 'Manual Demo Sync';
  wearablePermissions: {
    sleep: boolean;
    restingHr: boolean;
    hrv: boolean;
    steps: boolean;
  };
  wearableMetrics: WearableDailyMetric[];
  shareGrants: ShareGrant[];
  askMessages: AskMessage[];
  featureFlags: FeatureFlags;
}

function buildDefaultConsents(nowIso: string): Record<ConsentKey, ConsentRecord> {
  const map = {} as Record<ConsentKey, ConsentRecord>;
  for (const def of CONSENT_DEFINITIONS) {
    map[def.key] = {
      key: def.key,
      version: def.version,
      // Optional research defaults to OFF (Section 13.6); others start ready for user review
      state: def.key === 'research' ? false : true,
      changedAt: nowIso,
    };
  }
  return map;
}

function buildInitialWearableMetrics(days = 28): WearableDailyMetric[] {
  const rows: WearableDailyMetric[] = [];
  const today = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    // Deliberately leave occasional HRV as NULL to honour "missing is NULL, never zero"
    const missingHrv = i % 5 === 2;
    rows.push({
      localDate: iso,
      sleepHours: Number((6.6 + ((i * 7) % 14) * 0.12).toFixed(1)),
      sleepMidpoint: i % 2 === 0 ? '02:45' : '03:10',
      restingHrBpm: 59 + ((i * 3) % 8),
      hrvRmssdMs: missingHrv ? null : 46 + ((i * 5) % 16),
      steps: 5400 + ((i * 913) % 5200),
      source: 'Apple HealthKit',
    });
  }
  return rows;
}

function createFreshUserState(params: {
  username: string;
  language: Language;
  recoveryEmail?: string;
  recoveryPhone?: string;
}): PersistedUserState {
  const nowIso = new Date().toISOString();
  const userId = `usr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const user: SahatnaUser = {
    userId,
    username: params.username,
    language: params.language,
    timeZone: 'Asia/Dubai',
    recoveryEmail: params.recoveryEmail || undefined,
    recoveryPhone: params.recoveryPhone || undefined,
    createdAt: nowIso,
    deletedAt: null,
  };
  return {
    user,
    consents: buildDefaultConsents(nowIso),
    responses: {},
    responseHistory: [],
    screeningRuns: [],
    reports: [],
    semenSetupType: 'clip_on',
    activeKitProfile: SEMEN_KITS[0],
    incompleteSemenSession: null,
    semenRuns: [],
    retestReminders: [],
    planStartDate: getLocalIsoDate('Asia/Dubai'),
    planCompletions: {},
    noonList: [],
    wearableConnected: true,
    wearableSource: 'Apple HealthKit',
    wearablePermissions: {
      sleep: true,
      restingHr: true,
      hrv: true,
      steps: true,
    },
    wearableMetrics: buildInitialWearableMetrics(28),
    shareGrants: [],
    askMessages: [],
    featureFlags: {
      askLlmMode: 'Full',
      semenModuleEnabled: true,
      semenValidationMode: 'prototype',
      demoModeEnabled: true,
      noonAssistMode: 'links_only',
    },
  };
}

interface SahatnaContextValue {
  state: PersistedUserState | null;
  t: Translations;
  language: Language;
  isRtl: boolean;
  activeTab: MainScreenTab;
  setActiveTab: (tab: MainScreenTab) => void;
  askPrefillPrompt: string | null;
  setAskPrefillPrompt: (prompt: string | null) => void;
  urgentTriggered: boolean;
  arabicSuggestionVisible: boolean;
  dismissArabicSuggestion: () => void;
  // Auth & Account
  completeOnboardingUser: (params: {
    username: string;
    language: Language;
    recoveryEmail?: string;
    recoveryPhone?: string;
  }) => void;
  signInExistingAccount: (identifier: string) => { ok: boolean; error?: string };
  signOutSession: () => void;
  updateRecoveryContact: (email?: string, phone?: string) => void;
  setLanguage: (lang: Language) => void;
  // Consents
  toggleConsent: (key: ConsentKey, nextState: boolean) => void;
  // Questionnaire & Screening
  saveQuestionAnswer: (
    questionId: string,
    answerJson: string | string[] | null,
    status: QuestionStatus
  ) => void;
  runScreeningEvaluation: () => void;
  // Reports
  addReportToVault: (report: VaultReport) => void;
  confirmReportValues: (docId: string, updatedRows: VaultReport['values']) => void;
  deleteReportFromVault: (docId: string) => void;
  // Semen Pre-screen
  setSemenSetup: (setupType: SemenSetupType, kit?: SemenKitProfile) => void;
  updateKitProfile: (kit: SemenKitProfile) => void;
  saveIncompleteSemenSession: (session: IncompleteSemenSession | null) => void;
  addSemenRunResult: (run: SemenSessionRun) => void;
  deleteSemenRun: (runId: string) => void;
  addRetestReminder: (reminder: RetestReminder) => void;
  // 74-Day Plan & Noon
  togglePlanActionToday: (templateCode: string) => void;
  planDayNumber: number;
  setNoonList: (items: NoonListItem[]) => void;
  // Wearables
  setWearableConnected: (connected: boolean) => void;
  setWearableSource: (source: 'Apple HealthKit' | 'Android Health Connect' | 'Manual Demo Sync') => void;
  toggleWearablePermission: (cat: 'sleep' | 'restingHr' | 'hrv' | 'steps') => void;
  // Ask Agent
  appendAskMessage: (msg: AskMessage) => void;
  clearAskHistory: () => void;
  // Care Directory & Share Grants
  createShareGrant: (providerId: string, providerName: string, scope: string[], hoursValid: number) => ShareGrant;
  revokeShareGrant: (grantId: string) => void;
  // Feature Flags & Admin
  updateFeatureFlags: (patch: Partial<FeatureFlags>) => void;
  auditEvents: AuditEventRecord[];
  refreshAuditEvents: () => Promise<void>;
  recordServerAudit: (action: string, target: string, actorType?: AuditEventRecord['actorType']) => void;
  // Data Rights
  exportAllUserDataJson: () => string;
  deleteAllUserData: () => void;
}

const SahatnaContext = createContext<SahatnaContextValue | null>(null);

export const SahatnaProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeUserId, setActiveUserId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(ACTIVE_USER_KEY);
    } catch {
      return null;
    }
  });

  const [state, setState] = useState<PersistedUserState | null>(() => {
    if (!activeUserId) return null;
    try {
      const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${activeUserId}`);
      return raw ? (JSON.parse(raw) as PersistedUserState) : null;
    } catch {
      return null;
    }
  });

  const [guestLang, setGuestLang] = useState<Language>('en');
  const [activeTab, setActiveTab] = useState<MainScreenTab>('home');
  const [askPrefillPrompt, setAskPrefillPrompt] = useState<string | null>(null);
  const [auditEvents, setAuditEvents] = useState<AuditEventRecord[]>([]);
  const [arabicSuggestionDismissed, setArabicSuggestionDismissed] = useState(false);

  const language: Language = state?.user.language || guestLang;
  const isRtl = language === 'ar';
  const t = TRANSLATIONS[language];

  // Detect browser Arabic locale for one-tap prompt (E1-S1)
  const browserIsArabic = useMemo(() => {
    if (typeof navigator === 'undefined') return false;
    return (navigator.language || '').toLowerCase().startsWith('ar');
  }, []);
  const arabicSuggestionVisible =
    browserIsArabic && language === 'en' && !arabicSuggestionDismissed;

  // Apply RTL/LTR and HTML lang dynamically
  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = isRtl ? 'rtl' : 'ltr';
  }, [language, isRtl]);

  // Persist active state per UserId
  useEffect(() => {
    if (!state) return;
    try {
      localStorage.setItem(`${STORAGE_KEY_PREFIX}${state.user.userId}`, JSON.stringify(state));
      localStorage.setItem(ACTIVE_USER_KEY, state.user.userId);
    } catch {
      // ignore quota
    }
  }, [state]);

  const refreshAuditEvents = async () => {
    try {
      const res = await fetch('/v1/audit');
      if (res.ok) {
        const data = (await res.json()) as { events: AuditEventRecord[] };
        setAuditEvents(data.events || []);
      }
    } catch {
      // ignore offline
    }
  };

  useEffect(() => {
    refreshAuditEvents();
  }, []);

  const recordServerAudit = (
    action: string,
    target: string,
    actorType: AuditEventRecord['actorType'] = 'user'
  ) => {
    fetch('/v1/audit/record', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actorType, action, target }),
    })
      .then(() => refreshAuditEvents())
      .catch(() => undefined);
  };

  const registerUserLookup = (user: SahatnaUser) => {
    try {
      const raw = localStorage.getItem(USER_REGISTRY_KEY);
      const list: Array<{
        userId: string;
        username: string;
        recoveryEmail?: string;
        recoveryPhone?: string;
      }> = raw ? JSON.parse(raw) : [];
      const filtered = list.filter((u) => u.userId !== user.userId);
      filtered.push({
        userId: user.userId,
        username: user.username,
        recoveryEmail: user.recoveryEmail,
        recoveryPhone: user.recoveryPhone,
      });
      localStorage.setItem(USER_REGISTRY_KEY, JSON.stringify(filtered));
    } catch {
      // ignore
    }
  };

  const completeOnboardingUser: SahatnaContextValue['completeOnboardingUser'] = ({
    username,
    language: chosenLang,
    recoveryEmail,
    recoveryPhone,
  }) => {
    const fresh = createFreshUserState({
      username,
      language: chosenLang,
      recoveryEmail,
      recoveryPhone,
    });
    registerUserLookup(fresh.user);
    setActiveUserId(fresh.user.userId);
    setState(fresh);
    setActiveTab('home');
    recordServerAudit('USER_INITIALIZED_PKCE', 'identity');
  };

  const signInExistingAccount: SahatnaContextValue['signInExistingAccount'] = (identifier) => {
    const norm = identifier.trim().toLowerCase();
    try {
      const raw = localStorage.getItem(USER_REGISTRY_KEY);
      const list: Array<{
        userId: string;
        username: string;
        recoveryEmail?: string;
        recoveryPhone?: string;
      }> = raw ? JSON.parse(raw) : [];
      const match = list.find(
        (u) =>
          u.username.toLowerCase() === norm ||
          (u.recoveryEmail && u.recoveryEmail.toLowerCase() === norm) ||
          (u.recoveryPhone && u.recoveryPhone.toLowerCase() === norm)
      );
      if (!match) {
        return {
          ok: false,
          error:
            language === 'ar'
              ? 'لم يتم العثور على حساب مطابق. تأكد من اسم المستخدم أو وسيلة الاستعادة.'
              : 'No matching account found. Check your username or recovery contact.',
        };
      }
      const userRaw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${match.userId}`);
      if (!userRaw) {
        return { ok: false, error: 'Account data was previously deleted.' };
      }
      const loaded = JSON.parse(userRaw) as PersistedUserState;
      setActiveUserId(loaded.user.userId);
      setState(loaded);
      setActiveTab('home');
      recordServerAudit('USER_SIGNED_IN_PKCE', 'identity');
      return { ok: true };
    } catch {
      return { ok: false, error: 'Unable to sign in.' };
    }
  };

  const signOutSession = () => {
    localStorage.removeItem(ACTIVE_USER_KEY);
    setActiveUserId(null);
    setState(null);
  };

  const setLanguage = (lang: Language) => {
    setGuestLang(lang);
    setState((prev) =>
      prev
        ? {
            ...prev,
            user: { ...prev.user, language: lang },
          }
        : prev
    );
  };

  const updateRecoveryContact = (email?: string, phone?: string) => {
    setState((prev) => {
      if (!prev) return prev;
      const updatedUser: SahatnaUser = {
        ...prev.user,
        recoveryEmail: email?.trim() || undefined,
        recoveryPhone: phone?.trim() || undefined,
      };
      registerUserLookup(updatedUser);
      return { ...prev, user: updatedUser };
    });
    recordServerAudit('RECOVERY_METHOD_UPDATED', 'identity');
  };

  const toggleConsent = (key: ConsentKey, nextState: boolean) => {
    setState((prev) => {
      if (!prev) return prev;
      const nowIso = new Date().toISOString();
      const nextConsents = {
        ...prev.consents,
        [key]: {
          ...prev.consents[key],
          state: nextState,
          changedAt: nowIso,
        },
      };
      // Section 13.5: withdrawing reports_store or semen_media cleans related media
      let nextReports = prev.reports;
      let nextSemenRuns = prev.semenRuns;
      let nextIncomplete = prev.incompleteSemenSession;
      if (key === 'reports_store' && !nextState) {
        nextReports = [];
      }
      if (key === 'semen_media' && !nextState) {
        nextSemenRuns = [];
        nextIncomplete = null;
      }
      return {
        ...prev,
        consents: nextConsents,
        reports: nextReports,
        semenRuns: nextSemenRuns,
        incompleteSemenSession: nextIncomplete,
      };
    });
    recordServerAudit(nextState ? 'CONSENT_GRANTED' : 'CONSENT_WITHDRAWN', key);
  };

  const saveQuestionAnswer = (
    questionId: string,
    answerJson: string | string[] | null,
    status: QuestionStatus
  ) => {
    setState((prev) => {
      if (!prev) return prev;
      const row: QuestionnaireResponseRow = {
        responseId: `rsp_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        userId: prev.user.userId,
        definitionVersion: 'v1.2-26q',
        questionId,
        answerJson,
        status,
        answeredAt: new Date().toISOString(),
      };
      const nextResponses = { ...prev.responses, [questionId]: row };
      const run = evaluateDeterministicScreening({
        userId: prev.user.userId,
        responses: nextResponses,
        reports: prev.reports,
        semenRuns: prev.semenRuns,
      });
      return {
        ...prev,
        responses: nextResponses,
        responseHistory: [row, ...prev.responseHistory].slice(0, 120),
        screeningRuns: [run, ...prev.screeningRuns].slice(0, 30),
      };
    });
  };

  const runScreeningEvaluation = () => {
    setState((prev) => {
      if (!prev) return prev;
      const run = evaluateDeterministicScreening({
        userId: prev.user.userId,
        responses: prev.responses,
        reports: prev.reports,
        semenRuns: prev.semenRuns,
      });
      return {
        ...prev,
        screeningRuns: [run, ...prev.screeningRuns].slice(0, 30),
      };
    });
    recordServerAudit('SCREENING_RUN_EVALUATED', 'screening');
  };

  const addReportToVault = (report: VaultReport) => {
    setState((prev) => {
      if (!prev) return prev;
      const nextReports = [report, ...prev.reports];
      const run = evaluateDeterministicScreening({
        userId: prev.user.userId,
        responses: prev.responses,
        reports: nextReports,
        semenRuns: prev.semenRuns,
      });
      return {
        ...prev,
        reports: nextReports,
        screeningRuns: [run, ...prev.screeningRuns].slice(0, 30),
      };
    });
    recordServerAudit('REPORT_ADDED_TO_VAULT', report.docId);
  };

  const confirmReportValues = (docId: string, updatedRows: VaultReport['values']) => {
    setState((prev) => {
      if (!prev) return prev;
      const nowIso = new Date().toISOString();
      const nextReports = prev.reports.map((rep) => {
        if (rep.docId !== docId) return rep;
        const confirmedRows = updatedRows.map((r) => ({ ...r, confirmed: true }));
        const reportDate = rep.summary?.report_date || rep.createdAt.slice(0, 10);
        const valueSentences = confirmedRows
          .map(
            (r) =>
              `${r.testNameAsWritten}: ${r.userValue} ${r.unit} (${r.flag}${
                r.refLow !== null ? `, ref >= ${r.refLow}` : ''
              })`
          )
          .join('; ');
        const plainSummary = `Report dated ${reportDate}${
          rep.summary?.lab_name_as_written ? ` (${rep.summary.lab_name_as_written})` : ''
        }: ${valueSentences}. Confirmed by user.`;

        return {
          ...rep,
          state: 'Summarised' as const,
          stateMessage: 'Your report is saved. The assistant can now use it, only if you allowed it.',
          confirmedAt: nowIso,
          summaryVersion: rep.summaryVersion + 1,
          values: confirmedRows,
          summary: {
            schema_version: 1 as const,
            doc_id: rep.docId,
            report_date: reportDate,
            report_type: rep.summary?.report_type || 'semen_analysis',
            lab_name_as_written: rep.summary?.lab_name_as_written || null,
            abstinence_days: rep.summary?.abstinence_days ?? null,
            values: confirmedRows.map((r) => ({
              test_code: r.testCode,
              test_name_as_written: r.testNameAsWritten,
              value: r.userValue,
              unit: r.unit,
              ref_low: r.refLow,
              ref_high: r.refHigh,
              flag: r.flag,
              confirmed_by_user: true,
              source_page: r.sourcePage,
            })),
            free_text_findings: rep.summary?.free_text_findings || [],
            not_found: rep.summary?.not_found || [],
            plain_text_summary: plainSummary,
          },
        };
      });

      const run = evaluateDeterministicScreening({
        userId: prev.user.userId,
        responses: prev.responses,
        reports: nextReports,
        semenRuns: prev.semenRuns,
      });

      return {
        ...prev,
        reports: nextReports,
        screeningRuns: [run, ...prev.screeningRuns].slice(0, 30),
      };
    });
    recordServerAudit('REPORT_VALUES_CONFIRMED', docId);
  };

  const deleteReportFromVault = (docId: string) => {
    setState((prev) => {
      if (!prev) return prev;
      const nextReports = prev.reports.filter((r) => r.docId !== docId);
      const run = evaluateDeterministicScreening({
        userId: prev.user.userId,
        responses: prev.responses,
        reports: nextReports,
        semenRuns: prev.semenRuns,
      });
      return {
        ...prev,
        reports: nextReports,
        screeningRuns: [run, ...prev.screeningRuns].slice(0, 30),
      };
    });
    recordServerAudit('REPORT_DELETED_FROM_VAULT', docId);
  };

  const setSemenSetup = (setupType: SemenSetupType, kit?: SemenKitProfile) => {
    setState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        semenSetupType: setupType,
        activeKitProfile: kit || prev.activeKitProfile,
      };
    });
  };

  const updateKitProfile = (kit: SemenKitProfile) => {
    setState((prev) => (prev ? { ...prev, activeKitProfile: kit } : prev));
  };

  const saveIncompleteSemenSession = (session: IncompleteSemenSession | null) => {
    setState((prev) => (prev ? { ...prev, incompleteSemenSession: session } : prev));
  };

  const addSemenRunResult = (runResult: SemenSessionRun) => {
    setState((prev) => {
      if (!prev) return prev;
      const nextRuns = [runResult, ...prev.semenRuns];
      // Demo runs NEVER affect screening, plan, reminders, or research (E11-S7)
      const nextScreening = runResult.isDemo
        ? prev.screeningRuns
        : [
            evaluateDeterministicScreening({
              userId: prev.user.userId,
              responses: prev.responses,
              reports: prev.reports,
              semenRuns: nextRuns,
            }),
            ...prev.screeningRuns,
          ].slice(0, 30);

      return {
        ...prev,
        incompleteSemenSession: null,
        semenRuns: nextRuns,
        screeningRuns: nextScreening,
      };
    });
  };

  const deleteSemenRun = (runId: string) => {
    setState((prev) =>
      prev
        ? {
            ...prev,
            semenRuns: prev.semenRuns.filter((r) => r.runId !== runId),
          }
        : prev
    );
    recordServerAudit('SEMEN_VIDEO_RUN_DELETED', runId);
  };

  const addRetestReminder = (reminder: RetestReminder) => {
    setState((prev) =>
      prev
        ? {
            ...prev,
            retestReminders: [reminder, ...prev.retestReminders],
          }
        : prev
    );
    recordServerAudit('NEUTRAL_RETEST_REMINDER_SET', reminder.reasonType);
  };

  const togglePlanActionToday = (templateCode: string) => {
    setState((prev) => {
      if (!prev) return prev;
      const localDate = getLocalIsoDate(prev.user.timeZone);
      const key = `${localDate}::${templateCode}`;
      const current = prev.planCompletions[key];
      const nextMap = { ...prev.planCompletions };
      if (current === 'done') {
        delete nextMap[key];
      } else {
        nextMap[key] = 'done';
      }
      return { ...prev, planCompletions: nextMap };
    });
  };

  const planDayNumber = useMemo(() => {
    if (!state) return 1;
    const start = new Date(state.planStartDate).getTime();
    const today = new Date(getLocalIsoDate(state.user.timeZone)).getTime();
    const diffDays = Math.max(0, Math.floor((today - start) / (1000 * 60 * 60 * 24)));
    return Math.min(74, diffDays + 1);
  }, [state]);

  const setNoonList = (items: NoonListItem[]) => {
    setState((prev) => (prev ? { ...prev, noonList: items } : prev));
  };

  const setWearableConnected = (connected: boolean) => {
    setState((prev) => (prev ? { ...prev, wearableConnected: connected } : prev));
  };

  const setWearableSource = (
    source: 'Apple HealthKit' | 'Android Health Connect' | 'Manual Demo Sync'
  ) => {
    setState((prev) => (prev ? { ...prev, wearableSource: source } : prev));
  };

  const toggleWearablePermission = (cat: 'sleep' | 'restingHr' | 'hrv' | 'steps') => {
    setState((prev) =>
      prev
        ? {
            ...prev,
            wearablePermissions: {
              ...prev.wearablePermissions,
              [cat]: !prev.wearablePermissions[cat],
            },
          }
        : prev
    );
  };

  const appendAskMessage = (msg: AskMessage) => {
    setState((prev) =>
      prev ? { ...prev, askMessages: [...prev.askMessages, msg] } : prev
    );
  };

  const clearAskHistory = () => {
    setState((prev) => (prev ? { ...prev, askMessages: [] } : prev));
  };

  const createShareGrant = (
    providerId: string,
    providerName: string,
    scope: string[],
    hoursValid: number
  ): ShareGrant => {
    const now = new Date();
    const expires = new Date(now.getTime() + hoursValid * 3600 * 1000);
    const grant: ShareGrant = {
      grantId: `sh_${Date.now()}`,
      providerId,
      providerName,
      scope,
      expiresAt: expires.toISOString(),
      revoked: false,
      createdAt: now.toISOString(),
      shareCode: `SAH-${Math.random().toString(36).slice(2, 6).toUpperCase()}-${Math.floor(
        100 + Math.random() * 900
      )}`,
    };
    setState((prev) =>
      prev ? { ...prev, shareGrants: [grant, ...prev.shareGrants] } : prev
    );
    recordServerAudit('CLINIC_SHARE_GRANT_CREATED', providerId);
    return grant;
  };

  const revokeShareGrant = (grantId: string) => {
    setState((prev) =>
      prev
        ? {
            ...prev,
            shareGrants: prev.shareGrants.map((g) =>
              g.grantId === grantId ? { ...g, revoked: true } : g
            ),
          }
        : prev
    );
    recordServerAudit('CLINIC_SHARE_GRANT_REVOKED', grantId);
  };

  const updateFeatureFlags = (patch: Partial<FeatureFlags>) => {
    setState((prev) =>
      prev
        ? {
            ...prev,
            featureFlags: {
              ...prev.featureFlags,
              ...patch,
              noonAssistMode: 'links_only', // Always locked links_only in this release (D6)
            },
          }
        : prev
    );
    recordServerAudit('ADMIN_FEATURE_FLAG_UPDATED', Object.keys(patch).join(','), 'admin');
  };

  const exportAllUserDataJson = (): string => {
    if (!state) return '{}';
    recordServerAudit('USER_DATA_EXPORTED', state.user.userId);
    const exportPkg = {
      exportedAt: new Date().toISOString(),
      expiresInDays: 7,
      user: state.user,
      consents: state.consents,
      questionnaireResponses: state.responses,
      screeningRuns: state.screeningRuns,
      reportSummaries: state.reports.map((r) => ({
        docId: r.docId,
        state: r.state,
        privacyMode: r.privacyMode,
        summary: r.summary,
      })),
      semenRunsBandsOnly: state.semenRuns.map((s) => ({
        runId: s.runId,
        isDemo: s.isDemo,
        bandConc: s.bandConc,
        bandMotility: s.bandMotility,
        overallColour: s.overallColour,
        createdAt: s.createdAt,
      })),
      plan74Day: {
        startDate: state.planStartDate,
        dayNumber: planDayNumber,
        completions: state.planCompletions,
        templatesCount: PLAN_TEMPLATES_74_DAY.length,
      },
      shareGrants: state.shareGrants,
    };
    return JSON.stringify(exportPkg, null, 2);
  };

  const deleteAllUserData = () => {
    if (!state) return;
    const uid = state.user.userId;
    try {
      localStorage.removeItem(`${STORAGE_KEY_PREFIX}${uid}`);
      localStorage.removeItem(ACTIVE_USER_KEY);
      const raw = localStorage.getItem(USER_REGISTRY_KEY);
      if (raw) {
        const list = JSON.parse(raw) as Array<{ userId: string }>;
        localStorage.setItem(
          USER_REGISTRY_KEY,
          JSON.stringify(list.filter((u) => u.userId !== uid))
        );
      }
    } catch {
      // ignore
    }
    recordServerAudit('FULL_ACCOUNT_DATA_DELETED', 'lifecycle-section-13.5');
    setActiveUserId(null);
    setState(null);
  };

  const urgentTriggered = useMemo(() => {
    if (!state) return false;
    return hasUrgentQuestionnaireResponse(state.responses);
  }, [state]);

  return (
    <SahatnaContext.Provider
      value={{
        state,
        t,
        language,
        isRtl,
        activeTab,
        setActiveTab,
        askPrefillPrompt,
        setAskPrefillPrompt,
        urgentTriggered,
        arabicSuggestionVisible,
        dismissArabicSuggestion: () => setArabicSuggestionDismissed(true),
        completeOnboardingUser,
        signInExistingAccount,
        signOutSession,
        updateRecoveryContact,
        setLanguage,
        toggleConsent,
        saveQuestionAnswer,
        runScreeningEvaluation,
        addReportToVault,
        confirmReportValues,
        deleteReportFromVault,
        setSemenSetup,
        updateKitProfile,
        saveIncompleteSemenSession,
        addSemenRunResult,
        deleteSemenRun,
        addRetestReminder,
        togglePlanActionToday,
        planDayNumber,
        setNoonList,
        setWearableConnected,
        setWearableSource,
        toggleWearablePermission,
        appendAskMessage,
        clearAskHistory,
        createShareGrant,
        revokeShareGrant,
        updateFeatureFlags,
        auditEvents,
        refreshAuditEvents,
        recordServerAudit,
        exportAllUserDataJson,
        deleteAllUserData,
      }}
    >
      {children}
    </SahatnaContext.Provider>
  );
};

export function useSahatna(): SahatnaContextValue {
  const ctx = useContext(SahatnaContext);
  if (!ctx) throw new Error('useSahatna must be used inside SahatnaProvider');
  return ctx;
}
