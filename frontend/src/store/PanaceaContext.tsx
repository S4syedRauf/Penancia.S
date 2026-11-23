import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { PANACEA_PLAN_TEMPLATES } from '../data/panaceaCatalogs';
import { calculatePlanConsistency, hasUrgentEmergencyTrigger } from '../engine/panaceaScreening';
import { PANACEA_I18N, type PanaceaTranslations } from '../i18n/panaceaTranslations';
import type {
  AskMessage,
  AuditEventRecord,
  ConsentKey,
  ConsentRecord,
  FeatureFlags,
  FollowUpTask,
  GatedCheckInEntry,
  LabOrder,
  Language,
  PanaceaUserProfile,
  PartnerApplication,
  PlanActionStatus,
  PrimaryTab,
  QuestionnaireResponseRow,
  ReportValueRow,
  ScreeningRun,
  SemenSessionRun,
  SubView,
  SymptomEntry,
  TestBasketSelection,
  VaultReport,
  WearableDailyMetric,
} from '../types/panacea';
import { formatISODate } from '../utils/dateUtils';

export interface PanaceaAppState {
  user: PanaceaUserProfile;
  consents: Record<ConsentKey, ConsentRecord>;
  questionnaireResponses: QuestionnaireResponseRow[];
  screeningRuns: ScreeningRun[];
  testBasket: TestBasketSelection[];
  orders: LabOrder[];
  reports: VaultReport[];
  followUpTasks: FollowUpTask[];
  partnerApplications: PartnerApplication[];
  semenSessions: SemenSessionRun[];
  symptoms: SymptomEntry[];
  checkIns: GatedCheckInEntry[];
  wearables: WearableDailyMetric[];
  planCompletions: Record<string, Record<string, PlanActionStatus>>;
  auditEvents: AuditEventRecord[];
  featureFlags: FeatureFlags;
}

const LEGACY_CACHE_KEY = 'panacea_offline_state_v2';

export const DEFAULT_PANACEA_STATE: PanaceaAppState = {
  user: {
    userId: 'usr_patient_01',
    alias: 'Patient Demo',
    language: 'en',
    timeZone: 'Asia/Dubai',
    discreetMode: false,
    recoveryEmail: 'patient@example.ae',
    recoveryPhone: '+971500000000',
    avatar: 'user',
    dubaiDistrict: 'Downtown Dubai',
    userLat: 25.1972,
    userLng: 55.2744,
    allergies: [],
    planDuration: 74,
    customPlanDays: 74,
    planStartDate: new Date().toISOString().split('T')[0],
    extended15Days: false,
    createdAt: new Date().toISOString(),
  },
  consents: {
    app_data: { key: 'app_data', version: '2.0', state: true, changedAt: new Date().toISOString() },
    reports_store: { key: 'reports_store', version: '2.0', state: true, changedAt: new Date().toISOString() },
    reports_ai: { key: 'reports_ai', version: '2.0', state: true, changedAt: new Date().toISOString() },
    semen_media: { key: 'semen_media', version: '2.0', state: true, changedAt: new Date().toISOString() },
    share_clinic: { key: 'share_clinic', version: '2.0', state: false, changedAt: new Date().toISOString() },
    wearable_read: { key: 'wearable_read', version: '2.0', state: false, changedAt: new Date().toISOString() },
    research: { key: 'research', version: '2.0', state: true, changedAt: new Date().toISOString() },
    noon_assist: { key: 'noon_assist', version: '2.0', state: false, changedAt: new Date().toISOString() },
    notifications: { key: 'notifications', version: '2.0', state: true, changedAt: new Date().toISOString() },
  },
  questionnaireResponses: [],
  screeningRuns: [],
  testBasket: [],
  orders: [],
  reports: [],
  followUpTasks: [],
  partnerApplications: [],
  semenSessions: [],
  symptoms: [],
  checkIns: [],
  wearables: [],
  planCompletions: {},
  auditEvents: [],
  featureFlags: {
    askLlmMode: 'Full',
    homeResearchEnabled: true,
    homeResearchKillSwitch: false,
    patientResultBandsEnabled: false,
    labAdapterMode: 'simulated_dubai_fixture',
    noonAutoOrderEnabled: false,
    strictPiiAnonymization: true,
    enableLocalModels: false,
    enableCloudValidation: true,
  },
};

