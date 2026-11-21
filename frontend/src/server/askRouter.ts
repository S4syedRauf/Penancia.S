import { HEALTH_LIBRARY_ARTICLES } from '../data/panaceaCatalogs.ts';
import type {
  AskActionButton,
  LabOrder,
  Language,
  ScreeningRun,
  SemenSessionRun,
  SubView,
  VaultReport,
  WearableDailyMetric,
} from '../types/panacea.ts';
import { getServerGeminiClient } from './geminiClient.ts';

export interface PanaceaFeatureEntry {
  code: string;
  titleEn: string;
  titleAr: string;
  view: SubView;
  description: string;
}

export const PANACEA_FEATURES_CATALOGUE: PanaceaFeatureEntry[] = [
  {
    code: 'HEALTH_CHECK',
    titleEn: 'Open 26-Question Health Check',
    titleAr: 'فتح التقييم الصحي (٢٦ سؤالاً)',
    view: 'health-check',
    description: 'Adaptive 5-block reproductive intake with deterministic 4-pathway routing.',
  },
  {
    code: 'REPORT_VAULT',
    titleEn: 'Open Report Vault & OCR',
    titleAr: 'فتح خزنة التقارير',
    view: 'report-vault',
    description: 'Private upload with quarantine scan, PII masking, and mandatory confirmation.',
  },
  {
    code: 'LAB_BOOKING',
    titleEn: 'Open Lab Booking (5 km)',
    titleAr: 'فتح حجز المختبر (٥ كم)',
    view: 'lab-booking',
    description: 'Dubai-first verified fixture, 5.000 km boundary check, ConsentPack, and ticket.',
  },
  {
    code: 'SEMEN_PRESCREEN',
    titleEn: 'Open Home Pre-Screen (Research Mode)',
    titleAr: 'فتح الفحص المنزلي (وضع بحثي)',
    view: 'semen-prescreen',
    description: 'Supported optics check, calibration, capture quality gate, and research trace.',
  },
  {
    code: 'PARTNER_PORTAL',
    titleEn: 'Open Partner Staff Portal',
    titleAr: 'فتح بوابة موظفي المختبر',
    view: 'partner-portal',
    description: 'Restricted partner staff transitions, signed report delivery, and human follow-ups.',
  },
  {
    code: 'CONSENT_CENTRE',
    titleEn: 'Open Consent Centre',
    titleAr: 'فتح مركز الأذونات',
    view: 'consent-centre',
    description: 'Manage all 9 independent consents, export JSON/CSV, or delete records.',
  },
];

const URGENT_KEYWORDS = [
  'severe pain',
  'sudden pain',
  'testicular pain',
  'scrotal pain',
  'swelling',
  'swollen',
  'lump',
  'injury',
  'trauma',
  'blood in urine',
  'blood in semen',
  'self-harm',
  'suicide',
  'ألم شديد',
  'تورم',
  'دم',
  'إصابة',
];

export interface PanaceaAskContext {
  question: string;
  language: Language;
  llmMode: 'Full' | 'TemplatesOnly' | 'Off';
  reportsAiConsent: boolean;
  wearableReadConsent: boolean;
  latestScreening: ScreeningRun | null;
  latestSemen: SemenSessionRun | null;
  allReports: VaultReport[];
  latestOrder: LabOrder | null;
  consistencyCompleted: number;
  consistencyEligible: number;
  wearables: WearableDailyMetric[];
}

