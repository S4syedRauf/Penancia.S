export type QuestionInputType = 'single' | 'numeric';

export interface QuestionOption {
  value: string;
  label: string;
}

export type AnswerValue = string | number | null;

export type AnswerMap = Record<string, AnswerValue>;

export interface QuestionDefinition {
  id: string;
  stepNumber: number;
  titleDark: string;
  titleMuted: string;
  text: string;
  description?: string;
  inputType: QuestionInputType;
  options?: QuestionOption[];
  required: boolean;
  unit?: string;
  min?: number;
  max?: number;
  placeholder?: string;
}

export type OnboardingStage = 'welcome' | 'questionnaire' | 'auth' | 'dashboard';

export interface AuthUser {
  id: string;
  fullName: string;
  email: string;
  verified: boolean;
  createdAt: string;
  onboardingCompleted: boolean;
}
