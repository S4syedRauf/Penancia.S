import React, { useMemo, useState } from 'react';
import { ArrowLeft, BarChart3, Calendar as CalendarIcon, Plus, Search } from 'lucide-react';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Field } from '@astryxdesign/core/Field';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { IconButton } from '@astryxdesign/core/IconButton';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Text } from '@astryxdesign/core/Text';
import { TextArea } from '@astryxdesign/core/TextArea';
import { TextInput } from '@astryxdesign/core/TextInput';
import { VStack } from '@astryxdesign/core/VStack';
import { ActivityTimeline, type TimelineRenderItem } from '../components/ActivityTimeline';
import { CustomModal } from '../components/CustomModal';
import { WeeklyCalendar } from '../components/WeeklyCalendar';
import { PANACEA_PLAN_TEMPLATES } from '../data/panaceaCatalogs';
import { usePanacea } from '../store/PanaceaContext';
import type { SubView } from '../types/panacea';
import { parseISODate } from '../utils/dateUtils';

interface ActivityScreenProps {
  onBack: () => void;
  onOpenSearch: () => void;
  onOpenCalendar: () => void;
  onOpenSubView: (view: SubView) => void;
}

export const ActivityScreen: React.FC<ActivityScreenProps> = ({
  onBack,
  onOpenSearch,
  onOpenCalendar,
  onOpenSubView,
}) => {
  const {
    state,
    language,
    t,
    selectedDate,
    setSelectedDate,
    consistencyToday,
    setPlanActionStatus,
    logSymptom,
    updateProfile,
  } = usePanacea();

  const isAr = language === 'ar';
  const [symOpen, setSymOpen] = useState(false);
  const [symTitle, setSymTitle] = useState('');
  const [symSeverity, setSymSeverity] = useState<'mild' | 'moderate' | 'severe'>('mild');
  const [symNotes, setSymNotes] = useState('');
  const [symTime, setSymTime] = useState('09:00');
  const [savingSym, setSavingSym] = useState(false);

  const completedDates = useMemo(() => {
    if (!state) return [];
    return Object.entries(state.planCompletions)
      .filter(([, dayMap]) => Object.values(dayMap).some((s) => s === 'done'))
      .map(([d]) => d);
  }, [state]);

  const planTotalDays = useMemo(() => {
    if (!state) return 74;
    return state.user.planDuration === 'custom'
      ? state.user.customPlanDays
      : state.user.planDuration;
  }, [state]);

  const planDayNumber = useMemo(() => {
    if (!state) return 1;
    const start = parseISODate(state.user.planStartDate).getTime();
    const sel = parseISODate(selectedDate).getTime();
    return Math.max(1, Math.floor((sel - start) / 86400000) + 1);
  }, [state, selectedDate]);

  const timelineItems: TimelineRenderItem[] = useMemo(() => {
    const dayMap = state?.planCompletions[selectedDate] || {};
    const planItems: TimelineRenderItem[] = PANACEA_PLAN_TEMPLATES.map((tpl) => ({
      id: `tpl_${tpl.templateCode}`,
      kind: 'plan',
      templateCode: tpl.templateCode,
      title: isAr ? tpl.titleAr : tpl.titleEn,
      detail: isAr ? tpl.detailAr : tpl.detailEn,
      startTime: tpl.defaultTime,
      endTime: tpl.endTime,
      category: tpl.category,
      status: dayMap[tpl.templateCode] || 'pending',
    }));

    const daySymptoms: TimelineRenderItem[] = (state?.symptoms || [])
      .filter((s) => s.date === selectedDate)
      .map((s) => ({
        id: s.id,
        kind: 'symptom',
        title: `${s.title} (${s.severity})`,
        detail: s.notes,
        startTime: s.time,
        endTime: s.time,
        category: 'symptom',
        status: 'done',
      }));

    const dayLabItems: TimelineRenderItem[] = (state?.orders || [])
      .filter((o) => o.createdAt.slice(0, 10) === selectedDate)
      .map((o) => ({
        id: `ord_${o.orderId}`,
        kind: 'lab',
        title: `${o.testNameEn} · ${o.state}`,
        detail: o.slotLabel,
        startTime: '10:00',
        endTime: '10:30',
        category: 'lab',
        status: o.state === 'Complete' || o.state === 'ReportReady' ? 'done' : 'pending',
      }));

    return [...planItems, ...daySymptoms, ...dayLabItems];
  }, [state, selectedDate, isAr]);

  const openSymptomAtHour = (hour: number) => {
    setSymTime(`${String(hour).padStart(2, '0')}:00`);
    setSymOpen(true);
  };

  const handleSaveSymptom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!symTitle.trim()) return;
    setSavingSym(true);
    await logSymptom({
      title: symTitle.trim(),
      severity: symSeverity,
      notes: symNotes.trim(),
      time: symTime,
      date: selectedDate,
    });
    setSavingSym(false);
    setSymTitle('');
    setSymNotes('');
    setSymOpen(false);
  };

  return (
    <VStack gap={5}>
      <HStack gap={3} vAlign="center" hAlign="between">
        <IconButton
          label={t.common.back}
          icon={<ArrowLeft className="w-4 h-4 rtl:rotate-180" />}
          variant="secondary"
          size="sm"
          onClick={onBack}
        />

        <HStack gap={2} vAlign="center">
          <IconButton
            label={isAr ? 'بحث' : 'Search'}
            icon={<Search className="w-4 h-4" />}
            variant="secondary"
            size="sm"
            onClick={onOpenSearch}
          />
          <Button
            variant="primary"
            size="sm"
            icon={<Plus className="w-4 h-4" />}
            label={isAr ? 'تسجيل عرض' : 'Log Symptom'}
            onClick={() => openSymptomAtHour(9)}
          />
        </HStack>
      </HStack>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <VStack gap={4} className="lg:col-span-5">
          <HStack gap={3} vAlign="start" hAlign="between">
            <div>
              <Heading level={1}>{t.activity.title}</Heading>
              <Text type="supporting" color="secondary">
                {t.activity.subtitle}
              </Text>
            </div>
            <IconButton
              label={t.diary.calendarBtn}
              icon={<CalendarIcon className="w-4 h-4" />}
              variant="secondary"
              size="sm"
              onClick={onOpenCalendar}
            />
          </HStack>

          <WeeklyCalendar
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            completedDates={completedDates}
            language={language}
          />

          <Card padding={3} variant="purple">
            <HStack gap={2} vAlign="center" hAlign="between" wrap="wrap">
              <Text type="supporting" className="tabular-nums">
                <Text weight="semibold" color="primary">
                  {consistencyToday.completed}/{consistencyToday.eligible}
                </Text>{' '}
                {t.activity.completedLabel} ·{' '}
                <Text color="secondary">
                  {isAr
                    ? `اليوم ${planDayNumber}/${planTotalDays}`
                    : `Day ${planDayNumber}/${planTotalDays}`}
                </Text>
              </Text>
              <Button
                variant="ghost"
                size="sm"
                icon={<BarChart3 className="w-3.5 h-3.5" />}
                label={t.activity.historyBtn}
                onClick={() => onOpenSubView('activity-history')}
              />
            </HStack>
          </Card>

          <Banner
            status="info"
            title={
              isAr
                ? `مرونة الخطة (اليوم ${planTotalDays} نقطة مرجعية اختيارية)`
                : `Flexible Plan (${planTotalDays}-day optional checkpoint)`
            }
            description={
              isAr
                ? 'مدة الخطة للمتابعة التنظيمية فقط ولا تغني عن موعد إعادة الفحص الذي يحدده الطبيب.'
                : 'Habit tracking never overrides a clinician-set retest or urgent referral alert.'
            }
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 w-full">
              <Button
                size="sm"
                width="100%"
                variant={!state?.user.extended15Days ? 'primary' : 'secondary'}
                label={isAr ? 'اتّبع موعد الطبيب' : 'Follow retest date'}
                onClick={() => updateProfile({ extended15Days: false })}
              />
              <Button
                size="sm"
                width="100%"
                variant={state?.user.extended15Days ? 'primary' : 'secondary'}
                label={isAr ? 'تمديد ١٥ يوماً اختيارياً' : 'Continue +15 optional days'}
                onClick={() => updateProfile({ extended15Days: true })}
              />
            </div>
          </Banner>
        </VStack>

        <div className="lg:col-span-7">
          <ActivityTimeline
            items={timelineItems}
            language={language}
            onSetPlanStatus={(code, status) => setPlanActionStatus(code, status, selectedDate)}
            onAddSymptomAtHour={openSymptomAtHour}
            onOpenLabOrder={() => onOpenSubView('lab-booking')}
          />
        </div>
      </div>

      <CustomModal
        isOpen={symOpen}
        onClose={() => setSymOpen(false)}
        title={isAr ? 'تسجيل عرض أو ملاحظة خاصة' : 'Log Private Symptom or Note'}
      >
        <form onSubmit={handleSaveSymptom}>
          <VStack gap={4}>
            <TextInput
              label={isAr ? 'العرض أو الملاحظة' : 'Symptom or context'}
              value={symTitle}
              onChange={setSymTitle}
              isRequired
              placeholder={
                isAr
                  ? 'مثال: ألم خفيف، إجهاد حراري، حرقة...'
                  : 'e.g., Mild ache, sauna heat, sleep deficit...'
              }
            />

            <Field
              label={isAr ? 'الشدة' : 'Severity'}
              inputID="sym-severity"
              isGroupLabel
            >
              <SegmentedControl
                label={isAr ? 'الشدة' : 'Severity'}
                layout="fill"
                value={symSeverity}
                onChange={(val) => setSymSeverity(val as 'mild' | 'moderate' | 'severe')}
              >
                <SegmentedControlItem value="mild" label={isAr ? 'خفيف' : 'Mild'} />
                <SegmentedControlItem value="moderate" label={isAr ? 'متوسط' : 'Moderate'} />
                <SegmentedControlItem value="severe" label={isAr ? 'شديد' : 'Severe'} />
              </SegmentedControl>
            </Field>

            <TextInput
              label={isAr ? 'الوقت' : 'Time (HH:mm)'}
              value={symTime}
              onChange={setSymTime}
            />

            <TextArea
              label={isAr ? 'ملاحظات إضافية' : 'Additional notes (optional)'}
              value={symNotes}
              onChange={setSymNotes}
              placeholder={isAr ? 'تفاصيل اختيارية...' : 'Optional context...'}
            />

            <HStack gap={2} hAlign="end">
              <Button
                variant="ghost"
                label={t.common.cancel}
                onClick={() => setSymOpen(false)}
              />
              <Button
                type="submit"
                variant="primary"
                isLoading={savingSym}
                label={t.common.save}
              />
            </HStack>
          </VStack>
        </form>
      </CustomModal>
    </VStack>
  );
};