interface PanaceaContextValue {
  state: PanaceaAppState;
  loading: boolean;
  offline: boolean;
  language: Language;
  t: PanaceaTranslations;
  activeTab: PrimaryTab;
  setActiveTab: (tab: PrimaryTab) => void;
  subView: SubView;
  setSubView: (view: SubView) => void;
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  emergencyOpen: boolean;
  setEmergencyOpen: (open: boolean) => void;
  askMessages: AskMessage[];
  setAskMessages: React.Dispatch<React.SetStateAction<AskMessage[]>>;
  consistencyToday: { completed: number; eligible: number; percent: number; statusLabel: 'not_started' | 'active' };
  latestScreening: ScreeningRun | null;
  unreadFollowUpCount: number;
  refreshState: () => Promise<void>;
  addSemenSession: (session: SemenSessionRun) => void;
  addReport: (report: VaultReport) => void;
  confirmReportInState: (docId: string, values: ReportValueRow[], reportDate: string, labName?: string) => void;
  deleteReportFromState: (docId: string) => void;
  setLanguage: (lang: Language) => Promise<void>;
  updateProfile: (patch: Partial<PanaceaUserProfile>) => Promise<void>;
  toggleConsent: (key: ConsentKey, nextState: boolean) => Promise<void>;
  saveQuestionnaireAnswers: (answers: QuestionnaireResponseRow[]) => Promise<ScreeningRun | null>;
  toggleTestBasket: (testId: string, patch: Partial<TestBasketSelection>) => Promise<void>;
  setPlanActionStatus: (templateCode: string, status: PlanActionStatus, date?: string) => Promise<void>;
  logSymptom: (entry: { title: string; severity: 'mild' | 'moderate' | 'severe'; notes: string; time: string; date?: string }) => Promise<void>;
  submitCheckIn: (entry: { instrument: 'IIEF-5' | 'PHQ-2'; score: number; maxScore: number; noteEn: string; noteAr: string }) => Promise<void>;
  syncWearables: (source: 'Apple HealthKit' | 'Android Health Connect') => Promise<{ ok: boolean; error?: string }>;
  acknowledgeFollowUp: (taskId: string) => Promise<void>;
  resolveFollowUpHuman: (taskId: string, clinicianName: string, note: string) => Promise<void>;
  toggleFeatureFlags: (patch: Partial<FeatureFlags>) => Promise<void>;
  eraseAllData: () => Promise<string>;
}

const PanaceaContext = createContext<PanaceaContextValue | null>(null);