export async function handlePanaceaAskAgent(ctx: PanaceaAskContext): Promise<{
  text: string;
  sourceLabels: string[];
  buttons: AskActionButton[];
  urgentAlert: boolean;
  modeUsed: 'Full' | 'TemplatesOnly' | 'Off';
}> {
  const qLower = ctx.question.toLowerCase();
  const isAr = ctx.language === 'ar';

  // 1. Offline-capable Emergency Safety Router First (Blueprint Part 6.2 & 10.3)
  if (URGENT_KEYWORDS.some((kw) => qLower.includes(kw))) {
    return {
      text: isAr
        ? 'بسبب ذكر أعراض مثل الألم الشديد أو التورم أو الإصابة أو الدم، يُرجى عدم انتظار الفحص المنزلي أو الخطة اليومية. اتصل على ٩٩٨ للإسعاف في الإمارات أو توجه اليوم لقسم الطوارئ أو عيادة المسالك البولية.'
        : 'Because you mentioned symptoms such as sudden/severe pain, swelling, injury, or blood, do not wait for a home pre-screen or habit plan. Call UAE 998 for emergency transport or visit an urgent urology / emergency centre today.',
      sourceLabels: [isAr ? 'مسار الطوارئ المعتمد' : 'Approved Emergency Guidance'],
      buttons: [
        {
          code: 'LAB_BOOKING',
          labelEn: 'Urgent & Clinic Centres',
          labelAr: 'عرض المراكز العاجلة',
          view: 'lab-booking',
        },
      ],
      urgentAlert: true,
      modeUsed: 'TemplatesOnly',
    };
  }

  const navButtons: AskActionButton[] = [];
  const addBtn = (code: string, labelEn: string, labelAr: string, view: SubView) => {
    if (!navButtons.some((b) => b.code === code)) {
      navButtons.push({ code, labelEn, labelAr, view });
    }
  };

  // Explicit rule on Noon auto-order
  if (/auto.?order|order.*noon automatically|automatic.*noon/i.test(qLower)) {
    return {
      text: isAr
        ? 'الطلب التلقائي عبر نون ما زال «قريباً» وغير مفعّل. يمكنك استخدام أسماء البحث فقط في نون أو نسخ القائمة من قسم التغذية والفحوصات.'
        : 'Automatic ordering with Noon is marked "Coming Soon" and makes zero network calls. You can generate item-name-only Noon search links or copy the food list from Meals -> Nutrition & Noon.',
      sourceLabels: [isAr ? 'كتالوج ميزات باناسيا' : 'Panacea Feature Flags'],
      buttons: [],
      urgentAlert: false,
      modeUsed: 'TemplatesOnly',
    };
  }

  // Where is my sample / order status -> Never invent transit! (Blueprint Part 10.2)
  if (/where.*sample|order|specimen|ticket|pickup|tracker|عينة|طلب|موعد|مختبر/i.test(qLower)) {
    addBtn('LAB_BOOKING', 'Open Lab Booking & Ticket', 'فتح حجز المختبر والتذكرة', 'lab-booking');
    if (ctx.latestOrder) {
      const lastEvt = ctx.latestOrder.events[0];
      if (ctx.latestOrder.state === 'Collected') {
        return {
          text: isAr
            ? `أكد فريق الجمع استلام العينة للتذكرة ${ctx.latestOrder.ticketCode} بتاريخ ${lastEvt?.timestamp.slice(0, 16).replace('T', ' ')}؛ لم يؤكد المختبر الاستلام بعد.`
            : `The collector marked ticket ${ctx.latestOrder.ticketCode} as Collected at ${lastEvt?.timestamp.slice(0, 16).replace('T', ' ')}; the partner lab has not yet confirmed receipt.`,
          sourceLabels: [`Partner Event: ${ctx.latestOrder.state}`],
          buttons: navButtons,
          urgentAlert: false,
          modeUsed: 'TemplatesOnly',
        };
      }
      return {
        text: isAr
          ? `آخر حدث مؤكد للطلب ${ctx.latestOrder.ticketCode}: ${ctx.latestOrder.state} (${lastEvt?.timestamp.slice(0, 16).replace('T', ' ')}). باناسيا تعرض فقط أحداث الشريك المؤكدة.`
          : `Last confirmed partner event for ${ctx.latestOrder.ticketCode}: ${ctx.latestOrder.state} (${lastEvt?.timestamp.slice(0, 16).replace('T', ' ')}). Panacea displays partner-confirmed timestamps only and never invents transit progress.`,
        sourceLabels: [`Order ${ctx.latestOrder.ticketCode} · ${ctx.latestOrder.state}`],
        buttons: navButtons,
        urgentAlert: false,
        modeUsed: 'TemplatesOnly',
      };
    }
  }

  // Unconfirmed report values guard (Blueprint Part 8.3 & Part 15)
  const unconfirmedReport = ctx.allReports.find((r) => r.state === 'NeedsUserReview');
  const confirmedReports = ctx.allReports.filter((r) => r.state === 'Summarised' && r.summary);

  if (/report|lab|ocr|hormone|semen concentration|motility|تقرير|تقارير|خزنة|نتيجة/i.test(qLower)) {
    addBtn('REPORT_VAULT', 'Open Report Vault', 'فتح خزنة التقارير', 'report-vault');

    if (unconfirmedReport && confirmedReports.length === 0) {
      return {
        text: isAr
          ? `لديك مسودة تقرير (${unconfirmedReport.fileName}) بانتظار تأكيدك الإلزامي في خزنة التقارير. لا يمكن للمساعد اقتباس قيم OCR غير المؤكدة.`
          : `You have an unconfirmed OCR draft (${unconfirmedReport.fileName}) waiting for side-by-side review in Report Vault. Unconfirmed OCR values cannot be quoted or used by the assistant.`,
        sourceLabels: ['Report Vault Guard: NeedsUserReview'],
        buttons: navButtons,
        urgentAlert: false,
        modeUsed: 'TemplatesOnly',
      };
    }

    if (!ctx.reportsAiConsent) {
      return {
        text: isAr
          ? 'تقاريرك محفوظة بخصوصية في خزنة التقارير. إذن استخدام المساعد للتقارير المؤكدة (reports_ai) متوقف حالياً؛ يمكنك تفعيله من مركز الأذونات.'
          : 'Your confirmed reports remain safe in Report Vault. Assistant report access (`reports_ai`) is currently OFF — open Report Vault directly or enable it in Consent Centre.',
        sourceLabels: ['Consent check: reports_ai = OFF'],
        buttons: [
          ...navButtons,
          { code: 'CONSENT', labelEn: 'Consent Centre', labelAr: 'مركز الأذونات', view: 'consent-centre' },
        ],
        urgentAlert: false,
        modeUsed: 'TemplatesOnly',
      };
    }
  }

  if (/home|pre.?screen|lens|microscope|capture|منزلي|عدسة|مجهر/i.test(qLower)) {
    addBtn('SEMEN_PRESCREEN', 'Open Home Pre-Screen', 'فتح الفحص المنزلي', 'semen-prescreen');
  }
  if (/check|question|26|triage|pathway|استبيان|تقييم/i.test(qLower)) {
    addBtn('HEALTH_CHECK', 'Open 26-Q Health Check', 'فتح التقييم الصحي', 'health-check');
  }
  if (/consent|export|delete|privacy|language|إذن|حذف|تصدير/i.test(qLower)) {
    addBtn('CONSENT', 'Consent & Data Rights', 'الأذونات وحقوق البيانات', 'consent-centre');
  }

  // Build strict read-only de-identified context pack
  const sourceLabels: string[] = [];
  const contextParts: string[] = [];

  if (ctx.latestScreening) {
    sourceLabels.push(`Pathway (${ctx.latestScreening.ruleVersion})`);
    contextParts.push(
      `Deterministic care pathway: ${ctx.latestScreening.pathway} — ${ctx.latestScreening.titleEn}. Next action: ${ctx.latestScreening.nextActionEn}.`
    );
  }

  if (ctx.latestSemen) {
    sourceLabels.push(`Home Pre-Screen (${ctx.latestSemen.state})`);
    contextParts.push(
      `Latest Home Pre-Screen (Research Mode Only, non-diagnostic): ${ctx.latestSemen.qualitySummaryEn}`
    );
  }

  if (ctx.reportsAiConsent && confirmedReports.length > 0) {
    for (const rep of confirmedReports.slice(0, 2)) {
      if (!rep.summary) continue;
      sourceLabels.push(`Confirmed Report (${rep.summary.report_date})`);
      const rows = rep.summary.values
        .filter((v) => v.confirmed_by_user)
        .map(
          (v) =>
            `${v.test_name_as_written}: ${v.value} ${v.unit} (flag: ${v.flag}${
              v.ref_low !== null ? `, ref >= ${v.ref_low}` : ''
            }${v.ref_high !== null ? `, ref <= ${v.ref_high}` : ''}, page ${v.source_page})`
        )
        .join('; ');
      contextParts.push(
        `Confirmed Report ID ${rep.docId} dated ${rep.summary.report_date} (${rep.summary.lab_name_as_written || 'lab'}): ${rows}`
      );
    }
  }

  if (ctx.wearableReadConsent && ctx.wearables.length > 0) {
    const w = ctx.wearables[0];
    sourceLabels.push(`Wearable Habit (${w.source})`);
    contextParts.push(
      `Latest wearable summary (${w.localDate}): sleep ${w.sleepHours ?? 'NULL'}h, RHR ${w.restingHrBpm ?? 'NULL'} bpm, steps ${w.steps ?? 'NULL'}. Wearables track habits only, never fertility.`
    );
  }

  const pct =
    ctx.consistencyEligible > 0
      ? Math.round((ctx.consistencyCompleted / ctx.consistencyEligible) * 100)
      : 0;

  const buildTemplateResponse = (): string => {
    if (ctx.reportsAiConsent && confirmedReports.length > 0 && /report|value|conc|motil|hormone|تقرير|قيمة|نتيجة/i.test(qLower)) {
      const latest = confirmedReports[0];
      if (latest.summary) {
        const lineText = latest.summary.values
          .filter((v) => v.confirmed_by_user)
          .map(
            (v) =>
              `${v.test_name_as_written}: ${v.value} ${v.unit} (Ref ${v.ref_low ?? '—'}–${v.ref_high ?? '—'}, Page ${v.source_page})`
          )
          .join(' | ');
        return isAr
          ? `من تقريرك المؤكد بتاريخ ${latest.summary.report_date} (${latest.docId}): ${lineText}. يُرجى مناقشة هذه القيم مع طبيبك دون استنتاج تشخيص ذاتي.`
          : `From your confirmed lab report (${latest.summary.report_date}, ${latest.docId}): ${lineText}. Discuss these source-backed figures directly with your clinician.`;
      }
    }

    if (/home|pre.?screen|sperm|count|motility|منزلي|سائل/i.test(qLower)) {
      return isAr
        ? 'المسار المنزلي في باناسيا يعمل في الوضع البحثي فقط ويعرض حالة جودة التصوير ولا يعرض أرقاماً أو تشخيصاً. للحصول على تقرير سريري معتمد استخدم حجز المختبر.'
        : 'Panacea Home Pre-Screen runs in Research Mode Only, focuses on optical capture quality, and never exposes numeric sperm estimates to patients. Use Lab Booking for a signed clinical report.';
    }

    if (/plan|74|consistency|day|خطة|٧٤|التزام/i.test(qLower)) {
      return isAr
        ? `نسبة التزام الخطة الحالية: ${pct}% (${ctx.consistencyCompleted}/${ctx.consistencyEligible} إجراء). هذا يقيس تنفيذ العادات فقط ولا يقيس الخصوبة أو يغني عن الفحص.`
        : `Your current plan consistency is ${pct}% (${ctx.consistencyCompleted}/${ctx.consistencyEligible} eligible actions). This measures habit completion only — never sperm quality, fertility, or whether you can skip a test.`;
    }

    const article = HEALTH_LIBRARY_ARTICLES[0];
    return isAr
      ? `${article.titleAr}: ${article.summaryAr} (المصدر: ${article.sourceCitation})`
      : `${article.titleEn}: ${article.summaryEn} (Plan consistency: ${pct}%, ${ctx.consistencyCompleted}/${ctx.consistencyEligible} actions). Ask about a confirmed report, lab booking status, or 26-Q pathways.`;
  };

  const ai = getServerGeminiClient();
  if (ctx.llmMode !== 'Full' || !ai) {
    return {
      text: buildTemplateResponse(),
      sourceLabels: sourceLabels.length > 0 ? sourceLabels : ['Panacea Reviewed Templates'],
      buttons: navButtons,
      urgentAlert: false,
      modeUsed: ctx.llmMode === 'Off' ? 'Off' : 'TemplatesOnly',
    };
  }

  try {
    const systemInstruction = `You are the Constrained Ask Assistant inside Panacea (Developed with love by Syed).
NON-NEGOTIABLE GUARDRAILS:
1. Respond in ${isAr ? 'Arabic' : 'English'} in under 85 words.
2. NEVER diagnose, prescribe medications/supplements, say "you are fertile/infertile", or recommend skipping a lab test.
3. NEVER output numeric sperm concentration, motility percentages, or velocities from a Home Pre-Screen.
4. You may quote exact lab values ONLY from the Confirmed Reports listed below, and you MUST include the exact report date and unit.
5. Describe the 74-day default plan only as a flexible habit plan, NEVER as "one sperm cycle" or biological proof.
6. Never invent order transit/ETA not present in confirmed order events.

CONFIRMED READ-ONLY CONTEXT:
${contextParts.length > 0 ? contextParts.join('\n') : 'No confirmed reports uploaded yet.'}
Plan consistency (effort only): ${ctx.consistencyCompleted}/${ctx.consistencyEligible} (${pct}%).`;

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: ctx.question,
      config: { systemInstruction },
    });

    let answerText = (response.text || '').trim();
    const bannedClaim =
      /(you are infertile|you are fertile|100% accurate|prescribe|take \d+\s*mg|one sperm cycle|skip (your|a) lab test)/i;
    const leakedUnverifiedSpermNum =
      (!ctx.reportsAiConsent || confirmedReports.length === 0) &&
      /\b\d+(\.\d+)?\s*(million\/mL|M\/mL)\b/i.test(answerText);

    if (!answerText || bannedClaim.test(answerText) || leakedUnverifiedSpermNum) {
      answerText = buildTemplateResponse();
    }

    return {
      text: answerText,
      sourceLabels: sourceLabels.length > 0 ? sourceLabels : ['Panacea Scoped Read-Only Context'],
      buttons: navButtons,
      urgentAlert: false,
      modeUsed: 'Full',
    };
  } catch {
    return {
      text: buildTemplateResponse(),
      sourceLabels: sourceLabels.length > 0 ? sourceLabels : ['Panacea Templates Fallback'],
      buttons: navButtons,
      urgentAlert: false,
      modeUsed: 'TemplatesOnly',
    };
  }
}
