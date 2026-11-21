import type { Language, SemenSessionRun } from '../types/panacea';
import type { ImageAnalysisResult } from './spermImageAnalyzer';

export interface SemenReport {
  language: Language;
  title: string;
  reportId: string;
  generatedAt: string;
  source: {
    kind: string;
    fileName: string;
    sha256: string;
    imageDataUrl?: string;
  };
  candidate: {
    status: string;
    morphology: string;
    headLength: string;
    headWidth: string;
    lengthToWidthRatio: string;
    acrosomeCoverage: string;
  };
  capture: {
    dimensions: string;
    focusVariance: string;
    darkClipping: string;
    brightClipping: string;
    calibration: string;
  };
  notAssessed: {
    concentration: string;
    motility: string;
    vitality: string;
    fullSemenAnalysis: string;
  };
  summary: string;
  limitations: string[];
  nextStep: string;
  disclaimer: string;
  demonstration: boolean;
}

const notMeasured = (language: Language) => language === 'ar' ? 'لم يُقس' : 'Not measured';
const notAssessed = (language: Language) => language === 'ar' ? 'لم يُقيّم' : 'Not assessed';
const format = (value: number, digits = 2) => Number.isFinite(value) ? value.toFixed(digits) : '—';

export function buildSemenReport(
  run: SemenSessionRun,
  analysis: ImageAnalysisResult,
  language: Language,
): SemenReport {
  const isAr = language === 'ar';
  const hasCandidate = analysis.cellDetected;
  const fileName = run.sampleMeta.sampleName || (isAr ? 'ملف مرفوع' : 'Uploaded media');
  const status = hasCandidate
    ? (isAr ? 'تم رصد بنية واحدة شبيهة بالخلية' : 'One cell-like structure detected')
    : (isAr ? 'لم يتم رصد بنية مؤهلة شبيهة بالخلية' : 'No eligible cell-like structure detected');

  return {
    language,
    title: isAr ? 'تقرير فحص صورة السائل المنوي' : 'Semen Image Screening Report',
    reportId: run.runId,
    generatedAt: run.createdAt,
    source: {
      kind: run.isDemo
        ? (isAr ? 'نموذج تجريبي' : 'Demonstration fixture')
        : (isAr ? 'صورة مرفوعة / إطار فيديو' : 'Uploaded image / video frame'),
      fileName,
      sha256: analysis.sha256,
      imageDataUrl: analysis.annotatedPreviewDataUrl,
    },
    candidate: {
      status,
      morphology: hasCandidate ? analysis.morphologyCategory : (isAr ? 'لا يمكن تقييمه' : 'Not assessable'),
      headLength: hasCandidate ? `${format(analysis.headLengthUm)} µm` : notMeasured(language),
      headWidth: hasCandidate ? `${format(analysis.headWidthUm)} µm` : notMeasured(language),
      lengthToWidthRatio: hasCandidate ? format(analysis.lengthToWidthRatio) : notMeasured(language),
      acrosomeCoverage: hasCandidate ? `${Math.round(analysis.acrosomeCoveragePct)}% ${isAr ? '(تقديري)' : '(estimated)'}` : notMeasured(language),
    },
    capture: {
      dimensions: `${analysis.width} × ${analysis.height} px`,
      focusVariance: format(analysis.focusVariance),
      darkClipping: `${format(analysis.clippedDarkPct)}%`,
      brightClipping: `${format(analysis.clippedBrightPct)}%`,
      calibration: isAr
        ? '0.05 ميكرومتر/بكسل (قيمة مفترضة؛ لم يتم التحقق منها بميكرومتر)'
        : '0.05 µm/px (assumed; not independently verified with a micrometer)',
    },
    notAssessed: {
      concentration: notAssessed(language),
      motility: notAssessed(language),
      vitality: notAssessed(language),
      fullSemenAnalysis: notAssessed(language),
    },
    summary: hasCandidate
      ? (isAr
        ? `تم قياس أكبر بنية أمامية في هذه الصورة. التصنيف الشكلي المبدئي هو ${analysis.morphologyCategory}. هذا وصف آلي لبنية واحدة وليس تصنيفاً سريرياً للحيوانات المنوية.`
        : `The largest segmented foreground structure in this image was measured. Its preliminary shape category is ${analysis.morphologyCategory}. This is an automated description of one structure, not a clinical sperm classification.`)
      : (isAr
        ? 'لم يعثر المسار الآلي على بنية مؤهلة في هذا الإطار. لا يعني ذلك عدم وجود حيوانات منوية في العينة؛ قد تكون الصورة غير مناسبة أو الخلايا خارج مجال التصوير.'
        : 'The automated pass did not find an eligible structure in this frame. This does not mean sperm are absent from the sample; the image may be unsuitable or cells may be outside the captured field.'),
    limitations: [
      isAr ? 'إطار واحد فقط؛ لم يتم إجراء عدّ منهجي عبر حقول متعددة.' : 'Single-frame analysis only; no systematic count across multiple fields was performed.',
      isAr ? 'لا يمكن قياس التركيز أو الحركة أو الحيوية من هذا الفحص.' : 'Concentration, motility, and vitality cannot be measured by this screening pass.',
      isAr ? 'الأبعاد تقريبية وتعتمد على معايرة بصرية صحيحة.' : 'Dimensions are estimates and depend on correct optical calibration.',
      isAr ? 'فئات الشكل والأكروسوم تقديرات هندسية ولونية غير معتمدة سريرياً.' : 'Shape and acrosome categories are unvalidated geometry/color estimates, not clinical findings.',
    ],
    nextStep: isAr
      ? 'للحصول على نتيجة سريرية، احجز تحليل سائل منوي معتمداً لدى مختبر مرخص.'
      : 'For a clinical result, book a complete semen analysis with a licensed laboratory.',
    disclaimer: isAr
      ? 'فحص صور أولي للبحث فقط. ليس تشخيصاً طبياً ولا تقرير تحليل سائل منوي معتمداً.'
      : 'Preliminary research image screening only. Not a medical diagnosis or a certified semen analysis report.',
    demonstration: run.isDemo,
  };
}

export { downloadSemenReport, generateSemenReportHtml, getSemenReportFileName, printSemenReport } from './semenReportHtml';
