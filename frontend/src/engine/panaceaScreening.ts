import { PANACEA_QUESTIONNAIRE_26, QUESTIONNAIRE_DEFINITION_VERSION } from '../data/panaceaCatalogs';
import type {
  PlanActionStatus,
  QuestionnaireResponseRow,
  ScreeningRun,
  VaultReport,
} from '../types/panacea';

export function calculateDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; // km
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function getAnswerValue(
  responses: QuestionnaireResponseRow[],
  questionId: string
): { value: string | string[] | null; status: QuestionnaireResponseRow['status'] } {
  const found = responses.find((r) => r.questionId === questionId);
  if (!found) return { value: null, status: 'not_answered' };
  return { value: found.answerJson, status: found.status };
}

export function isQuestionVisible(
  questionId: string,
  responses: QuestionnaireResponseRow[]
): boolean {
  const q = PANACEA_QUESTIONNAIRE_26.find((item) => item.id === questionId);
  if (!q) return false;
  if (!q.conditionalOn) return true;
  const parent = getAnswerValue(responses, q.conditionalOn.questionId);
  if (parent.status !== 'answered' || parent.value === null) return false;
  if (Array.isArray(parent.value)) {
    return parent.value.some((v) => q.conditionalOn!.values.includes(v));
  }
  return q.conditionalOn.values.includes(parent.value);
}

/**
 * Offline conservative emergency rule check (Blueprint Part 6.2).
 * Never depends on remote LLM or network connectivity.
 */
export function hasUrgentEmergencyTrigger(responses: QuestionnaireResponseRow[]): boolean {
  const q1 = getAnswerValue(responses, 'Q1');
  const q2 = getAnswerValue(responses, 'Q2');
  const q3 = getAnswerValue(responses, 'Q3');
  const q4 = getAnswerValue(responses, 'Q4');
  return (
    (q1.status === 'answered' && q1.value === 'Yes') ||
    (q2.status === 'answered' && q2.value === 'Yes') ||
    (q3.status === 'answered' && q3.value === 'Yes') ||
    (q4.status === 'answered' && q4.value === 'Yes')
  );
}

/**
 * Deterministic 4-pathway routing engine (Blueprint Part 6.3).
 * Never assigns a 1-100 fertility score; never consumes unconfirmed OCR values.
 */
