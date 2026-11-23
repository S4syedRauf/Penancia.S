import React, { useState } from 'react';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Eye,
  FileText,
  Lock,
  Trash2,
  Upload,
} from 'lucide-react';
import { Badge } from '@astryxdesign/core/Badge';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Divider } from '@astryxdesign/core/Divider';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { IconButton } from '@astryxdesign/core/IconButton';
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Text } from '@astryxdesign/core/Text';
import { TextArea } from '@astryxdesign/core/TextArea';
import { TextInput } from '@astryxdesign/core/TextInput';
import { VStack } from '@astryxdesign/core/VStack';
import { usePanacea } from '../../store/PanaceaContext';
import type { PrivacyMode, ReportValueRow, VaultReport } from '../../types/panacea';
import { penanciaApi } from '../../services/penanciaApiClient';

interface ReportVaultViewProps {
  onBack: () => void;
}

const SAMPLE_LAB_TEXT = `Patient Name: [MASKED]
Emirates ID: 784-1992-0000000-1
Lab: Al Razi Andrology & Diagnostic Hub (Dubai Sample)
Date: 2026-11-18
Abstinence: 4 days
Volume: 2.3 mL
Sperm concentration: 14.2 million/mL (Ref >= 16)
Total motility: 39 % (Ref >= 42%)
Morphology: 4 % (Ref >= 4%)`;

