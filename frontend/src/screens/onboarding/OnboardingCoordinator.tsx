import React, { useEffect, useMemo, useState } from 'react';
import { OnboardingLayout } from '../../components/onboarding/OnboardingLayout';
import { QuestionRenderer } from '../../components/onboarding/QuestionRenderer';
import {
  isBasicOnboardingComplete,
  validateQuestionAnswer,
} from '../../engine/questionnaireEngine';
import { BASIC_QUESTIONS } from '../../questionnaires';
import {
  loadTempOnboardingSession,
  saveTempOnboardingSession,
} from '../../services/sessionPersistence';
import { AnswerMap, AnswerValue, AuthUser, OnboardingStage } from '../../types/questionnaire';
import { AuthGateScreen } from './AuthGateScreen';
import { WelcomeScreen } from './WelcomeScreen';

interface OnboardingCoordinatorProps {
  initialAuthMode?: 'signup' | 'signin';
  initialStage?: OnboardingStage;
  authenticatedUser?: AuthUser | null;
  onCompleteToDashboard: (params: { user: AuthUser; answers: AnswerMap }) => void;
}

export const OnboardingCoordinator: React.FC<OnboardingCoordinatorProps> = ({
  initialAuthMode,
  initialStage,
  authenticatedUser,
  onCompleteToDashboard,
}) => {
  const initialSession = useMemo(() => loadTempOnboardingSession(), []);

  const [stage, setStage] = useState<OnboardingStage>(
    initialStage
      ? initialStage
      : initialAuthMode === 'signin'
        ? 'auth'
        : initialSession.stage === 'dashboard'
          ? 'welcome'
          : initialSession.stage
  );
  const [authMode, setAuthMode] = useState<'signup' | 'signin'>(initialAuthMode || 'signup');
  const [answers, setAnswers] = useState<AnswerMap>(initialSession.answers);
  const [questionIndex, setQuestionIndex] = useState<number>(
    initialSession.currentQuestionIndex
  );
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    saveTempOnboardingSession({
      stage,
      answers,
      currentQuestionIndex: questionIndex,
      updatedAt: new Date().toISOString(),
    });
  }, [stage, answers, questionIndex]);

  const clampedIndex = Math.min(Math.max(0, questionIndex), BASIC_QUESTIONS.length - 1);
  const currentQuestion = BASIC_QUESTIONS[clampedIndex];
  const isComplete = useMemo(() => isBasicOnboardingComplete(answers), [answers]);

  const handleUpdateAnswer = (qId: string, val: AnswerValue) => {
    setAnswers((prev) => ({ ...prev, [qId]: val }));
    setValidationError(null);
  };

  const handleContinueQuestion = () => {
    if (!currentQuestion) return;
    const validation = validateQuestionAnswer(currentQuestion, answers[currentQuestion.id]);
    if (!validation.valid) {
      setValidationError(validation.error || 'Please answer this question to continue.');
      return;
    }

    if (clampedIndex < BASIC_QUESTIONS.length - 1) {
      setQuestionIndex(clampedIndex + 1);
      setValidationError(null);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (authenticatedUser) {
      onCompleteToDashboard({ user: authenticatedUser, answers });
    } else {
      setAuthMode('signup');
      setStage('auth');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleBackQuestion = () => {
    setValidationError(null);
    if (clampedIndex > 0) {
      setQuestionIndex(clampedIndex - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      setStage('welcome');
    }
  };

  if (stage === 'welcome') {
    return (
      <WelcomeScreen
        onGetStarted={() => {
          setQuestionIndex(0);
          setStage('questionnaire');
          window.scrollTo({ top: 0 });
        }}
        onSignInExisting={() => {
          setAuthMode('signin');
          setStage('auth');
          window.scrollTo({ top: 0 });
        }}
      />
    );
  }

  if (stage === 'auth') {
    return (
      <AuthGateScreen
        onboardingComplete={isComplete}
        initialMode={authMode}
        onBack={() => {
          if (isComplete) {
            setQuestionIndex(BASIC_QUESTIONS.length - 1);
            setStage('questionnaire');
          } else {
            setStage('welcome');
          }
        }}
        onAuthenticated={(user) => {
          onCompleteToDashboard({ user, answers });
        }}
      />
    );
  }

  const progressPercent = Math.round(((clampedIndex + 1) / BASIC_QUESTIONS.length) * 100);

  return (
    <OnboardingLayout
      titleDark={currentQuestion.titleDark}
      titleMuted={currentQuestion.titleMuted}
      sectionLabel={`Question ${clampedIndex + 1} of ${BASIC_QUESTIONS.length}`}
      progressPercent={progressPercent}
      onBack={handleBackQuestion}
      primaryLabel={
        clampedIndex === BASIC_QUESTIONS.length - 1 ? 'Create Account & Continue' : 'Continue'
      }
      onPrimaryClick={handleContinueQuestion}
    >
      <QuestionRenderer
        question={currentQuestion}
        value={answers[currentQuestion.id]}
        onChange={(val) => handleUpdateAnswer(currentQuestion.id, val)}
        error={validationError}
      />
    </OnboardingLayout>
  );
};
