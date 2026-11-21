import { AnswerMap, OnboardingStage } from '../types/questionnaire';

const TEMP_SESSION_KEY = 'aurafit_temp_onboarding_v2';
const ACCOUNT_DATA_KEY = 'aurafit_account_onboarding_v2';

export interface TempOnboardingSession {
  stage: OnboardingStage;
  answers: AnswerMap;
  currentQuestionIndex: number;
  updatedAt: string;
}

export interface StoredOnboardingRecord {
  userId: string;
  answers: AnswerMap;
  completedAt: string;
}

const DEFAULT_TEMP_SESSION: TempOnboardingSession = {
  stage: 'welcome',
  answers: {},
  currentQuestionIndex: 0,
  updatedAt: new Date().toISOString(),
};

export function loadTempOnboardingSession(): TempOnboardingSession {
  try {
    const raw = sessionStorage.getItem(TEMP_SESSION_KEY);
    if (!raw) return DEFAULT_TEMP_SESSION;
    const parsed = JSON.parse(raw) as Partial<TempOnboardingSession>;
    return {
      ...DEFAULT_TEMP_SESSION,
      ...parsed,
      answers: parsed.answers || {},
    };
  } catch {
    return DEFAULT_TEMP_SESSION;
  }
}

export function saveTempOnboardingSession(session: TempOnboardingSession): void {
  try {
    sessionStorage.setItem(
      TEMP_SESSION_KEY,
      JSON.stringify({
        ...session,
        updatedAt: new Date().toISOString(),
      })
    );
  } catch {
    // ignore storage errors
  }
}

export function clearTempOnboardingSession(): void {
  try {
    sessionStorage.removeItem(TEMP_SESSION_KEY);
  } catch {
    // ignore
  }
}

export function loadAccountAssessment(userId: string): StoredOnboardingRecord | null {
  try {
    const raw = localStorage.getItem(ACCOUNT_DATA_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, StoredOnboardingRecord>;
    return map[userId] || null;
  } catch {
    return null;
  }
}

export function saveAccountAssessment(record: StoredOnboardingRecord): void {
  try {
    const raw = localStorage.getItem(ACCOUNT_DATA_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, StoredOnboardingRecord>) : {};
    map[record.userId] = record;
    localStorage.setItem(ACCOUNT_DATA_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}