export const ReportVaultView: React.FC<ReportVaultViewProps> = ({ onBack }) => {
  const {
    state,
    language,
    toggleConsent,
    addReport,
    deleteReportFromState,
  } = usePanacea();
  const isAr = language === 'ar';

  const [privacyMode, setPrivacyMode] = useState<PrivacyMode>('covered');
  const [rawTextInput, setRawTextInput] = useState(SAMPLE_LAB_TEXT);
  const [selectedFileName, setSelectedFileName] = useState('Sample_Semen_Report_Dubai.pdf');
  const [imagePreview, setImagePreview] = useState<string | undefined>(undefined);
  const [uploading, setUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [reviewingReport, setReviewingReport] = useState<VaultReport | null>(null);
  const [editedRows, setEditedRows] = useState<ReportValueRow[]>([]);
  const [editReportDate, setEditReportDate] = useState('');
  const [savingConfirm, setSavingConfirm] = useState(false);

  const reports = state?.reports || [];
  const vaultConsent = Boolean(state?.consents.reports_store?.state);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFileName(file.name);
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = () => setImagePreview(String(reader.result || ''));
      reader.readAsDataURL(file);
    } else if (file.type === 'text/plain') {
      const reader = new FileReader();
      reader.onload = () => setRawTextInput(String(reader.result || ''));
      reader.readAsText(file);
    } else {
      setImagePreview(undefined);
    }
  };

  const openReview = (rep: VaultReport) => {
    setReviewingReport(rep);
    setEditedRows(
      rep.values.length > 0
        ? rep.values
        : [
            {
              valueId: `val_manual_${Date.now()}`,
              testCode: 'SEMEN_CONC',
              testNameAsWritten: 'Sperm concentration',
              aiValue: null,
              userValue: 16,
              unit: 'million/mL',
              refLow: 16,
              refHigh: null,
              flag: 'normal',
              confidence: 'low',
              confirmed: false,
              sourcePage: 1,
            },
          ]
    );
    setEditReportDate(rep.summary?.report_date || new Date().toISOString().slice(0, 10));
  };

  const submitExtraction = async (opts?: { simulateMalware?: boolean; emptyText?: boolean }) => {
    setUploading(true);
    setErrorMsg(null);
    try {
      if (!vaultConsent) {
        setErrorMsg(
          isAr
            ? 'يُرجى تفعيل إذن خزنة التقارير الخاصة أولاً لحفظ التقارير.'
            : 'Please enable Private Report Vault consent (reports_store) before extracting.'
        );
        return;
      }

      const fileName = opts?.simulateMalware ? 'eicar_malware_test.pdf' : selectedFileName;
      const rawText = opts?.emptyText ? '' : rawTextInput;
      const mime = imagePreview ? 'image/jpeg' : 'application/pdf';

      const { report } = await penanciaApi.extractReport({
        fileName,
        mime,
        rawText,
        imageBase64: imagePreview,
        privacyMode,
        simulateMalware: Boolean(opts?.simulateMalware),
      });

      addReport(report);
      openReview(report);
    } catch (err: any) {
      setErrorMsg(
        err?.message || (isAr ? 'حدث خطأ أثناء معالجة التقرير.' : 'Error occurred during report extraction.')
      );
    } finally {
      setUploading(false);
    }
  };

  const confirmReport = async () => {
    if (!reviewingReport) return;
    setSavingConfirm(true);
    setErrorMsg(null);
    try {
      const labName =
        reviewingReport.summary?.lab_name_as_written || 'Dubai Uploaded Lab Fixture';
      const { report } = await penanciaApi.confirmReport(reviewingReport.docId, {
        values: editedRows,
        reportDate: editReportDate,
        labName,
      });
      addReport(report);
      setReviewingReport(null);
    } catch (err: any) {
      setErrorMsg(err?.message || (isAr ? 'تعذر تأكيد التقرير.' : 'Could not confirm the report.'));
    } finally {
      setSavingConfirm(false);
    }
  };

  const deleteReport = async (docId: string) => {
    setErrorMsg(null);
    try {
      await penanciaApi.deleteReport(docId);
      deleteReportFromState(docId);
      if (reviewingReport?.docId === docId) setReviewingReport(null);
    } catch (err: any) {
      setErrorMsg(err?.message || (isAr ? 'تعذر حذف التقرير.' : 'Could not delete the report.'));
    }
  };

  return (
    <VStack gap={5}>
      <HStack gap={3} vAlign="center" hAlign="between">
        <HStack gap={3} vAlign="center" className="min-w-0">
          <IconButton
            label={isAr ? 'رجوع' : 'Back'}
            icon={<ArrowLeft className="w-4 h-4 rtl:rotate-180" />}
            variant="secondary"
            size="sm"
            onClick={onBack}
          />
          <div className="min-w-0">
            <Heading level={1}>
              {isAr ? 'خزنة التقارير و OCR' : 'Private Report Vault & OCR'}
            </Heading>
            <Text type="supporting" color="secondary">
              {isAr
                ? 'عزل الملف · حجب الهوية · تأكيد إلزامي'
                : 'Quarantine · PII Masking · Side-by-Side Review'}
            </Text>
          </div>
        </HStack>
        <Badge label={String(reports.length)} variant="info" />
      </HStack>

      {!vaultConsent && (
        <Banner
          status="warning"
          title={
            isAr ? 'إذن خزنة التقارير متوقف حالياً' : 'Report Vault consent (reports_store) is OFF'
          }
          description={
            isAr
              ? 'فعّل الإذن لحفظ تقارير جديدة في خزنتك الخاصة.'
              : 'Enable storage consent to upload new lab reports.'
          }
          endContent={
            <Button
              size="sm"
              variant="primary"
              label={isAr ? 'تفعيل' : 'Enable'}
              onClick={() => toggleConsent('reports_store', true)}
            />
          }
        />
      )}

      {/* Quarantine Upload & Masking Section */}
      <Card padding={4} elevation="low">
        <VStack gap={3}>
          <Banner
            status="info"
            title={isAr ? 'حماية الخصوصية والعزل' : 'Quarantine & PII Header Masking'}
            description={
              isAr
                ? 'اختر وضع حجب الترويسة قبل الفحص. لا تدخل القيم غير المؤكدة في المساعد أو التوجيه.'
                : 'Select how personal headers (Name, Emirates ID, Phone) are masked before quarantine scan. Unconfirmed OCR rows never enter Screening, Direction View, or Ask.'
            }
          />

          <SegmentedControl
            label={isAr ? 'وضع الخصوصية' : 'Privacy Mode'}
            value={privacyMode}
            onChange={(val) => setPrivacyMode(val as PrivacyMode)}
            layout="fill"
            size="sm"
          >
            <SegmentedControlItem
              value="covered"
              label={isAr ? 'تغطية الترويسة' : 'Header Covered'}
            />
            <SegmentedControlItem value="cropped" label={isAr ? 'قص الهوية' : 'Cropped Area'} />
            <SegmentedControlItem value="full" label={isAr ? 'كامل المستند' : 'Full Document'} />
          </SegmentedControl>

          <HStack gap={2} vAlign="center" wrap="wrap">
            <label className="min-h-[36px] px-3.5 py-2 rounded-md bg-surface border border-border text-sm font-medium text-primary inline-flex items-center gap-2 cursor-pointer hover:bg-muted">
              <Upload className="w-4 h-4 text-[var(--color-accent)]" />
              <span>{isAr ? 'اختر PDF / صورة' : 'Choose PDF / Image'}</span>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.txt"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>
            <Text type="supporting" color="secondary" maxLines={1}>
              {selectedFileName}
            </Text>
          </HStack>

          <TextArea
            label={isAr ? 'نص التقرير التجريبي' : 'OCR Source Text / Fixture'}
            rows={4}
            value={rawTextInput}
            onChange={setRawTextInput}
          />

          {errorMsg && <Banner status="error" title={errorMsg} />}

          <HStack gap={2} wrap="wrap">
            <Button
              variant="primary"
              isLoading={uploading}
              isDisabled={!vaultConsent}
              label={
                isAr ? 'فحص واستخراج مسودة OCR' : 'Quarantine Scan & Extract Draft'
              }
              onClick={() => submitExtraction()}
            />
            <Button
              variant="secondary"
              size="sm"
              isDisabled={uploading || !vaultConsent}
              label={isAr ? 'اختبار ملف مصاب' : 'Test Malware Reject'}
              onClick={() => submitExtraction({ simulateMalware: true })}
            />
            <Button
              variant="secondary"
              size="sm"
              isDisabled={uploading || !vaultConsent}
              label={isAr ? 'اختبار فشل OCR' : 'Test OCR Fail -> Manual'}
              onClick={() => submitExtraction({ emptyText: true })}
            />
          </HStack>
        </VStack>
      </Card>

      {/* Mandatory Side-by-Side Confirmation Drawer */}
      {reviewingReport && (
        <Card padding={4} elevation="med" variant="purple">
          <VStack gap={4}>
            <HStack gap={2} vAlign="center" hAlign="between">
              <div>
                <Badge
                  label={
                    isAr ? 'مراجعة إلزامية جنباً إلى جنب' : 'MANDATORY SIDE-BY-SIDE CONFIRMATION'
                  }
                  variant="info"
                />
                <Heading level={2} className="mt-1">
                  {reviewingReport.fileName}
                </Heading>
              </div>
              <Button
                size="sm"
                variant="ghost"
                label={isAr ? 'إغلاق' : 'Close'}
                onClick={() => setReviewingReport(null)}
              />
            </HStack>

            {reviewingReport.extractionJson.headerMaskedFields.length > 0 && (
              <Banner
                status="info"
                title={isAr ? 'حقول الهوية المحجوبة تلقائياً' : 'Auto-masked PII lines'}
                description={reviewingReport.extractionJson.headerMaskedFields.join(', ')}
              />
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card padding={3}>
                <VStack gap={2}>
                  <Text type="supporting" color="secondary" weight="semibold">
                    {isAr ? 'المصدر المستخرج (للقراءة)' : 'De-identified Source Lines'}
                  </Text>
                  {reviewingReport.originalPreviewDataUrl && (
                    <img
                      src={reviewingReport.originalPreviewDataUrl}
                      alt="Report preview"
                      className="max-h-40 rounded-md object-contain mx-auto"
                    />
                  )}
                  <VStack gap={1} className="max-h-48 overflow-y-auto font-mono">
                    {reviewingReport.extractionJson.rawLines.length > 0 ? (
                      reviewingReport.extractionJson.rawLines.map((l, idx) => (
                        <Card key={idx} variant="muted" padding={2}>
                          <Text type="supporting">{l.text}</Text>
                        </Card>
                      ))
                    ) : (
                      <Text type="supporting" color="secondary">
                        {isAr ? 'تم تفعيل الإدخال اليدوي المباشر.' : 'Manual entry fallback active.'}
                      </Text>
                    )}
                  </VStack>
                </VStack>
              </Card>

              <Card padding={3}>
                <VStack gap={3}>
                  <TextInput
                    label={isAr ? 'تاريخ التقرير (YYYY-MM-DD)' : 'Report Date (YYYY-MM-DD)'}
                    value={editReportDate}
                    onChange={setEditReportDate}
                    placeholder="2026-11-18"
                  />

                  {editedRows.map((row, idx) => (
                    <Card
                      key={row.valueId}
                      variant={row.confidence === 'low' ? 'orange' : 'muted'}
                      padding={3}
                    >
                      <VStack gap={2}>
                        <HStack gap={2} hAlign="between" vAlign="center">
                          <Text weight="semibold">{row.testNameAsWritten}</Text>
                          <Badge
                            label={`p.${row.sourcePage} · ${row.confidence}`}
                            variant={row.confidence === 'low' ? 'warning' : 'neutral'}
                          />
                        </HStack>
                        <HStack gap={2} vAlign="end" hAlign="between">
                          <NumberInput
                            label={row.testNameAsWritten}
                            isLabelHidden
                            value={
                              typeof row.userValue === 'number'
                                ? row.userValue
                                : row.userValue
                                  ? parseFloat(String(row.userValue)) || null
                                  : null
                            }
                            step={0.1}
                            units={row.unit}
                            onChange={(num) => {
                              setEditedRows((prev) =>
                                prev.map((r, i) =>
                                  i === idx
                                    ? {
                                        ...r,
                                        userValue: num,
                                        flag:
                                          r.refLow !== null && num < r.refLow
                                            ? 'low'
                                            : r.refHigh !== null && num > r.refHigh
                                              ? 'high'
                                              : 'normal',
                                      }
                                    : r
                                )
                              );
                            }}
                          />
                          <Text type="supporting" color="accent" weight="semibold">
                            AI: {row.aiValue ?? 'Manual'}
                          </Text>
                        </HStack>
                      </VStack>
                    </Card>
                  ))}
                </VStack>
              </Card>
            </div>

            <Button
              variant="primary"
              width="100%"
              isLoading={savingConfirm}
              icon={<Check className="w-4 h-4" />}
              label={
                isAr
                  ? 'تأكيد القيم وإدراجها في الملخص'
                  : 'Confirm Values Side-by-Side & Publish Summary'
              }
              onClick={confirmReport}
            />
          </VStack>
        </Card>
      )}

      {/* Stored Vault Reports */}
      <VStack gap={3}>
        <Heading level={2}>
          {isAr ? `التقارير المحفوظة (${reports.length})` : `Vault Documents (${reports.length})`}
        </Heading>

        {reports.length === 0 ? (
          <Card padding={4}>
            <EmptyState
              isCompact
              title={isAr ? 'الخزنة فارغة' : 'No Vault Documents'}
              description={
                isAr
                  ? 'ارفع أول تقرير مخبري أو شغّل المسودة أعلاه.'
                  : 'Upload a report or run the sample extraction above.'
              }
            />
          </Card>
        ) : (
          reports.map((rep) => {
            const isConfirmed = rep.state === 'Summarised';
            return (
              <Card key={rep.docId} padding={4} elevation="low">
                <VStack gap={3}>
                  <HStack gap={3} vAlign="start" hAlign="between">
                    <HStack gap={3} vAlign="center" className="min-w-0">
                      {isConfirmed ? (
                        <CheckCircle2 className="w-5 h-5 text-[var(--color-accent)] shrink-0" />
                      ) : (
                        <Lock className="w-5 h-5 text-amber-600 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <Text weight="semibold" maxLines={1}>
                          {rep.fileName}
                        </Text>
                        <Text type="supporting" color="secondary" className="tabular-nums">
                          {rep.state} · v{rep.summaryVersion} · {rep.createdAt.slice(0, 10)}
                        </Text>
                      </div>
                    </HStack>

                    <HStack gap={1.5}>
                      <Button
                        size="sm"
                        variant="secondary"
                        icon={<Eye className="w-3.5 h-3.5" />}
                        label={
                          isConfirmed
                            ? isAr
                              ? 'تعديل'
                              : 'Edit'
                            : isAr
                              ? 'مراجعة'
                              : 'Review'
                        }
                        onClick={() => openReview(rep)}
                      />
                      <IconButton
                        label={isAr ? 'حذف التقرير' : 'Delete report'}
                        icon={<Trash2 className="w-4 h-4" />}
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteReport(rep.docId)}
                      />
                    </HStack>
                  </HStack>

                  {rep.summary ? (
                    <Card variant="muted" padding={3}>
                      <VStack gap={2}>
                        <HStack gap={2} hAlign="between">
                          <Text type="supporting" color="secondary">
                            {rep.summary.lab_name_as_written}
                          </Text>
                          <Text type="supporting" color="secondary" className="tabular-nums">
                            {rep.summary.report_date}
                          </Text>
                        </HStack>
                        <Divider />
                        <MetadataList columns="multi">
                          {rep.summary.values.map((v, i) => (
                            <MetadataListItem key={i} label={v.test_name_as_written}>
                              <Text weight="bold" color="accent" className="tabular-nums">
                                {v.value} {v.unit}
                              </Text>
                            </MetadataListItem>
                          ))}
                        </MetadataList>
                        <Text type="supporting" color="secondary">
                          {rep.summary.plain_text_summary}
                        </Text>
                      </VStack>
                    </Card>
                  ) : (
                    <Banner
                      status="warning"
                      icon={<FileText className="w-4 h-4" />}
                      title={rep.state}
                      description={rep.stateMessage}
                    />
                  )}
                </VStack>
              </Card>
            );
          })
        )}
      </VStack>
    </VStack>
  );
};
