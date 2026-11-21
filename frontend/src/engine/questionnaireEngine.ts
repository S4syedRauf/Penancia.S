import { BASIC_QUESTIONS } from '../questionnaires';
import { AnswerMap, AnswerValue, QuestionDefinition } from '../types/questionnaire';

export function isAnswerFilled(value: AnswerValue | undefined): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return !Number.isNaN(value);
  return false;
}

export function validateQuestionAnswer(
  question: QuestionDefinition,
  value: AnswerValue | undefined
): { valid: boolean; error?: string } {
  if (!isAnswerFilled(value)) {
    return { valid: false, error: 'Please provide an answer to continue.' };
  }

  if (question.inputType === 'numeric') {
    const num = Number(value);
    if (Number.isNaN(num)) {
      return { valid: false, error: 'Please enter a valid number.' };
    }
    if (question.min !== undefined && num < question.min) {
      return {
        valid: false,
        error: `Please enter at least ${question.min} ${question.unit || ''}.`.trim(),
      };
    }
    if (question.max !== undefined && num > question.max) {
      return {
        valid: false,
        error: `Please enter at most ${question.max} ${question.unit || ''}.`.trim(),
      };
    }
  }

  return { valid: true };
}

export function isBasicOnboardingComplete(answers: AnswerMap): boolean {
  return BASIC_QUESTIONS.every((q) => validateQuestionAnswer(q, answers[q.id]).valid);
}