export function evaluatePanaceaPathways(params: {
  responses: QuestionnaireResponseRow[];
  confirmedReports: VaultReport[];
}): ScreeningRun {
  const { responses, confirmedReports } = params;
  const used: string[] = [];
  const missing: string[] = [];
  const reasonCodes: string[] = [];

  const get = (id: string) => getAnswerValue(responses, id);

  const visibleQuestions = PANACEA_QUESTIONNAIRE_26.filter((q) => isQuestionVisible(q.id, responses));
  for (const q of visibleQuestions) {
    const row = get(q.id);
    if (row.status === 'answered') {
      used.push(`${q.id}: ${Array.isArray(row.value) ? row.value.join(', ') : row.value}`);
    } else if (row.status === 'prefer_not_to_say') {
      missing.push(`${q.id} (Prefer not to say — kept unknown)`);
    } else if (row.status === 'not_sure') {
      missing.push(`${q.id} (Not sure — kept unknown)`);
    } else {
      missing.push(`${q.id} (Not answered)`);
    }
  }

  // Confirmed lab reports ONLY (Part 8.3: unconfirmed OCR never enters rules)
  const verifiedReports = confirmedReports.filter((r) => r.state === 'Summarised' && r.summary);
  let hasAbnormalConfirmedLab = false;
  for (const rep of verifiedReports) {
    if (!rep.summary) continue;
    const confirmedVals = rep.summary.values.filter((v) => v.confirmed_by_user);
    if (confirmedVals.length > 0) {
      used.push(`Confirmed Lab Report (${rep.summary.report_date})`);
    }
    if (confirmedVals.some((v) => v.flag === 'low' || v.flag === 'high')) {
      hasAbnormalConfirmedLab = true;
    }
  }

  const baseId = `scr_${Date.now()}`;
  const createdAt = new Date().toISOString();

  // Pathway 4: URGENT
  if (hasUrgentEmergencyTrigger(responses)) {
    reasonCodes.push('URGENT_SCROTAL_OR_HEMATURIA_TRIGGER');
    return {
      runId: baseId,
      ruleVersion: `${QUESTIONNAIRE_DEFINITION_VERSION}-rules-v2.0`,
      pathway: 'urgent',
      urgency: 'Urgent',
      titleEn: 'Urgent Clinical Evaluation',
      titleAr: 'تقييم طبي عاجل فوراً',
      reasonEn:
        'An urgent symptom response (sudden severe pain, new swelling/lump, groin injury, or blood) bypassed routine screening. Seek emergency or urgent urology care today.',
      reasonAr:
        'توجد إجابة عرض عاجل (ألم شديد مفاجئ أو تورم جديد أو إصابة أو دم). يُرجى التوجه للطوارئ أو عيادة المسالك البولية اليوم أو الاتصال على ٩٩٨.',
      reasonCodes,
      used: used.slice(0, 6),
      missing: missing.slice(0, 4),
      nextActionEn: 'Call UAE 998 or go to an urgent urology / emergency centre now',
      nextActionAr: 'اتصل على ٩٩٨ أو توجه لأقرب مركز طوارئ مسالك بولية الآن',
      nextActionView: 'lab-booking',
      urgentTriggered: true,
      createdAt,
    };
  }

  // Pathway 3: ANDROLOGY / UROLOGY
  const trying12m = get('Q7').value === '12+ months';
  const varicocele = get('Q8').value === 'Varicocele' || get('Q8').value === 'Surgery/Undescended';
  const priorAbnormalSemen = get('Q10').value === 'Abnormal';
  const hormoneUse = get('Q12').value === 'Yes' || get('Q12').value === 'Past 6m';

  if (trying12m || varicocele || priorAbnormalSemen || hormoneUse || hasAbnormalConfirmedLab) {
    if (trying12m) reasonCodes.push('TRYING_12M_PLUS');
    if (varicocele) reasonCodes.push('VARICOCELE_OR_SURGERY_HISTORY');
    if (priorAbnormalSemen) reasonCodes.push('PRIOR_ABNORMAL_SEMEN_HISTORY');
    if (hormoneUse) reasonCodes.push('EXOGENOUS_HORMONE_EXPOSURE');
    if (hasAbnormalConfirmedLab) reasonCodes.push('CONFIRMED_ABNORMAL_LAB_VALUE');

    return {
      runId: baseId,
      ruleVersion: `${QUESTIONNAIRE_DEFINITION_VERSION}-rules-v2.0`,
      pathway: 'andrology',
      urgency: 'Timely',
      titleEn: 'Andrology / Urology + Lab Route',
      titleAr: 'مسار الذكورة والمسالك مع تحليل مخبري',
      reasonEn:
        'Based on your clinical history or confirmed lab rows (such as 12+ months trying, varicocele/surgery, hormone use, or out-of-range lab values), booking a diagnostic semen analysis and specialist review is suggested.',
      reasonAr:
        'بناءً على التاريخ المسجل أو القيم المخبرية المؤكدة، يُنصح بحجز تحليل السائل المنوي المخبري ومراجعة أخصائي المسالك البولية والذكورة.',
      reasonCodes,
      used: used.slice(0, 6),
      missing: missing.slice(0, 4),
      nextActionEn: 'Book Diagnostic Semen Analysis (Dubai Fixture)',
      nextActionAr: 'حجز تحليل السائل المنوي المخبري',
      nextActionView: 'lab-booking',
      urgentTriggered: false,
      createdAt,
    };
  }

  // Pathway 2: PRIMARY CARE
  const urinarySymptoms = get('Q5').value === 'Yes' || get('Q5').value === 'Occasional';
  const recentFever = get('Q11').value === 'Yes';
  const regularMeds = get('Q13').value === 'Yes';
  const chronicCond = get('Q9').status === 'answered' && get('Q9').value !== 'None';

  if (urinarySymptoms || recentFever || regularMeds || chronicCond) {
    if (urinarySymptoms) reasonCodes.push('URINARY_OR_EJACULATION_SYMPTOM');
    if (recentFever) reasonCodes.push('RECENT_FEVER_TIMING');
    if (regularMeds) reasonCodes.push('PRESCRIPTION_MED_REVIEW');
    if (chronicCond) reasonCodes.push('METABOLIC_OR_THYROID_CONTEXT');

    return {
      runId: baseId,
      ruleVersion: `${QUESTIONNAIRE_DEFINITION_VERSION}-rules-v2.0`,
      pathway: 'primary_care',
      urgency: 'Timely',
      titleEn: 'Primary Care Review + Baseline Test Option',
      titleAr: 'مراجعة الرعاية الأولية مع خيار الفحص الأساسي',
      reasonEn:
        'Mild urinary symptoms, recent high fever, regular medicines, or chronic conditions are best discussed with primary care alongside an optional baseline diagnostic semen analysis.',
      reasonAr:
        'الأعراض البولية الخفيفة أو الحمى الحديثة أو الأدوية المنتظمة يُستحسن مناقشتها مع طبيب الرعاية الأولية مع إمكانية إجراء فحص أساسي.',
      reasonCodes,
      used: used.slice(0, 6),
      missing: missing.slice(0, 4),
      nextActionEn: 'Review Lab Options or Upload Existing Report',
      nextActionAr: 'استعراض خيارات المختبر أو رفع تقرير حالي',
      nextActionView: 'lab-booking',
      urgentTriggered: false,
      createdAt,
    };
  }

  // Pathway 1: SELF-CARE / BASELINE EDUCATION
  reasonCodes.push('BASELINE_ROUTINE_PATHWAY');
  return {
    runId: baseId,
    ruleVersion: `${QUESTIONNAIRE_DEFINITION_VERSION}-rules-v2.0`,
    pathway: 'self_care',
    urgency: 'Routine',
    titleEn: 'Baseline Education & Optional Test',
    titleAr: 'التثقيف الأساسي وخيار الفحص المخبري',
    reasonEn:
      'No urgent or specialist-triggering red flags were entered. You can follow a flexible habit plan (74-day default) and book a baseline diagnostic semen analysis if you want confirmed lab numbers.',
    reasonAr:
      'لا توجد علامات إنذار عاجلة فيما أُدخل. يمكنك اتباع خطة العادات اليومية المرنة (٧٤ يوماً افتراضياً) أو حجز فحص مخبري أساسي متى رغبت.',
    reasonCodes,
    used: used.slice(0, 6),
    missing: missing.slice(0, 4),
    nextActionEn: 'Explore Flexible Habit Plan or Book Baseline Lab',
    nextActionAr: 'متابعة خطة العادات أو حجز فحص أساسي',
    nextActionView: 'lab-booking',
    urgentTriggered: false,
    createdAt,
  };
}

/**
 * Blueprint Part 11.4: consistency_percent = completed_eligible / scheduled_eligible * 100
 * Excludes paused actions. Never reports 100% when scheduled_eligible == 0.
 */
export function calculatePlanConsistency(
  actionStates: Array<{ status: PlanActionStatus }>
): { completed: number; eligible: number; percent: number; statusLabel: 'not_started' | 'active' } {
  const eligibleItems = actionStates.filter((a) => a.status !== 'paused');
  const eligible = eligibleItems.length;
  const completed = eligibleItems.filter((a) => a.status === 'done').length;

  if (eligible === 0) {
    return { completed: 0, eligible: 0, percent: 0, statusLabel: 'not_started' };
  }

  const percent = Math.round((completed / eligible) * 100);
  return { completed, eligible, percent, statusLabel: 'active' };
}
