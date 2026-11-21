import { QUESTIONNAIRE_26 } from '../data/questionnaire26';
import {
  QuestionnaireResponseRow,
  ScreeningColour,
  ScreeningRun,
  ScreeningUrgency,
  SemenSessionRun,
  VaultReport,
} from '../types/sahatna';

export const SCREENING_RULE_VERSION = 'rules-v1.2-uae';

export function buildNoonSearchUrl(term: string, lang: 'en' | 'ar'): string {
  const regionPath = lang === 'ar' ? 'uae-ar' : 'uae-en';
  return `https://www.noon.com/${regionPath}/search/?q=${encodeURIComponent(term)}`;
}

export function hasUrgentQuestionnaireResponse(
  responses: Record<string, QuestionnaireResponseRow>
): boolean {
  const q1 = responses.Q1?.status === 'answered' && responses.Q1.answerJson === 'Yes';
  const q2 = responses.Q2?.status === 'answered' && responses.Q2.answerJson === 'Yes';
  const q3 = responses.Q3?.status === 'answered' && responses.Q3.answerJson === 'Yes';
  const q4 = responses.Q4?.status === 'answered' && responses.Q4.answerJson === 'Yes';
  return Boolean(q1 || q2 || q3 || q4);
}

/**
 * Deterministic versioned screening rules engine (Part 8.2 + Part 6.9).
 * Note: Wearable data NEVER changes a screening colour.
 * Missing information is tracked explicitly and never treated as "normal".
 */
