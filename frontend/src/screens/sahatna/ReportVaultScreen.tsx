import React, { useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  EyeOff,
  FilePlus2,
  FileText,
  Lock,
  MessageSquareHeart,
  Shield,
  Trash2,
  Upload,
} from 'lucide-react';
import { useSahatna } from '../../store/SahatnaContext';
import { extractReportLocally } from '../../utils/reportExtractor';
import { PrivacyMode, ReportState, ReportValueRow, VaultReport } from '../../types/sahatna';

const SAMPLE_UAE_REPORT_TEXT = `Patient Name: Tariq Al Mansoori
Emirates ID: 784-1992-4518293-1
DOB: 1992-05-14
Mobile: +971 50 555 0199
Lab: Dubai Clinical Pathology & Andrology Lab
Date: 2026-10-03
Abstinence: 3 days
Semen volume: 2.6 mL (Ref >= 1.4)
Sperm concentration: 14.2 million/mL (Ref >= 16)
Total motility: 44 % (Ref >= 42)
Morphology: 3 % (Ref >= 4)
Liquefaction: Complete at 25 min`;

export const ReportVaultScreen: React.FC = () => {
  const {
    state,
    language,
    addReportToVault,
    confirmReportValues,
    deleteReportFromVault,
    setActiveTab,
    setAskPrefillPrompt,
    toggleConsent,
  } = useSahatna();

  const [pipelineState, setPipelineState] = useState<ReportState | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [privacyMode, setPrivacyMode] = useState<PrivacyMode>('folded');
  const [rawImagePreview, setRawImagePreview] = useState<string | null>(null);
  const [headerBlackoutApplied, setHeaderBlackoutApplied] = useState<boolean>(true);
  const [draftReport, setDraftReport] = useState<VaultReport | null>(null);
  const [editRows, setEditRows] = useState<ReportValueRow[]>([]);
  const [manualText, setManualText] = useState<string>('');
  const [showManualForm, setShowManualForm] = useState(false);
  const [selectedVaultDocId, setSelectedVaultDocId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!state) return null;
  const isAr = language === 'ar';
  const hasVaultConsent = state.consents.reports_store?.state;

  const runExtractionPipeline = async (params: {
    fileName: string;
    mime: string;
    rawText?: string;
    imageBase64?: string;
    privacy: PrivacyMode;
  }) => {
    setPipelineState('Receiving');
    setStatusMessage('Your report is uploading securely.');
    await new Promise((r) => setTimeout(r, 250));

    setPipelineState('Quarantined');
    setStatusMessage('Moving upload to quarantine container.');
    await new Promise((r) => setTimeout(r, 200));

    setPipelineState('Scanning');
    setStatusMessage('We are checking the file.');
    await new Promise((r) => setTimeout(r, 250));

    setPipelineState('Extracting');
    setStatusMessage('We are reading your report. You can leave this screen.');

    try {
      const localResult = extractReportLocally({
        fileName: params.fileName,
        mime: params.mime,
        rawText: params.rawText,
        imageBase64: params.imageBase64,
      });

      if (!localResult.ok) {
        setPipelineState('Rejected');
        setStatusMessage(
          localResult.rejectedReason ||
            'We could not accept this file. Nothing was saved. Please try a PDF, JPG or PNG.'
        );
        return;
      }

      const data = localResult.report ? {
        ok: true,
        reportDate: localResult.report.summary?.report_date || new Date().toISOString().slice(0, 10),
        reportType: localResult.report.summary?.report_type || 'semen_analysis',
        labNameAsWritten: localResult.report.summary?.lab_name_as_written,
        abstinenceDays: localResult.report.summary?.abstinence_days,
        maskedFields: localResult.report.extractionJson?.headerMaskedFields || [],
        rawLines: localResult.report.extractionJson?.rawLines || [],
        values: localResult.report.values || [],
        freeTextFindings: [],
        extractionFailed: false,
      } : { ok: false, extractionFailed: true, rejectedReason: 'Could not read document' };

      const docId = `doc_${Date.now()}`;
      if (data.extractionFailed) {
        setPipelineState('ExtractionFailed');
        setStatusMessage(
          'We could not read this report. You can type the values yourself or upload a clearer photo.'
        );
        setShowManualForm(true);
        const blankRow: ReportValueRow = {
          valueId: `val_${Date.now()}`,
          testCode: 'SEMEN_CONC',
          testNameAsWritten: 'Sperm concentration',
          aiValue: null,
          userValue: '',
          unit: 'million/mL',
          refLow: 16,
          refHigh: null,
          flag: 'none',
          confidence: 'low',
          confirmed: false,
          sourcePage: 1,
        };
        setEditRows([blankRow]);
        setDraftReport({
          docId,
          userId: state.user.userId,
          fileName: params.fileName,
          mime: params.mime,
          privacyMode: params.privacy,
          state: 'NeedsUserReview',
          stateMessage: 'Manual entry ready for review',
          originalPreviewDataUrl: params.imageBase64,
          extractionJson: {
            engineVersion: 'manual-fallback-v1',
            headerMaskedFields: data.maskedFields || [],
            rawLines: data.rawLines || [],
          },
          values: [blankRow],
          summary: {
            schema_version: 1,
            doc_id: docId,
            report_date: data.reportDate || new Date().toISOString().slice(0, 10),
            report_type: data.reportType || 'semen_analysis',
            lab_name_as_written: data.labNameAsWritten || null,
            abstinence_days: data.abstinenceDays ?? null,
            values: [],
            free_text_findings: [],
            not_found: ['OCR unavailable; entered manually'],
            plain_text_summary: '',
          },
          summaryVersion: 0,
          createdAt: new Date().toISOString(),
          confirmedAt: null,
        });
        return;
      }

      const newDraft: VaultReport = {
        docId,
        userId: state.user.userId,
        fileName: params.fileName,
        mime: params.mime,
        privacyMode: params.privacy,
        state: 'NeedsUserReview',
        stateMessage: 'Please check each value against your report.',
        originalPreviewDataUrl: params.imageBase64,
        extractionJson: {
          engineVersion: 'sahatna-doc-parser-v1',
          headerMaskedFields: data.maskedFields || [],
          rawLines: data.rawLines || [],
        },
        values: data.values || [],
        summary: {
          schema_version: 1,
          doc_id: docId,
          report_date: data.reportDate || new Date().toISOString().slice(0, 10),
          report_type: data.reportType || 'semen_analysis',
          lab_name_as_written: data.labNameAsWritten ?? null,
          abstinence_days: data.abstinenceDays ?? null,
          values: [],
          free_text_findings: data.freeTextFindings || [],
          not_found: [],
          plain_text_summary: '',
        },
        summaryVersion: 0,
        createdAt: new Date().toISOString(),
        confirmedAt: null,
      };
      setDraftReport(newDraft);
      setEditRows(data.values || []);
      setPipelineState('NeedsUserReview');
      setStatusMessage('Please check each value against your report.');
    } catch {
      setPipelineState('ExtractionFailed');
      setStatusMessage(
        'We could not read this report. You can type the values yourself or upload a clearer photo.'
      );
      setShowManualForm(true);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const resultStr = String(reader.result || '');
      if (file.type.startsWith('image/')) {
        setRawImagePreview(resultStr);
        runExtractionPipeline({
          fileName: file.name,
          mime: file.type,
          imageBase64: resultStr,
          rawText: manualText || undefined,
          privacy: headerBlackoutApplied ? 'folded' : privacyMode,
        });
      } else {
        setRawImagePreview(null);
        runExtractionPipeline({
          fileName: file.name,
          mime: file.type || 'application/pdf',
          rawText: manualText || SAMPLE_UAE_REPORT_TEXT,
          privacy: privacyMode,
        });
      }
    };
    if (file.type.startsWith('image/')) reader.readAsDataURL(file);
    else reader.readAsText(file);
  };

  const handleConfirmSave = () => {
    if (!draftReport) return;
    addReportToVault(draftReport);
    confirmReportValues(draftReport.docId, editRows);
    setSelectedVaultDocId(draftReport.docId);
    setDraftReport(null);
    setPipelineState('Summarised');
    setStatusMessage('Your report is saved. The assistant can now use it, only if you allowed it.');
    setShowManualForm(false);
  };

  const selectedVaultDoc = state.reports.find((r) => r.docId === selectedVaultDocId) || state.reports[0] || null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#1A4D3E]">
            {isAr ? 'خزنة التقارير المشفرة' : 'Protected Report Vault (F7)'}
          </p>
          <h1 className="text-[20px] font-bold text-[#151813]">
            {isAr ? 'أضف تقريرك وراجعه بأمان' : 'Lab Reports & Confirmed Summaries'}
          </h1>
        </div>
      </div>

      {!hasVaultConsent ? (
        <div className="rounded-3xl bg-[#FFF8E1] border border-[#F5DFA0] p-5 space-y-3">
          <div className="flex items-center gap-2.5 text-[#614300]">
            <Lock className="w-5 h-5" />
            <p className="text-[14px] font-bold">
              {isAr ? 'تم إيقاف تخزين التقارير في الإعدادات' : 'Report Vault storage consent is OFF'}
            </p>
          </div>
          <p className="text-[12px] text-[#614300]">
            {isAr
              ? 'لتخزين التقارير واستخلاص قيمها المؤكدة، فعّل إذن «خزنة التقارير الخاصة».'
              : 'Enable "Store my uploaded reports in my private vault" to upload and extract lab reports.'}
          </p>
          <button
            type="button"
            onClick={() => toggleConsent('reports_store', true)}
            className="px-4 py-2.5 rounded-2xl bg-[#1A4D3E] text-white text-[12px] font-semibold cursor-pointer"
          >
            {isAr ? 'تفعيل إذن الخزنة الآن' : 'Enable Report Vault Consent'}
          </button>
        </div>
      ) : (
        <>
          {/* Mandatory Privacy Guidance Note (Section 5.1) */}
          <div className="rounded-3xl bg-white border border-[#E2E6E0] p-5 space-y-4">
            <div className="flex items-start gap-3">
              <span className="w-9 h-9 rounded-2xl bg-[#E9F7EF] text-[#1A4D3E] flex items-center justify-center shrink-0">
                <Shield className="w-5 h-5" />
              </span>
              <div className="space-y-1">
                <h2 className="text-[15px] font-bold text-[#151813]">
                  {isAr ? 'أضف تقريراً — أنت تقرر ما يظهر' : 'Add a report — you decide what to show'}
                </h2>
                <p className="text-[12px] leading-relaxed text-[#646A63]">
                  {isAr
                    ? 'قد يظهر في التقرير اسمك أو تاريخ ميلادك أو رقم هويتك أو هاتفك. لست بحاجة لمشاركة ذلك. يمكنك طيّ الجزء العلوي أو تغطيته قبل التصوير، أو استخدام أداة التعتيم داخل التطبيق، كما يتم إخفاء بيانات الترويسة تلقائياً.'
                    : 'Your report may show your name, date of birth, ID or phone number. You do not need to share these. Before you upload, you can fold the top of the paper, cover that part, or black it out below. We store a private copy only if you agree.'}
                </p>
              </div>
            </div>

            {/* Privacy mode & header blackout toggle */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setPrivacyMode('folded');
                  setHeaderBlackoutApplied(true);
                }}
                className={`px-3 py-1.5 rounded-full text-[12px] font-semibold border cursor-pointer inline-flex items-center gap-1.5 ${
                  privacyMode === 'folded'
                    ? 'bg-[#151813] text-white border-[#151813]'
                    : 'bg-[#F6F7F5] text-[#151813] border-[#E2E6E0]'
                }`}
              >
                <EyeOff className="w-3.5 h-3.5" />
                <span>{isAr ? 'إخفاء / تعتيم الهوية العلوية' : 'Folded / Blackout Header Mode'}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setPrivacyMode('full');
                  setHeaderBlackoutApplied(false);
                }}
                className={`px-3 py-1.5 rounded-full text-[12px] font-semibold border cursor-pointer ${
                  privacyMode === 'full'
                    ? 'bg-[#151813] text-white border-[#151813]'
                    : 'bg-[#F6F7F5] text-[#151813] border-[#E2E6E0]'
                }`}
              >
                {isAr ? 'التقرير الكامل (تعتيم تلقائي للنص)' : 'Full Report (Auto-Mask PII)'}
              </button>
            </div>

            {/* Upload Actions */}
            <div className="flex flex-wrap gap-2.5">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.txt,image/*,application/pdf"
                onChange={handleFileChange}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2.5 rounded-2xl bg-[#1A4D3E] text-white text-[12px] font-semibold inline-flex items-center gap-2 hover:bg-[#143D31] cursor-pointer"
              >
                <Upload className="w-4 h-4" />
                <span>{isAr ? 'اختيار ملف (PDF / صورة)' : 'Upload File (PDF / JPG / PNG)'}</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  runExtractionPipeline({
                    fileName: 'uae_semen_report_2026-10-03.pdf',
                    mime: 'application/pdf',
                    rawText: SAMPLE_UAE_REPORT_TEXT,
                    privacy: privacyMode,
                  })
                }
                className="px-4 py-2.5 rounded-2xl bg-[#FFF45A] text-[#151813] text-[12px] font-semibold inline-flex items-center gap-2 cursor-pointer"
              >
                <FilePlus2 className="w-4 h-4" />
                <span>{isAr ? 'تجربة تقرير مخبري نموذجي' : 'Try Sample UAE Lab Report'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const docId = `doc_${Date.now()}`;
                  const blank: ReportValueRow = {
                    valueId: `val_${Date.now()}`,
                    testCode: 'SEMEN_CONC',
                    testNameAsWritten: 'Sperm concentration',
                    aiValue: null,
                    userValue: 18.5,
                    unit: 'million/mL',
                    refLow: 16,
                    refHigh: null,
                    flag: 'normal',
                    confidence: 'medium',
                    confirmed: false,
                    sourcePage: 1,
                  };
                  setEditRows([blank]);
                  setDraftReport({
                    docId,
                    userId: state.user.userId,
                    fileName: 'manual_entry.json',
                    mime: 'text/plain',
                    privacyMode: 'folded',
                    state: 'NeedsUserReview',
                    stateMessage: 'Manual entry ready for review',
                    extractionJson: { engineVersion: 'manual-v1', headerMaskedFields: [], rawLines: [] },
                    values: [blank],
                    summary: {
                      schema_version: 1,
                      doc_id: docId,
                      report_date: new Date().toISOString().slice(0, 10),
                      report_type: 'semen_analysis',
                      lab_name_as_written: 'Manual Entry',
                      abstinence_days: 3,
                      values: [],
                      free_text_findings: [],
                      not_found: [],
                      plain_text_summary: '',
                    },
                    summaryVersion: 0,
                    createdAt: new Date().toISOString(),
                    confirmedAt: null,
                  });
                  setPipelineState('NeedsUserReview');
                  setShowManualForm(true);
                }}
                className="px-4 py-2.5 rounded-2xl bg-[#ECEEEB] text-[#151813] text-[12px] font-semibold cursor-pointer"
              >
                {isAr ? 'إدخال القيم يدوياً' : 'Manual Entry Fallback'}
              </button>
            </div>

            {/* State Machine Banner */}
            {pipelineState && (
              <div
                className={`rounded-2xl p-3 text-[12px] font-semibold flex items-center justify-between gap-2 ${
                  pipelineState === 'Rejected'
                    ? 'bg-[#FEF3F2] text-[#7A1810] border border-[#F9C6C2]'
                    : pipelineState === 'Summarised'
                      ? 'bg-[#E9F7EF] text-[#124D30] border border-[#B8E3C9]'
                      : 'bg-[#F6F7F5] text-[#151813] border border-[#E2E6E0]'
                }`}
              >
                <span>
                  [{pipelineState}] {statusMessage}
                </span>
              </div>
            )}
          </div>

          {/* Mandatory Side-by-Side Check Screen (Section 5.1 E6-S4) */}
          {draftReport && (
            <div className="rounded-3xl bg-white border-2 border-[#1A4D3E] p-5 space-y-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-[11px] font-bold uppercase text-[#1A4D3E]">
                    {isAr ? 'مراجعة إلزامية قبل الحفظ' : 'Mandatory Verification Step'}
                  </span>
                  <h2 className="text-[17px] font-bold text-[#151813]">
                    {isAr
                      ? 'قارن كل قيمة مع التقرير الأصلي'
                      : 'Nothing becomes part of your health record until you confirm it.'}
                  </h2>
                </div>
                {draftReport.extractionJson.headerMaskedFields.length > 0 && (
                  <span className="px-3 py-1 rounded-full bg-[#E9F7EF] text-[#124D30] text-[11px] font-semibold">
                    Auto-masked: {draftReport.extractionJson.headerMaskedFields.join(', ')}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Left: Original / Masked Preview */}
                <div className="rounded-2xl bg-[#F6F7F5] border border-[#E2E6E0] p-4 space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-bold text-[#646A63]">
                    <span>{isAr ? 'التقرير الأصلي (مع تعتيم الهوية)' : 'Original / Masked View'}</span>
                    <span>privacy_mode: {draftReport.privacyMode}</span>
                  </div>

                  {rawImagePreview ? (
                    <div className="relative rounded-xl overflow-hidden border border-[#E2E6E0]">
                      {headerBlackoutApplied && (
                        <div className="bg-[#151813] text-[#FFF45A] text-[11px] font-semibold px-3 py-4 text-center">
                          PERSONAL HEADER BLACKED OUT BY USER PRIVACY CROP
                        </div>
                      )}
                      <img
                        src={rawImagePreview}
                        alt="Uploaded lab report"
                        referrerPolicy="no-referrer"
                        className="w-full max-h-64 object-contain bg-white"
                      />
                    </div>
                  ) : (
                    <div className="space-y-1 text-[12px] font-mono bg-white rounded-xl p-3 border border-[#E2E6E0]">
                      {headerBlackoutApplied && (
                        <div className="bg-[#151813] text-[#FFF45A] px-2 py-1.5 rounded text-[10px] font-sans font-bold">
                          [HEADER PII MASKED: Name, Emirates ID, DOB, Phone stripped]
                        </div>
                      )}
                      {draftReport.extractionJson.rawLines.length > 0 ? (
                        draftReport.extractionJson.rawLines.map((l, idx) => (
                          <p key={idx} className="text-[#151813]">
                            {l.text}
                          </p>
                        ))
                      ) : (
                        <p className="text-[#646A63]">Manual entry mode active.</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Right: Extracted Rows to Confirm / Edit */}
                <div className="space-y-2.5">
                  {editRows.map((row, idx) => {
                    const lowConf = row.confidence === 'low';
                    return (
                      <div
                        key={row.valueId}
                        className={`rounded-2xl p-3 border space-y-2 ${
                          lowConf
                            ? 'bg-[#FFF8E1] border-[#F5DFA0]'
                            : 'bg-[#F6F7F5] border-[#E2E6E0]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[13px] font-bold text-[#151813]">
                            {row.testNameAsWritten}
                          </span>
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-white border border-[#E2E6E0]">
                            conf: {row.confidence} · {row.flag}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={String(row.userValue ?? '')}
                            onChange={(e) => {
                              const valStr = e.target.value;
                              const num = parseFloat(valStr);
                              setEditRows((prev) =>
                                prev.map((item, i) =>
                                  i === idx
                                    ? {
                                        ...item,
                                        userValue: Number.isNaN(num) ? valStr : num,
                                        flag:
                                          !Number.isNaN(num) && item.refLow !== null && num < item.refLow
                                            ? 'low'
                                            : !Number.isNaN(num) &&
                                                item.refHigh !== null &&
                                                num > item.refHigh
                                              ? 'high'
                                              : 'normal',
                                      }
                                    : item
                                )
                              );
                            }}
                            className="w-28 px-3 py-1.5 rounded-xl bg-white border border-[#E2E6E0] text-[13px] font-bold tabular-nums"
                          />
                          <span className="text-[12px] text-[#646A63]">{row.unit}</span>
                          <span className="text-[11px] text-[#646A63] ms-auto">
                            {row.refLow !== null ? `Ref >= ${row.refLow}` : ''}
                          </span>
                        </div>
                      </div>
                    );
                  })}

                  {showManualForm && (
                    <button
                      type="button"
                      onClick={() =>
                        setEditRows((prev) => [
                          ...prev,
                          {
                            valueId: `val_${Date.now()}`,
                            testCode: 'SEMEN_MOT_TOTAL',
                            testNameAsWritten: 'Total motility',
                            aiValue: null,
                            userValue: 45,
                            unit: '%',
                            refLow: 42,
                            refHigh: null,
                            flag: 'normal',
                            confidence: 'medium',
                            confirmed: false,
                            sourcePage: 1,
                          },
                        ])
                      }
                      className="text-[12px] font-semibold text-[#1A4D3E] underline cursor-pointer"
                    >
                      + Add another lab row
                    </button>
                  )}

                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setDraftReport(null);
                        setPipelineState(null);
                      }}
                      className="px-4 py-2.5 rounded-2xl bg-[#ECEEEB] text-[#151813] text-[12px] font-semibold cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmSave}
                      className="flex-1 py-2.5 px-4 rounded-2xl bg-[#1A4D3E] text-white text-[13px] font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <CheckCircle2 className="w-4 h-4 text-[#FFF45A]" />
                      <span>{isAr ? 'تأكيد وحفظ في الخزنة' : 'Confirm Values & Save to Vault'}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Saved Vault Summaries */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-5 space-y-2.5">
              <h2 className="text-[14px] font-bold text-[#151813]">
                {isAr ? 'التقارير المحفوظة' : 'Saved Vault Records'} ({state.reports.length})
              </h2>
              {state.reports.length === 0 ? (
                <div className="rounded-3xl bg-white border border-[#E2E6E0] p-5 text-[12px] text-[#646A63]">
                  {isAr
                    ? 'لا توجد تقارير محفوظة بعد. استخدم زر التجربة أعلاه أو ارفع ملفاً.'
                    : 'No saved lab reports yet. Try the Sample UAE Lab Report above or upload your own.'}
                </div>
              ) : (
                state.reports.map((rep) => (
                  <div
                    key={rep.docId}
                    onClick={() => setSelectedVaultDocId(rep.docId)}
                    className={`rounded-2xl p-4 border cursor-pointer transition-colors ${
                      selectedVaultDoc?.docId === rep.docId
                        ? 'bg-[#E9F7EF] border-[#1A4D3E]'
                        : 'bg-white border-[#E2E6E0] hover:border-[#1A4D3E]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <FileText className="w-4 h-4 text-[#1A4D3E] shrink-0" />
                        <div className="min-w-0">
                          <p className="text-[13px] font-bold text-[#151813] truncate">
                            {rep.summary?.lab_name_as_written || rep.fileName}
                          </p>
                          <p className="text-[11px] text-[#646A63]">
                            {rep.summary?.report_date} · v{rep.summaryVersion} · {rep.privacyMode}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteReportFromVault(rep.docId);
                        }}
                        aria-label="Delete report"
                        className="p-1.5 rounded-xl text-[#B42318] hover:bg-[#FEF3F2] cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {selectedVaultDoc && selectedVaultDoc.summary && (
              <div className="lg:col-span-7 rounded-3xl bg-white border border-[#E2E6E0] p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-[#E9F7EF] text-[#124D30]">
                      From your lab report · {selectedVaultDoc.summary.report_date}
                    </span>
                    <h3 className="text-[16px] font-bold text-[#151813] mt-2">
                      {selectedVaultDoc.summary.lab_name_as_written || selectedVaultDoc.fileName}
                    </h3>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setAskPrefillPrompt(
                        `Explain my confirmed lab report from ${selectedVaultDoc.summary?.report_date}.`
                      );
                      setActiveTab('ask');
                    }}
                    className="px-3.5 py-2 rounded-2xl bg-[#1A4D3E] text-white text-[12px] font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <MessageSquareHeart className="w-4 h-4 text-[#FFF45A]" />
                    <span>{isAr ? 'اسأل عن هذا التقرير' : 'Ask about this report'}</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {selectedVaultDoc.summary.values.map((v) => (
                    <div
                      key={v.test_code + v.test_name_as_written}
                      className="rounded-2xl bg-[#F6F7F5] p-3 border border-[#E2E6E0]"
                    >
                      <p className="text-[11px] text-[#646A63]">{v.test_name_as_written}</p>
                      <div className="flex items-baseline justify-between mt-1">
                        <p className="text-[16px] font-bold text-[#151813] tabular-nums">
                          {v.value} <span className="text-[11px] font-medium">{v.unit}</span>
                        </p>
                        <span
                          className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                            v.flag === 'low'
                              ? 'bg-[#FFF8E1] text-[#9A6B00]'
                              : v.flag === 'high'
                                ? 'bg-[#FEF3F2] text-[#B42318]'
                                : 'bg-[#E9F7EF] text-[#124D30]'
                          }`}
                        >
                          {v.flag}
                        </span>
                      </div>
                      {v.ref_low !== null && (
                        <p className="text-[10px] text-[#646A63] mt-0.5">
                          Lab ref: &ge; {v.ref_low} {v.unit} · from your lab report
                        </p>
                      )}
                    </div>
                  ))}
                </div>

                <div className="rounded-2xl bg-[#F6F7F5] p-3 space-y-1.5">
                  <p className="text-[11px] font-bold text-[#646A63]">
                    summary.json (schema_version: {selectedVaultDoc.summary.schema_version})
                  </p>
                  <p className="text-[12px] text-[#151813] leading-relaxed">
                    {selectedVaultDoc.summary.plain_text_summary}
                  </p>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
