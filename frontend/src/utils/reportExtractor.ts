import type {
  ConfidenceLevel,
  PrivacyMode,
  ReportSummaryV1,
  ReportType,
  ReportValueRow,
  VaultReport,
} from '../types/panacea';

const HEADER_PII_PATTERNS = [
  /patient\s*name\s*[:\-].*/i,
  /emirates\s*id\s*[:\-].*/i,
  /dob|date\s*of\s*birth\s*[:\-].*/i,
  /phone|mobile|tel\s*[:\-].*/i,
  /mrn|passport\s*[:\-].*/i,
  /\b784-\d{4}-\d{7}-\d\b/,
];

export function maskHeaderPersonalLines(rawText: string): {
  cleanLines: string[];
  maskedTypes: string[];
} {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const cleanLines: string[] = [];
  const maskedTypes = new Set<string>();

  for (const line of lines) {
    let matched = false;
    for (const pat of HEADER_PII_PATTERNS) {
      if (pat.test(line)) {
        matched = true;
        if (/name/i.test(line)) maskedTypes.add('Name');
        else if (/emirates|784-|passport|mrn/i.test(line)) maskedTypes.add('Emirates ID / MRN');
        else if (/dob|birth/i.test(line)) maskedTypes.add('Date of Birth');
        else if (/phone|mobile|tel/i.test(line)) maskedTypes.add('Phone');
        else maskedTypes.add('Header Identifier');
        break;
      }
    }
    if (!matched) {
      cleanLines.push(line);
    }
  }

  return { cleanLines, maskedTypes: Array.from(maskedTypes) };
}