export function evaluateDeterministicScreening(params: {
  userId: string;
  responses: Record<string, QuestionnaireResponseRow>;
  reports: VaultReport[];
  semenRuns: SemenSessionRun[];
}): ScreeningRun {
  const { userId, responses, reports, semenRuns } = params;

  const confirmedReports = reports.filter((r) => r.state === 'Summarised' && r.summary !== null);
  const realSemenRuns = semenRuns.filter((r) => !r.isDemo);

  const used: string[] = [];
  const missing: string[] = [];
  const reasonCodes: string[] = [];

  const answeredCount = Object.values(responses).filter((r) => r.status === 'answered').length;
  if (answeredCount > 0) {
    used.push(`Questionnaire (${answeredCount}/${QUESTIONNAIRE_26.length} answered)`);
  } else {
    missing.push('26-question reproductive health intake');
  }

  if (confirmedReports.length > 0) {
    used.push(`Confirmed lab reports (${confirmedReports.length})`);
  } else {
    missing.push('Confirmed laboratory report (optional)');
  }

  if (realSemenRuns.length > 0) {
    used.push(`Home semen pre-screens (${realSemenRuns.length})`);
  } else {
    missing.push('Home semen pre-screen run');
  }

  // 1. Check urgent symptoms (Red + Urgent)
  if (hasUrgentQuestionnaireResponse(responses)) {
    reasonCodes.push('URGENT_SYMPTOMS');
    return {
      runId: `scr_${Date.now()}`,
      userId,
      ruleVersion: SCREENING_RULE_VERSION,
      colour: 'red',
      urgency: 'Urgent',
      reasonEn:
        'You reported sudden pain, swelling, injury, or blood. Prompt medical evaluation is recommended before any home screening.',
      reasonAr:
        'تم الإبلاغ عن ألم مفاجئ أو تورم أو إصابة أو دم. يُنصح بتقييم طبي عاجل قبل أي فحص منزلي.',
      reasonCodes,
      used,
      missing,
      nextActionEn: 'Open Urgent Care & Clinic Directory',
      nextActionAr: 'فتح الرعاية العاجلة ودليل العيادات',
      nextActionRoute: 'care',
      urgentTriggered: true,
      createdAt: new Date().toISOString(),
    };
  }

  // 2. Check semen pre-screen Red triggers (Part 6.9)
  const validRuns = realSemenRuns.filter((r) => r.state === 'Completed');
  const twoLowConc =
    validRuns.slice(0, 2).length === 2 &&
    validRuns.slice(0, 2).every((r) => r.bandConc === 'Low');
  const twoLowMot =
    validRuns.slice(0, 2).length === 2 &&
    validRuns.slice(0, 2).every((r) => r.bandMotility === 'Low');
  const anyNoSperm = validRuns.some((r) => r.noSpermSeen);
  const twiceUnclear =
    validRuns.slice(0, 2).length === 2 &&
    validRuns
      .slice(0, 2)
      .every((r) => r.bandConc === 'Unclear' && r.bandMotility === 'Unclear');

  // Check confirmed abnormal lab values
  const hasConfirmedLowLab = confirmedReports.some((r) =>
    r.summary?.values.some((v) => v.confirmed_by_user && v.flag === 'low')
  );

  if (anyNoSperm || twoLowConc || twoLowMot || twiceUnclear) {
    reasonCodes.push(
      anyNoSperm
        ? 'NO_SPERM_SEEN'
        : twiceUnclear
          ? 'SEMEN_UNCLEAR_TWICE'
          : 'TWO_LOW_PRE_SCREEN_RUNS'
    );
    return {
      runId: `scr_${Date.now()}`,
      userId,
      ruleVersion: SCREENING_RULE_VERSION,
      colour: 'red',
      urgency: 'Timely',
      reasonEn: anyNoSperm
        ? 'No sperm were seen across fields in a pre-screen run. A clinical laboratory semen test is recommended.'
        : twiceUnclear
          ? 'Two home pre-screen runs ended Unclear. A diagnostic laboratory test can give you a clear baseline.'
          : 'Two home pre-screen runs placed a band in Low. Please see a clinician and book a laboratory test.',
      reasonAr: anyNoSperm
        ? 'لم يُرصد وجود حيوانات منوية في الفحص المنزلي. يُنصح بإجراء فحص مخبري دقيق.'
        : twiceUnclear
          ? 'انتهت محاولتان بنتيجة غير واضحة. الفحص المخبري يمنحك قراءة دقيقة.'
          : 'أظهر فحصان منزليان مؤشراً في النطاق المنخفض. يُنصح بمراجعة طبيب وحجز فحص مخبري.',
      reasonCodes,
      used,
      missing,
      nextActionEn: 'Book a Laboratory Test in Care Directory',
      nextActionAr: 'حجز فحص مخبري من دليل العيادات',
      nextActionRoute: 'care',
      urgentTriggered: false,
      createdAt: new Date().toISOString(),
    };
  }

  // 3. Yellow triggers (modifiable factors, recent fever, hormones, incomplete intake, 1 low/unclear run, lab flag)
  const yellowReasonsEn: string[] = [];
  const yellowReasonsAr: string[] = [];

  if (responses.Q12?.answerJson === 'Yes' || responses.Q12?.answerJson === 'Past 6m') {
    reasonCodes.push('HORMONE_THERAPY');
    yellowReasonsEn.push('recent hormone/testosterone therapy');
    yellowReasonsAr.push('استخدام التستوستيرون أو الهرمونات');
  }
  if (responses.Q11?.answerJson === 'Yes') {
    reasonCodes.push('RECENT_FEVER');
    yellowReasonsEn.push('high fever within 3 months');
    yellowReasonsAr.push('حمى شديدة خلال ٣ أشهر');
  }
  if (responses.Q14?.answerJson === 'Frequent') {
    reasonCodes.push('HEAT_EXPOSURE');
    yellowReasonsEn.push('frequent scrotal heat exposure');
    yellowReasonsAr.push('التعرض المتكرر للحرارة');
  }
  if (responses.Q17?.answerJson === 'Daily') {
    reasonCodes.push('DAILY_SMOKING');
    yellowReasonsEn.push('daily smoking or vaping');
    yellowReasonsAr.push('التدخين اليومي');
  }
  if (responses.Q8?.answerJson === 'Varicocele' || responses.Q10?.answerJson === 'Abnormal') {
    reasonCodes.push('HISTORY_FACTOR');
    yellowReasonsEn.push('prior varicocele or abnormal lab history');
    yellowReasonsAr.push('تاريخ دوالي أو فحص سابق غير معتاد');
  }
  if (hasConfirmedLowLab) {
    reasonCodes.push('CONFIRMED_LAB_LOW');
    yellowReasonsEn.push('a low value noted in your confirmed lab report');
    yellowReasonsAr.push('وجود قيمة منخفضة في تقريرك المخبري المؤكد');
  }

  const latestSemen = validRuns[0];
  if (
    latestSemen &&
    (latestSemen.bandConc !== 'Typical' || latestSemen.bandMotility !== 'Typical' || validRuns.length === 1)
  ) {
    reasonCodes.push('SINGLE_OR_NON_TYPICAL_SEMEN');
    yellowReasonsEn.push(
      latestSemen.bandConc === 'Typical' && latestSemen.bandMotility === 'Typical'
        ? 'only one home pre-screen run recorded so far (repeat in 1–2 weeks for confirmation)'
        : 'one home pre-screen band was Low or Unclear'
    );
    yellowReasonsAr.push('وجود فحص منزلي واحد أو نطاق منخفض/غير واضح يحتاج إعادة التحقق');
  }

  let colour: ScreeningColour = 'green';
  let urgency: ScreeningUrgency = 'Routine';

  if (yellowReasonsEn.length > 0 || answeredCount < 10) {
    colour = 'yellow';
    urgency = 'Timely';
    if (answeredCount < 10 && yellowReasonsEn.length === 0) {
      reasonCodes.push('INCOMPLETE_BASELINE');
      yellowReasonsEn.push('few baseline questions answered yet');
      yellowReasonsAr.push('اكتمال عدد قليل من أسئلة التقييم الأساسي');
    }
  }

  if (colour === 'yellow') {
    return {
      runId: `scr_${Date.now()}`,
      userId,
      ruleVersion: SCREENING_RULE_VERSION,
      colour: 'yellow',
      urgency,
      reasonEn: `A few factors to work on and recheck: ${yellowReasonsEn.join('; ')}. Follow your 74-day plan and consider a lab check or repeat pre-screen in 1–2 weeks.`,
      reasonAr: `توجد عوامل يُنصح بالعمل عليها وإعادة الفحص: ${yellowReasonsAr.join('؛ ')}. تابع خطة ٧٤ يوماً وفكّر في إعادة الفحص خلال ١–٢ أسبوع.`,
      reasonCodes,
      used,
      missing,
      nextActionEn: validRuns.length === 0 ? 'Start Guided Semen Pre-Screen' : 'View 74-Day Plan',
      nextActionAr: validRuns.length === 0 ? 'بدء الفحص المنزلي الموجّه' : 'عرض خطة ٧٤ يوماً',
      nextActionRoute: validRuns.length === 0 ? 'semen' : 'plan',
      urgentTriggered: false,
      createdAt: new Date().toISOString(),
    };
  }

  // Green: Both bands typical on valid runs (or solid intake with no red/yellow flags)
  reasonCodes.push('NO_CONCERNS_FROM_AVAILABLE_INFO');
  return {
    runId: `scr_${Date.now()}`,
    userId,
    ruleVersion: SCREENING_RULE_VERSION,
    colour: 'green',
    urgency: 'Routine',
    reasonEn:
      'No concerns found from the information available so far. Keep steady habits on your 74-day plan and repeat in 3 months or sooner if you worry.',
    reasonAr:
      'لا توجد مؤشرات مقلقة بناءً على المعلومات المتاحة حالياً. استمر في عادات خطة ٧٤ يوماً وأعد الفحص بعد ٣ أشهر أو عند الحاجة.',
    reasonCodes,
    used,
    missing,
    nextActionEn: 'Continue Today’s 74-Day Plan',
    nextActionAr: 'متابعة إجراءات خطة ٧٤ يوماً',
    nextActionRoute: 'plan',
    urgentTriggered: false,
    createdAt: new Date().toISOString(),
  };
}
