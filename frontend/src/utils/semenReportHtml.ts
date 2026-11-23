import type { SemenReport } from './semenReport';
import { SEMEN_REPORT_STYLES } from './semenReportStyles';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] || character);
}

function row(label: string, value: string): string {
  return `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`;
}

export function generateSemenReportHtml(report: SemenReport): string {
  const isAr = report.language === 'ar';
  const labels = isAr ? {
    source: 'مصدر الصورة', file: 'الملف', generated: 'تاريخ الإنشاء', candidate: 'نتيجة الرصد الآلي',
    morphology: 'الفئة الشكلية المبدئية', length: 'الطول التقديري للرأس', width: 'العرض التقديري للرأس',
    ratio: 'نسبة الطول إلى العرض', acrosome: 'التغطية التقديرية للأكروسوم', capture: 'جودة الالتقاط',
    dimensions: 'أبعاد الصورة', focus: 'تباين التركيز (لابلاسي)', dark: 'اقتطاع المناطق الداكنة',
    bright: 'اقتطاع المناطق الساطعة', calibration: 'المعايرة', unavailable: 'قياسات غير متاحة',
    concentration: 'التركيز', motility: 'الحركة', vitality: 'الحيوية', full: 'التحليل السريري الكامل',
    limitations: 'حدود هذا التقرير', next: 'الخطوة التالية', checksum: 'بصمة الملف SHA-256',
  } : {
    source: 'Image source', file: 'Source file', generated: 'Generated', candidate: 'Automated finding',
    morphology: 'Preliminary shape category', length: 'Estimated head length', width: 'Estimated head width',
    ratio: 'Length-to-width ratio', acrosome: 'Estimated acrosome coverage', capture: 'Capture quality',
    dimensions: 'Image dimensions', focus: 'Focus variance (Laplacian)', dark: 'Dark-pixel clipping',
    bright: 'Bright-pixel clipping', calibration: 'Calibration', unavailable: 'Not available from this image',
    concentration: 'Sperm concentration', motility: 'Motility', vitality: 'Vitality', full: 'Full clinical semen analysis',
    limitations: 'Report limitations', next: 'Recommended next step', checksum: 'Source SHA-256',
  };
  const image = report.source.imageDataUrl
    ? `<figure><img src="${escapeHtml(report.source.imageDataUrl)}" alt="Analyzed source frame"><figcaption>${isAr ? 'إطار المصدر مع تحديد البنية التي تم قياسها' : 'Source frame with the measured structure outlined'}</figcaption></figure>`
    : '';
  const demo = report.demonstration
    ? `<div class="demo">${isAr ? 'بيانات نموذج تجريبي — ليست نتيجة مريض.' : 'Demonstration fixture data — not a patient result.'}</div>`
    : '';
  const sourceRows = row(labels.file, report.source.fileName) + row(labels.source, report.source.kind);
  const captureRows = row(labels.dimensions, report.capture.dimensions) + row(labels.focus, report.capture.focusVariance)
    + row(labels.dark, report.capture.darkClipping) + row(labels.bright, report.capture.brightClipping);
  
  // Only show heuristic morphology fields if they contain actual measurements (not "Not measured")
  const notMeasuredAr = 'لم يُقس';
  const notMeasuredEn = 'Not measured';
  const showHeuristic = report.candidate.morphology !== (isAr ? 'غير متاح في هذا الوضع' : 'Not available in this mode');
  const candidateRows = showHeuristic
    ? row(labels.morphology, report.candidate.morphology) + row(labels.length, report.candidate.headLength)
      + row(labels.width, report.candidate.headWidth) + row(labels.ratio, report.candidate.lengthToWidthRatio)
      + row(labels.acrosome, report.candidate.acrosomeCoverage)
    : row(labels.morphology, report.candidate.morphology);
  
  const unavailableRows = row(labels.concentration, report.notAssessed.concentration)
    + row(labels.motility, report.notAssessed.motility) + row(labels.vitality, report.notAssessed.vitality)
    + row(labels.full, report.notAssessed.fullSemenAnalysis);

  return `<!doctype html><html lang="${report.language}" dir="${isAr ? 'rtl' : 'ltr'}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(report.title)}</title><style>${SEMEN_REPORT_STYLES}</style></head>
<body><article class="page"><header><div><div class="brand">PANACEA</div><h1>${escapeHtml(report.title)}</h1><div class="meta">${escapeHtml(labels.generated)}: ${escapeHtml(new Date(report.generatedAt).toLocaleString(isAr ? 'ar-AE' : 'en-AE'))}<br>ID: ${escapeHtml(report.reportId)}</div></div><div class="status">${isAr ? 'أولي • بحثي فقط' : 'PRELIMINARY • RESEARCH ONLY'}</div></header>
<main><div class="notice">${escapeHtml(report.disclaimer)}</div>${demo}${image}
<section class="finding"><strong>${escapeHtml(report.candidate.status)}</strong>${escapeHtml(report.summary)}</section>
<div class="grid"><section><h2>${labels.source}</h2><table>${sourceRows}</table></section><section><h2>${labels.capture}</h2><table>${captureRows}</table></section></div>
<div class="grid"><section><h2>${labels.candidate}</h2><table>${candidateRows}</table></section><section><h2>${labels.unavailable}</h2><table>${unavailableRows}</table></section></div>
<section><h2>${labels.calibration}</h2><p>${escapeHtml(report.capture.calibration)}</p></section>
<section><h2>${labels.limitations}</h2><ul>${report.limitations.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></section>
<section><h2>${labels.next}</h2><div class="next">${escapeHtml(report.nextStep)}</div></section>
<section><h2>${labels.checksum}</h2><div class="checksum">${escapeHtml(report.source.sha256)}</div></section></main>
<footer><span>Panacea • Image Screening</span><span>${escapeHtml(report.disclaimer)}</span></footer></article></body></html>`;
}

export function getSemenReportFileName(report: SemenReport): string {
  const safeId = report.reportId.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);
  return `panacea-image-report-${safeId}_${report.generatedAt.slice(0, 10)}.html`;
}

export function downloadSemenReport(report: SemenReport): void {
  const blob = new Blob([generateSemenReportHtml(report)], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = getSemenReportFileName(report);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function printSemenReport(report: SemenReport): void {
  const frame = document.createElement('iframe');
  frame.title = report.title;
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden';
  frame.srcdoc = generateSemenReportHtml(report);
  frame.onload = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    window.setTimeout(() => frame.remove(), 60_000);
  };
  document.body.appendChild(frame);
}
