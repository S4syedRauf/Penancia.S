import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  FlaskConical,
  Lock,
  ShieldAlert,
} from 'lucide-react';
import { Badge } from '@astryxdesign/core/Badge';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Divider } from '@astryxdesign/core/Divider';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { IconButton } from '@astryxdesign/core/IconButton';
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { SelectableCard } from '@astryxdesign/core/SelectableCard';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import {
  PANACEA_QUESTIONNAIRE_26,
  PANACEA_TEST_CATALOG,
  QUESTIONNAIRE_DEFINITION_VERSION,
} from '../../data/panaceaCatalogs';
import { isQuestionVisible } from '../../engine/panaceaScreening';
import { usePanacea } from '../../store/PanaceaContext';
import type { QuestionnaireResponseRow, QuestionStatus, SubView } from '../../types/panacea';

interface HealthCheckViewProps {
  onBack: () => void;
  onOpenSubView: (view: SubView) => void;
}

export const HealthCheckView: React.FC<HealthCheckViewProps> = ({ onBack, onOpenSubView }) => {
  const {
    state,
    language,
    latestScreening,
    saveQuestionnaireAnswers,
    toggleTestBasket,
    setEmergencyOpen,
  } = usePanacea();
  const isAr = language === 'ar';

  const [blockFilter, setBlockFilter] = useState<string>('1');
  const [saving, setSaving] = useState(false);

  const responses = state?.questionnaireResponses || [];

  const visibleQuestions = useMemo(
    () => PANACEA_QUESTIONNAIRE_26.filter((q) => isQuestionVisible(q.id, responses)),
    [responses]
  );

  const currentBlockNum = Number(blockFilter);
  const blockQuestions = useMemo(
    () => visibleQuestions.filter((q) => q.blockNumber === currentBlockNum),
    [visibleQuestions, currentBlockNum]
  );

  const answeredCount = visibleQuestions.filter((q) => {
    const r = responses.find((row) => row.questionId === q.id);
    return r && r.status !== 'not_answered';
  }).length;

  const setAnswer = async (
    questionId: string,
    answerJson: string | string[] | null,
    status: QuestionStatus
  ) => {
    setSaving(true);
    const updated = responses.filter((r) => r.questionId !== questionId);
    const nextRow: QuestionnaireResponseRow = {
      responseId: `resp_${questionId}_${Date.now()}`,
      definitionVersion: QUESTIONNAIRE_DEFINITION_VERSION,
      questionId,
      answerJson,
      status,
      answeredAt: new Date().toISOString(),
    };
    await saveQuestionnaireAnswers([...updated, nextRow]);
    setSaving(false);
  };

  const getRow = (qId: string) => responses.find((r) => r.questionId === qId);

  const pathwayBannerStatus = (pathway?: string): 'error' | 'warning' | 'info' => {
    if (pathway === 'urgent') return 'error';
    if (pathway === 'primary_care') return 'warning';
    return 'info';
  };

  return (
    <VStack gap={5}>
      {/* Header */}
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
              {isAr ? 'التقييم الصحي التكيفي' : 'Adaptive Health Check (26-Q)'}
            </Heading>
            <Text type="supporting" color="secondary" className="tabular-nums">
              {answeredCount}/{visibleQuestions.length} {isAr ? 'مُجاب' : 'completed'} ·{' '}
              {QUESTIONNAIRE_DEFINITION_VERSION}
            </Text>
          </div>
        </HStack>

        <Button
          variant="destructive"
          size="sm"
          icon={<AlertTriangle className="w-4 h-4" />}
          label="998"
          onClick={() => setEmergencyOpen(true)}
        />
      </HStack>

      <ProgressBar
        value={answeredCount}
        max={Math.max(1, visibleQuestions.length)}
        label={isAr ? 'اكتمال الاستبيان التكيفي' : 'Adaptive Intake Progress'}
        hasValueLabel
      />

      {/* Block Switcher */}
      <div className="overflow-x-auto no-scrollbar">
        <SegmentedControl
          label={isAr ? 'أقسام الاستبيان' : 'Questionnaire blocks'}
          value={blockFilter}
          onChange={setBlockFilter}
          layout="fill"
          size="sm"
        >
          {[1, 2, 3, 4, 5].map((b) => (
            <SegmentedControlItem
              key={b}
              value={String(b)}
              label={isAr ? `القسم ${b}` : `Block ${b}`}
            />
          ))}
        </SegmentedControl>
      </div>

      {/* Deterministic 4-Pathway Result */}
      {latestScreening && (
        <Card padding={4} elevation="low">
          <VStack gap={3}>
            <Banner
              status={pathwayBannerStatus(latestScreening.pathway)}
              title={`${isAr ? latestScreening.titleAr : latestScreening.titleEn} (${
                latestScreening.urgency
              })`}
              description={isAr ? latestScreening.reasonAr : latestScreening.reasonEn}
            />

            <MetadataList columns="multi">
              <MetadataListItem label={isAr ? 'المعلومات المستخدمة' : 'Information Used'}>
                {latestScreening.used.length > 0
                  ? latestScreening.used.slice(0, 4).join(' · ')
                  : isAr
                    ? 'لم تُدخل إجابات بعد'
                    : 'No inputs recorded yet'}
              </MetadataListItem>
              <MetadataListItem
                label={
                  isAr
                    ? 'المعلومات الناقصة / غير المؤكدة (لا تُحسب لا)'
                    : 'Missing / Unknown (Never Treated as No)'
                }
              >
                {latestScreening.missing.length > 0
                  ? latestScreening.missing.slice(0, 4).join(' · ')
                  : isAr
                    ? 'الكتلة مكتملة'
                    : 'All visible items answered'}
              </MetadataListItem>
            </MetadataList>

            <HStack gap={2} hAlign="between" wrap="wrap">
              <Badge
                label={
                  isAr ? 'مسار حتمي · بدون درجة خصوبة' : 'DETERMINISTIC PATHWAY · NO FERTILITY SCORE'
                }
                variant="neutral"
              />
              <Button
                variant="primary"
                size="sm"
                label={isAr ? latestScreening.nextActionAr : latestScreening.nextActionEn}
                onClick={() => onOpenSubView(latestScreening.nextActionView)}
              />
            </HStack>
          </VStack>
        </Card>
      )}

      {/* Questions */}
      <VStack gap={3}>
        {blockQuestions.map((q) => {
          const row = getRow(q.id);
          const currentVal = row?.answerJson;
          const currentStatus = row?.status || 'not_answered';

          return (
            <Card key={q.id} padding={4} elevation="low">
              <VStack gap={3}>
                <HStack gap={2} vAlign="start" hAlign="between">
                  <div>
                    <Text type="supporting" color="accent" weight="semibold">
                      {q.id} · {isAr ? q.blockTitleAr : q.blockTitleEn}
                    </Text>
                    <Heading level={3} className="mt-1">
                      {isAr ? q.textAr : q.textEn}
                    </Heading>
                    {(q.helperEn || q.helperAr) && (
                      <Text type="supporting" color="secondary" display="block" className="mt-1">
                        {isAr ? q.helperAr : q.helperEn}
                      </Text>
                    )}
                  </div>
                  {q.urgentIfYes && <ShieldAlert className="w-4 h-4 text-red-600 shrink-0 mt-1" />}
                </HStack>

                <VStack gap={2}>
                  {q.options.map((opt) => {
                    const isSelected =
                      currentStatus === 'answered' &&
                      (Array.isArray(currentVal)
                        ? currentVal.includes(opt.value)
                        : currentVal === opt.value);

                    return (
                      <SelectableCard
                        key={opt.value}
                        label={isAr ? opt.labelAr : opt.labelEn}
                        isSelected={isSelected}
                        onChange={() => {
                          if (q.answerType === 'multi') {
                            const prevArr = Array.isArray(currentVal) ? currentVal : [];
                            const nextArr =
                              opt.value === 'None'
                                ? ['None']
                                : prevArr.includes(opt.value)
                                  ? prevArr.filter((v) => v !== opt.value)
                                  : [...prevArr.filter((v) => v !== 'None'), opt.value];
                            setAnswer(
                              q.id,
                              nextArr.length ? nextArr : null,
                              nextArr.length ? 'answered' : 'not_answered'
                            );
                          } else {
                            setAnswer(q.id, opt.value, 'answered');
                          }
                        }}
                        padding={3}
                      >
                        <Text weight={isSelected ? 'semibold' : undefined}>
                          {isAr ? opt.labelAr : opt.labelEn}
                        </Text>
                      </SelectableCard>
                    );
                  })}
                </VStack>

                <Divider />

                <HStack gap={2} vAlign="center" hAlign="between" wrap="wrap">
                  <HStack gap={2} wrap="wrap">
                    <Button
                      size="sm"
                      variant={currentStatus === 'prefer_not_to_say' ? 'primary' : 'secondary'}
                      label={isAr ? 'أفضل عدم الإجابة' : 'Prefer not to say'}
                      onClick={() => setAnswer(q.id, null, 'prefer_not_to_say')}
                    />
                    <Button
                      size="sm"
                      variant={currentStatus === 'not_sure' ? 'primary' : 'secondary'}
                      label={isAr ? 'غير متأكد' : 'Not sure'}
                      onClick={() => setAnswer(q.id, null, 'not_sure')}
                    />
                  </HStack>
                  {saving && (
                    <Text type="supporting" color="accent">
                      {isAr ? 'جاري الحفظ...' : 'Saving...'}
                    </Text>
                  )}
                </HStack>
              </VStack>
            </Card>
          );
        })}
      </VStack>

      {/* Block Pagination */}
      <HStack gap={2} hAlign="between">
        <Button
          variant="secondary"
          isDisabled={currentBlockNum <= 1}
          label={isAr ? 'القسم السابق' : 'Previous Block'}
          onClick={() => setBlockFilter(String(Math.max(1, currentBlockNum - 1)))}
        />
        {currentBlockNum < 5 ? (
          <Button
            variant="primary"
            label={isAr ? 'القسم التالي' : 'Next Block'}
            onClick={() => setBlockFilter(String(Math.min(5, currentBlockNum + 1)))}
          />
        ) : (
          <Button
            variant="primary"
            label={isAr ? 'المتابعة لحجز المختبر' : 'Proceed to Lab Booking'}
            onClick={() => onOpenSubView('lab-booking')}
          />
        )}
      </HStack>

      {/* Suggested Test Basket */}
      <Card padding={4} elevation="low" variant="purple">
        <VStack gap={3}>
          <HStack gap={2} vAlign="center">
            <FlaskConical className="w-4 h-4 text-[var(--color-accent)]" />
            <Heading level={2}>
              {isAr ? 'سلة الفحوصات المقترحة' : 'Suggested Test Basket'}
            </Heading>
          </HStack>
          <Text type="supporting" color="secondary">
            {isAr
              ? 'اختيارك للفحص هنا ليس وصفة طبية. تحليل السائل المنوي هو الفحص الوحيد المتاح للحجز حالياً.'
              : 'Selecting a test here is not a prescription. Semen analysis is the only initially bookable test in this prototype.'}
          </Text>

          <VStack gap={2}>
            {PANACEA_TEST_CATALOG.map((test) => {
              const basketRow = state?.testBasket.find((b) => b.testId === test.id);
              const selected = Boolean(basketRow?.selected);
              const alreadyDone = Boolean(basketRow?.alreadyDone);

              return (
                <Card key={test.id} padding={3}>
                  <VStack gap={2}>
                    <HStack gap={3} vAlign="start" hAlign="between">
                      <div className="min-w-0">
                        <Text weight="semibold">{isAr ? test.nameAr : test.nameEn}</Text>
                        <Text type="supporting" color="secondary" display="block" className="mt-0.5">
                          {isAr ? test.purposeAr : test.purposeEn}
                        </Text>
                        <Text type="supporting" color="accent" display="block" className="mt-1">
                          <strong>{isAr ? 'القيود:' : 'Limits:'}</strong>{' '}
                          {isAr ? test.limitsAr : test.limitsEn}
                        </Text>
                      </div>
                      {test.bookableInPrototype ? (
                        <Button
                          size="sm"
                          variant={selected ? 'primary' : 'secondary'}
                          icon={selected ? <CheckCircle2 className="w-3.5 h-3.5" /> : undefined}
                          label={
                            selected
                              ? isAr
                                ? 'مضاف'
                                : 'In Basket'
                              : isAr
                                ? 'تحديد'
                                : 'Select'
                          }
                          onClick={() => toggleTestBasket(test.id, { selected: !selected })}
                        />
                      ) : (
                        <Badge
                          label={
                            <span className="inline-flex items-center gap-1">
                              <Lock className="w-3 h-3" />
                              {isAr ? 'مقيد' : 'Gated'}
                            </span>
                          }
                          variant="neutral"
                        />
                      )}
                    </HStack>

                    {!test.bookableInPrototype && (
                      <Banner
                        status="info"
                        title={isAr ? test.gatedReasonAr || '' : test.gatedReasonEn || ''}
                      />
                    )}

                    {test.bookableInPrototype && (
                      <>
                        <Divider />
                        <HStack gap={2} vAlign="center" hAlign="between" wrap="wrap">
                          <Text type="supporting" weight="semibold" className="tabular-nums">
                            {isAr
                              ? `التكلفة الإرشادية: ~${test.indicativePriceAed} د.إ (محاكاة)`
                              : `Indicative fee: ~${test.indicativePriceAed} AED (Simulated)`}
                          </Text>
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={<ClipboardCheck className="w-3.5 h-3.5" />}
                            label={
                              alreadyDone
                                ? isAr
                                  ? 'تم تحديده كمنجز مسبقاً (ارفع التقرير)'
                                  : 'Marked Already Done (Upload in Vault)'
                                : isAr
                                  ? 'أجريته مسبقاً؟'
                                  : 'Already done recently?'
                            }
                            onClick={() => toggleTestBasket(test.id, { alreadyDone: !alreadyDone })}
                          />
                        </HStack>
                      </>
                    )}
                  </VStack>
                </Card>
              );
            })}
          </VStack>
        </VStack>
      </Card>
    </VStack>
  );
};
