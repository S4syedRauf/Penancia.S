import { AlertTriangle, CheckCircle2, FileSearch, Microscope, ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';
import type { SemenReport } from '../../utils/semenReport';

interface SemenAnalysisReportProps {
  report: SemenReport;
  candidateDetected: boolean;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-2.5 last:border-0">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="text-right text-sm font-semibold text-slate-800">{value}</dd>
    </div>
  );
}

function ReportSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="min-w-0">
      <h3 className="mb-2 border-b-2 border-teal-100 pb-2 text-sm font-bold text-slate-900">{title}</h3>
      <dl>{children}</dl>
    </section>
  );
}

export function SemenAnalysisReport({ report, candidateDetected }: SemenAnalysisReportProps) {
  const isAr = report.language === 'ar';
  // Only show heuristic morphology fields if they contain actual measurements
  const showHeuristic = report.candidate.morphology !== (isAr ? 'غير متاح في هذا الوضع' : 'Not available in this mode');
  return (
    <article aria-labelledby="semen-report-title" className="overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm">
      <header className="bg-[#102d3d] p-5 text-white sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs font-bold tracking-[0.2em] text-teal-300">PANACEA</div>
            <h2 id="semen-report-title" className="mt-2 text-xl font-bold sm:text-2xl">{report.title}</h2>
            <p className="mt-1 text-xs text-slate-300">{new Date(report.generatedAt).toLocaleString(isAr ? 'ar-AE' : 'en-AE')} · {report.reportId}</p>
          </div>
          <span className="rounded-full border border-teal-300/60 px-3 py-1 text-[11px] font-bold text-teal-100">{isAr ? 'أولي • بحثي فقط' : 'PRELIMINARY · RESEARCH ONLY'}</span>
        </div>
      </header>

      <div className="space-y-6 p-5 sm:p-7">
        <div role="note" className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-900">
          <AlertTriangle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" /><p>{report.disclaimer}</p>
        </div>
        {report.demonstration && <div className="rounded-lg border border-slate-300 bg-slate-100 p-3 text-sm font-semibold text-slate-700">{isAr ? 'بيانات نموذج تجريبي — ليست نتيجة مريض.' : 'Demonstration fixture data — not a patient result.'}</div>}

        {report.source.imageDataUrl && (
          <figure className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
            <img src={report.source.imageDataUrl} alt={isAr ? 'الصورة المحللة مع تحديد البنية المقاسة' : 'Analyzed frame with the measured structure outlined'} className="max-h-96 w-full object-contain" />
            <figcaption className="flex items-center gap-2 border-t border-slate-200 px-4 py-2 text-xs text-slate-500"><FileSearch aria-hidden="true" className="h-4 w-4" />{isAr ? 'المستطيل الأخضر يحدد البنية الوحيدة المستخدمة في القياسات.' : 'The green outline identifies the single structure used for the measurements below.'}</figcaption>
          </figure>
        )}

        <section aria-labelledby="finding-title" className={`rounded-xl border p-4 ${candidateDetected ? 'border-teal-200 bg-teal-50' : 'border-slate-200 bg-slate-50'}`}>
          <div className="flex items-start gap-3">
            {candidateDetected ? <CheckCircle2 aria-hidden="true" className="mt-0.5 h-6 w-6 shrink-0 text-teal-700" /> : <FileSearch aria-hidden="true" className="mt-0.5 h-6 w-6 shrink-0 text-slate-500" />}
            <div><h3 id="finding-title" className="font-bold text-slate-900">{report.candidate.status}</h3><p className="mt-1 text-sm leading-relaxed text-slate-600">{report.summary}</p></div>
          </div>
        </section>
        <div className="grid gap-6 md:grid-cols-2">
          <ReportSection title={isAr ? 'مصدر الصورة' : 'Image source'}>
            <DetailRow label={isAr ? 'الملف' : 'Source file'} value={report.source.fileName} />
            <DetailRow label={isAr ? 'النوع' : 'Source type'} value={report.source.kind} />
            <DetailRow label={isAr ? 'الأبعاد' : 'Dimensions'} value={report.capture.dimensions} />
          </ReportSection>
          <ReportSection title={isAr ? 'جودة الالتقاط المقاسة' : 'Measured capture quality'}>
            <DetailRow label={isAr ? 'تباين التركيز' : 'Focus variance'} value={report.capture.focusVariance} />
            <DetailRow label={isAr ? 'الاقتطاع الداكن' : 'Dark clipping'} value={report.capture.darkClipping} />
            <DetailRow label={isAr ? 'الاقتطاع الساطع' : 'Bright clipping'} value={report.capture.brightClipping} />
          </ReportSection>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <ReportSection title={isAr ? 'قياسات البنية المحددة' : 'Measured structure'}>
            <DetailRow label={isAr ? 'الفئة الشكلية المبدئية' : 'Preliminary shape category'} value={report.candidate.morphology} />
            {showHeuristic && (
              <>
                <DetailRow label={isAr ? 'الطول التقديري' : 'Estimated head length'} value={report.candidate.headLength} />
                <DetailRow label={isAr ? 'العرض التقديري' : 'Estimated head width'} value={report.candidate.headWidth} />
                <DetailRow label={isAr ? 'نسبة الطول للعرض' : 'Length / width'} value={report.candidate.lengthToWidthRatio} />
                <DetailRow label={isAr ? 'الأكروسوم التقديري' : 'Estimated acrosome'} value={report.candidate.acrosomeCoverage} />
              </>
            )}
          </ReportSection>
          <ReportSection title={isAr ? 'قياسات غير متاحة من هذه الصورة' : 'Not available from this image'}>
            <DetailRow label={isAr ? 'التركيز' : 'Sperm concentration'} value={report.notAssessed.concentration} />
            <DetailRow label={isAr ? 'الحركة' : 'Motility'} value={report.notAssessed.motility} />
            <DetailRow label={isAr ? 'الحيوية' : 'Vitality'} value={report.notAssessed.vitality} />
            <DetailRow label={isAr ? 'التحليل السريري الكامل' : 'Full clinical analysis'} value={report.notAssessed.fullSemenAnalysis} />
          </ReportSection>
        </div>

        <div className="rounded-lg bg-slate-50 p-4">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-800"><Microscope aria-hidden="true" className="h-4 w-4 text-teal-700" />{isAr ? 'المعايرة وحدود التقرير' : 'Calibration and report limitations'}</div>
          <p className="mt-2 text-sm text-slate-600">{report.capture.calibration}</p>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-slate-600 rtl:pl-0 rtl:pr-5">{report.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul>
        </div>

        <div className="flex gap-3 rounded-lg border border-blue-100 bg-blue-50 p-4">
          <ShieldCheck aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" />
          <div><h3 className="text-sm font-bold text-blue-950">{isAr ? 'الخطوة الموصى بها' : 'Recommended next step'}</h3><p className="mt-1 text-sm text-blue-900">{report.nextStep}</p></div>
        </div>

        <div className="border-t border-slate-200 pt-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">SHA-256 · {isAr ? 'بصمة الملف الأصلي' : 'Original file fingerprint'}</div>
          <code className="mt-1 block break-all text-[11px] leading-relaxed text-slate-500">{report.source.sha256}</code>
        </div>
      </div>
    </article>
  );
}