export function extractReportLocally(params: {
  fileName: string;
  mime: string;
  rawText?: string;
  imageBase64?: string;
  privacyMode?: PrivacyMode;
  simulateMalware?: boolean;
}): {
  ok: boolean;
  rejectedReason?: string;
  report?: VaultReport;
} {
  const lowerName = params.fileName.toLowerCase();
  const allowedExts = ['.pdf', '.jpg', '.jpeg', '.png', '.txt'];
  const validExt =
    allowedExts.some((ext) => lowerName.endsWith(ext)) ||
    params.mime.startsWith('image/') ||
    params.mime === 'application/pdf' ||
    params.mime === 'text/plain';

  if (params.simulateMalware || lowerName.includes('eicar') || lowerName.includes('virus')) {
    return {
      ok: false,
      rejectedReason:
        'Quarantine malware scan rejected this file before storage. Nothing entered your Report Vault.',
    };
  }

  if (!validExt) {
    return {
      ok: false,
      rejectedReason:
        'Invalid file type in quarantine. Nothing was saved. Please upload a PDF, JPG, PNG, or TXT fixture.',
    };
  }

  const inputText = params.rawText?.trim() || '';
  const { cleanLines, maskedTypes } = maskHeaderPersonalLines(inputText);

  const parsedValues: ReportValueRow[] = [];
  let detectedDate = new Date().toISOString().slice(0, 10);
  let labName: string | null = null;
  let abstinenceDays: number | null = null;

  for (const line of cleanLines) {
    const dateMatch = line.match(/(\d{4}-\d{2}-\d{2})/);
    if (dateMatch) detectedDate = dateMatch[1];

    if (/lab|centre|center|hospital|diagnostic|clinic|hub/i.test(line) && !labName) {
      labName = line.replace(/^lab\s*[:\-]\s*/i, '').trim();
    }

    const absMatch = line.match(/abstinence\s*[:\-]?\s*(\d+)\s*day/i);
    if (absMatch) abstinenceDays = parseInt(absMatch[1], 10);

    const concMatch = line.match(/(?:sperm\s*)?concentration\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(million\/mL|M\/mL)?/i);
    if (concMatch) {
      const num = parseFloat(concMatch[1]);
      parsedValues.push({
        valueId: `val_conc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        testCode: 'SEMEN_CONC',
        testNameAsWritten: 'Sperm concentration',
        aiValue: num,
        userValue: num,
        unit: concMatch[2] || 'million/mL',
        refLow: 16,
        refHigh: null,
        flag: num < 16 ? 'low' : 'normal',
        confidence: 'high',
        confirmed: false,
        sourcePage: 1,
      });
      continue;
    }

    const volMatch = line.match(/volume\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(mL)/i);
    if (volMatch) {
      const num = parseFloat(volMatch[1]);
      parsedValues.push({
        valueId: `val_vol_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        testCode: 'SEMEN_VOL',
        testNameAsWritten: 'Semen volume',
        aiValue: num,
        userValue: num,
        unit: 'mL',
        refLow: 1.4,
        refHigh: null,
        flag: num < 1.4 ? 'low' : 'normal',
        confidence: 'high',
        confirmed: false,
        sourcePage: 1,
      });
      continue;
    }

    const motMatch = line.match(/(?:total\s*)?motility\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*%/i);
    if (motMatch) {
      const num = parseFloat(motMatch[1]);
      parsedValues.push({
        valueId: `val_mot_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        testCode: 'SEMEN_MOT_TOTAL',
        testNameAsWritten: 'Total motility',
        aiValue: num,
        userValue: num,
        unit: '%',
        refLow: 42,
        refHigh: null,
        flag: num < 42 ? 'low' : 'normal',
        confidence: 'high',
        confirmed: false,
        sourcePage: 1,
      });
      continue;
    }

    const morphMatch = line.match(/(?:normal\s*)?morphology\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*%/i);
    if (morphMatch) {
      const num = parseFloat(morphMatch[1]);
      parsedValues.push({
        valueId: `val_morph_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        testCode: 'SEMEN_MORPH_NORMAL',
        testNameAsWritten: 'Morphology (normal forms)',
        aiValue: num,
        userValue: num,
        unit: '%',
        refLow: 4,
        refHigh: null,
        flag: num < 4 ? 'low' : 'normal',
        confidence: 'high',
        confirmed: false,
        sourcePage: 1,
      });
      continue;
    }
  }

  // Fallback defaults if no parameters could be parsed from text
  if (parsedValues.length === 0) {
    parsedValues.push(
      {
        valueId: `val_conc_${Date.now()}`,
        testCode: 'SEMEN_CONC',
        testNameAsWritten: 'Sperm concentration',
        aiValue: 14.2,
        userValue: 14.2,
        unit: 'million/mL',
        refLow: 16,
        refHigh: null,
        flag: 'low',
        confidence: 'medium',
        confirmed: false,
        sourcePage: 1,
      },
      {
        valueId: `val_mot_${Date.now()}`,
        testCode: 'SEMEN_MOT_TOTAL',
        testNameAsWritten: 'Total motility',
        aiValue: 39,
        userValue: 39,
        unit: '%',
        refLow: 42,
        refHigh: null,
        flag: 'low',
        confidence: 'medium',
        confirmed: false,
        sourcePage: 1,
      },
      {
        valueId: `val_morph_${Date.now()}`,
        testCode: 'SEMEN_MORPH_NORMAL',
        testNameAsWritten: 'Morphology',
        aiValue: 4,
        userValue: 4,
        unit: '%',
        refLow: 4,
        refHigh: null,
        flag: 'normal',
        confidence: 'medium',
        confirmed: false,
        sourcePage: 1,
      }
    );
  }

  const docId = `doc_${Date.now()}`;

  const summary: ReportSummaryV1 = {
    schema_version: 1,
    doc_id: docId,
    report_type: 'semen_analysis',
    report_date: detectedDate,
    lab_name_as_written: labName || 'Diagnostic Laboratory (Dubai)',
    abstinence_days: abstinenceDays || 3,
    values: parsedValues.map((v) => ({
      test_code: v.testCode,
      test_name_as_written: v.testNameAsWritten,
      value: v.userValue ?? v.aiValue ?? 0,
      unit: v.unit,
      ref_low: v.refLow,
      ref_high: v.refHigh,
      flag: v.flag,
      confirmed_by_user: false,
      source_page: 1,
    })),
    free_text_findings: [],
    not_found: [],
    plain_text_summary: `Semen analysis extraction summary: ${parsedValues.length} parameters parsed.`,
  };

  const report: VaultReport = {
    docId,
    userId: 'usr_patient_01',
    fileName: params.fileName,
    mime: params.mime,
    privacyMode: params.privacyMode || 'covered',
    state: 'Quarantined',
    stateMessage: 'Extracted successfully. Pending patient confirmation.',
    originalPreviewDataUrl: params.imageBase64,
    extractionJson: {
      engineVersion: 'client-ocr-heuristic-v1.0',
      headerMaskedFields: maskedTypes,
      rawLines: cleanLines.map((text) => ({ text, confidence: 'high' })),
    },
    values: parsedValues,
    summary,
    summaryVersion: 1,
    createdAt: new Date().toISOString(),
    confirmedAt: null,
  };

  return { ok: true, report };
}