export const PanaceaProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Clinical state is hydrated only from the authenticated server. Shared
  // browser caches are deliberately removed rather than reused across users.
  const [state, setState] = useState<PanaceaAppState>(DEFAULT_PANACEA_STATE);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    localStorage.removeItem(LEGACY_CACHE_KEY);
  }, []);
  const [offline, setOffline] = useState(typeof navigator !== 'undefined' ? !navigator.onLine : false);
  const [activeTab, setActiveTab] = useState<PrimaryTab>('diary');
  const [subView, setSubView] = useState<SubView>(null);
  const [selectedDate, setSelectedDate] = useState<string>(() => formatISODate(new Date()));
  const [emergencyOpen, setEmergencyOpen] = useState(false);
  const [askMessages, setAskMessages] = useState<AskMessage[]>([
    {
      id: 'ask_welcome',
      role: 'assistant',
      text: 'Hello! I am Panacea Ask — a constrained, source-backed assistant. Ask about confirmed reports, lab booking status, 26-Q pathways, or Noon food lists. I never diagnose or quote unconfirmed OCR values.',
      sourceLabels: ['Panacea Safety Boundary v2.0'],
      modeUsed: 'TemplatesOnly',
      createdAt: new Date().toISOString(),
    },
  ]);

  const persistCache = (next: PanaceaAppState) => {
    setState(next);
  };

  const addSemenSession = useCallback((session: SemenSessionRun) => {
    setState((prev) => {
      const current = prev || DEFAULT_PANACEA_STATE;
      const next: PanaceaAppState = {
        ...current,
        semenSessions: [session, ...(current.semenSessions || []).slice(0, 19)],
      };
      return next;
    });
  }, []);

  const addReport = useCallback((report: VaultReport) => {
    setState((prev) => {
      const current = prev || DEFAULT_PANACEA_STATE;
      const filtered = (current.reports || []).filter((r) => r.docId !== report.docId);
      const next: PanaceaAppState = {
        ...current,
        reports: [report, ...filtered],
      };
      persistCache(next);
      return next;
    });
  }, []);

  const confirmReportInState = useCallback(
    (docId: string, values: ReportValueRow[], reportDate: string, labName?: string) => {
      setState((prev) => {
        const current = prev || DEFAULT_PANACEA_STATE;
        const updatedReports = (current.reports || []).map((rep) => {
          if (rep.docId !== docId) return rep;
          return {
            ...rep,
            state: 'Confirmed' as const,
            stateMessage: 'Confirmed by patient. Available for clinician review.',
            confirmedAt: new Date().toISOString(),
            values,
            summary: rep.summary
              ? {
                  ...rep.summary,
                  report_date: reportDate,
                  lab_name_as_written: labName || rep.summary.lab_name_as_written,
                }
              : null,
          };
        });
        const next: PanaceaAppState = {
          ...current,
          reports: updatedReports,
        };
        persistCache(next);
        return next;
      });
    },
    []
  );

  const deleteReportFromState = useCallback((docId: string) => {
    setState((prev) => {
      const current = prev || DEFAULT_PANACEA_STATE;
      const next: PanaceaAppState = {
        ...current,
        reports: (current.reports || []).filter((r) => r.docId !== docId),
      };
      persistCache(next);
      return next;
    });
  }, []);

  const refreshState = useCallback(async () => {
    try {
      const resp = await fetch('/v1/state');
      if (!resp.ok) throw new Error('STATE_FETCH_FAILED');
      const data = (await resp.json()) as PanaceaAppState;
      persistCache(data);
      setOffline(false);
    } catch {
      setOffline(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshState();
    const onOnline = () => {
      setOffline(false);
      refreshState();
    };
    const onOffline = () => setOffline(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [refreshState]);

  const language: Language = state?.user.language || 'en';
  const t = PANACEA_I18N[language];

  useEffect(() => {
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = language;
  }, [language]);

  const updateProfile = async (patch: Partial<PanaceaUserProfile>) => {
    if (!state) return;
    const optimistic: PanaceaAppState = {
      ...state,
      user: { ...state.user, ...patch },
    };
    persistCache(optimistic);
    try {
      const resp = await fetch('/v1/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (resp.ok) {
        const { user } = (await resp.json()) as { user: PanaceaUserProfile };
        persistCache({ ...optimistic, user });
      }
    } catch {
      // stays cached offline
    }
  };

  const setLanguage = async (lang: Language) => {
    await updateProfile({ language: lang });
  };

  const toggleConsent = async (key: ConsentKey, nextState: boolean) => {
    if (!state) return;
    const resp = await fetch('/v1/consents', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, state: nextState }),
    });
    if (resp.ok) {
      const { consents } = (await resp.json()) as { consents: Record<ConsentKey, ConsentRecord> };
      persistCache({ ...state, consents });
    }
  };

  const saveQuestionnaireAnswers = async (answers: QuestionnaireResponseRow[]) => {
    if (hasUrgentEmergencyTrigger(answers)) {
      setEmergencyOpen(true);
    }
    if (!state) return null;
    try {
      const resp = await fetch('/v1/questionnaire/answers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      });
      if (!resp.ok) return null;
      const data = (await resp.json()) as {
        questionnaireResponses: QuestionnaireResponseRow[];
        latestScreening: ScreeningRun;
        screeningRuns: ScreeningRun[];
      };
      persistCache({
        ...state,
        questionnaireResponses: data.questionnaireResponses,
        screeningRuns: data.screeningRuns,
      });
      return data.latestScreening;
    } catch {
      persistCache({ ...state, questionnaireResponses: answers });
      return null;
    }
  };

  const toggleTestBasket = async (testId: string, patch: Partial<TestBasketSelection>) => {
    if (!state) return;
    const resp = await fetch('/v1/basket', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ testId, ...patch }),
    });
    if (resp.ok) {
      const { testBasket } = (await resp.json()) as { testBasket: TestBasketSelection[] };
      persistCache({ ...state, testBasket });
    }
  };

  const setPlanActionStatus = async (
    templateCode: string,
    status: PlanActionStatus,
    date: string = selectedDate
  ) => {
    if (!state) return;
    const dayMap = { ...(state.planCompletions[date] || {}) };
    dayMap[templateCode] = status;
    const optimistic: PanaceaAppState = {
      ...state,
      planCompletions: {
        ...state.planCompletions,
        [date]: dayMap,
      },
    };
    persistCache(optimistic);
    try {
      const resp = await fetch('/v1/plan/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, templateCode, status }),
      });
      if (resp.ok) {
        const { planCompletions } = (await resp.json()) as {
          planCompletions: Record<string, Record<string, PlanActionStatus>>;
        };
        persistCache({ ...optimistic, planCompletions });
      }
    } catch {
      // preserved locally until reconnect
    }
  };

  const logSymptom = async (entry: {
    title: string;
    severity: 'mild' | 'moderate' | 'severe';
    notes: string;
    time: string;
    date?: string;
  }) => {
    if (!state) return;
    const resp = await fetch('/v1/symptoms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...entry, date: entry.date || selectedDate }),
    });
    if (resp.ok) {
      const { symptoms } = (await resp.json()) as { symptoms: SymptomEntry[] };
      persistCache({ ...state, symptoms });
    }
  };

  const submitCheckIn = async (entry: {
    instrument: 'IIEF-5' | 'PHQ-2';
    score: number;
    maxScore: number;
    noteEn: string;
    noteAr: string;
  }) => {
    if (!state) return;
    const resp = await fetch('/v1/check-ins', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });
    if (resp.ok) {
      const { checkIns } = (await resp.json()) as { checkIns: GatedCheckInEntry[] };
      persistCache({ ...state, checkIns });
    }
  };

  const syncWearables = async (source: 'Apple HealthKit' | 'Android Health Connect') => {
    if (!state) return { ok: false, error: 'State unavailable' };
    const resp = await fetch('/v1/wearables/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      return { ok: false, error: language === 'ar' ? data.message_ar : data.message_en };
    }
    persistCache({ ...state, wearables: data.wearables });
    return { ok: true };
  };

  const acknowledgeFollowUp = async (taskId: string) => {
    if (!state) return;
    const resp = await fetch(`/v1/follow-ups/${taskId}/acknowledge`, { method: 'POST' });
    if (resp.ok) {
      const { followUpTasks } = (await resp.json()) as { followUpTasks: FollowUpTask[] };
      persistCache({ ...state, followUpTasks });
    }
  };

  const resolveFollowUpHuman = async (taskId: string, clinicianName: string, note: string) => {
    if (!state) return;
    const resp = await fetch(`/v1/follow-ups/${taskId}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clinicianName, resolutionNote: note }),
    });
    if (resp.ok) {
      const data = await resp.json();
      persistCache({ ...state, followUpTasks: data.followUpTasks, orders: data.orders });
    }
  };

  const toggleFeatureFlags = async (patch: Partial<FeatureFlags>) => {
    if (!state) return;
    const resp = await fetch('/v1/features', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (resp.ok) {
      const { flags } = (await resp.json()) as { flags: FeatureFlags };
      persistCache({ ...state, featureFlags: flags });
    }
  };

  const eraseAllData = async () => {
    const resp = await fetch('/v1/data', { method: 'DELETE' });
    const data = await resp.json();
    if (data.state) {
      persistCache(data.state as PanaceaAppState);
    }
    return language === 'ar' ? data.messageAr : data.messageEn;
  };

  const consistencyToday = useMemo(() => {
    if (!state) return { completed: 0, eligible: 0, percent: 0, statusLabel: 'not_started' as const };
    const dayMap = state.planCompletions[selectedDate] || {};
    const statuses = PANACEA_PLAN_TEMPLATES.map((tpl) => ({
      status: dayMap[tpl.templateCode] || 'pending',
    }));
    return calculatePlanConsistency(statuses);
  }, [state, selectedDate]);

  const latestScreening = state?.screeningRuns[0] || null;
  const unreadFollowUpCount =
    state?.followUpTasks.filter((f) => f.status !== 'Completed' && f.status !== 'Cancelled').length || 0;

  return (
    <PanaceaContext.Provider
      value={{
        state,
        loading,
        offline,
        language,
        t,
        activeTab,
        setActiveTab,
        subView,
        setSubView,
        selectedDate,
        setSelectedDate,
        emergencyOpen,
        setEmergencyOpen,
        askMessages,
        setAskMessages,
        consistencyToday,
        latestScreening,
        unreadFollowUpCount,
        refreshState,
        addSemenSession,
        addReport,
        confirmReportInState,
        deleteReportFromState,
        setLanguage,
        updateProfile,
        toggleConsent,
        saveQuestionnaireAnswers,
        toggleTestBasket,
        setPlanActionStatus,
        logSymptom,
        submitCheckIn,
        syncWearables,
        acknowledgeFollowUp,
        resolveFollowUpHuman,
        toggleFeatureFlags,
        eraseAllData,
      }}
    >
      {children}
    </PanaceaContext.Provider>
  );
};

export function usePanacea() {
  const ctx = useContext(PanaceaContext);
  if (!ctx) throw new Error('usePanacea must be used inside PanaceaProvider');
  return ctx;
}
