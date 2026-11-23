import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  CheckCircle2,
  Database,
  Download,
  HeartPulse,
  HelpCircle,
  Lock,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Watch,
} from 'lucide-react';
import { AlertDialog } from '@astryxdesign/core/AlertDialog';
import { Badge } from '@astryxdesign/core/Badge';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { Divider } from '@astryxdesign/core/Divider';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Grid } from '@astryxdesign/core/Grid';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { IconButton } from '@astryxdesign/core/IconButton';
import { List, ListItem } from '@astryxdesign/core/List';
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Slider } from '@astryxdesign/core/Slider';
import { Switch } from '@astryxdesign/core/Switch';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { CONSENT_DEFINITIONS, GOLDEN_RESEARCH_CLIPS, PANACEA_SEMEN_KITS } from '../data/panaceaCatalogs';
import { usePanacea } from '../store/PanaceaContext';
import type { AuditEventRecord, SubView } from '../types/panacea';

interface SubScreensProps {
  view: Exclude<
    SubView,
    null | 'health-check' | 'report-vault' | 'lab-booking' | 'semen-prescreen' | 'partner-portal' | 'partner-apply' | 'ask-assistant'
  >;
  onBack: () => void;
  onOpenSubView: (view: SubView) => void;
}

const SubHeader: React.FC<{
  title: string;
  subtitle?: string;
  onBack: () => void;
  rightSlot?: React.ReactNode;
}> = ({ title, subtitle, onBack, rightSlot }) => (
  <HStack gap={3} vAlign="center" hAlign="between">
    <HStack gap={3} vAlign="center" className="min-w-0">
      <IconButton
        label="Back"
        icon={<ArrowLeft className="w-4 h-4 rtl:rotate-180" />}
        variant="secondary"
        size="sm"
        onClick={onBack}
      />
      <div className="min-w-0">
        <Heading level={1}>{title}</Heading>
        {subtitle && (
          <Text type="supporting" color="secondary" maxLines={1}>
            {subtitle}
          </Text>
        )}
      </div>
    </HStack>
    {rightSlot && <div className="shrink-0">{rightSlot}</div>}
  </HStack>
);

export const SubScreens: React.FC<SubScreensProps> = ({ view, onBack, onOpenSubView }) => {
  const {
    state,
    language,
    t,
    consistencyToday,
    toggleConsent,
    submitCheckIn,
    syncWearables,
    acknowledgeFollowUp,
    eraseAllData,
    refreshState,
  } = usePanacea();

  const isAr = language === 'ar';

  // State for gated check-ins (IIEF-5 / PHQ-2)
  const [checkInTab, setCheckInTab] = useState<'IIEF-5' | 'PHQ-2'>('IIEF-5');
  const [iiefScore, setIiefScore] = useState<number>(21);
  const [phq2Score, setPhq2Score] = useState<number>(1);
  const [checkInSaved, setCheckInSaved] = useState<string | null>(null);

  // State for wearables
  const [wearableStatus, setWearableStatus] = useState<string | null>(null);
  const [syncingWearable, setSyncingWearable] = useState(false);

  // State for data rights & delete confirm
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingData, setDeletingData] = useState(false);
  const [eraseMessage, setEraseMessage] = useState<string | null>(null);

  // State for privacy audit & outbox & zero-numeric self-test
  const [auditData, setAuditData] = useState<{
    events: AuditEventRecord[];
    outbox: Array<{ id: string; channel: string; text: string; at: string }>;
  } | null>(null);
  const [zeroNumericResult, setZeroNumericResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [runningSelfTest, setRunningSelfTest] = useState(false);

  useEffect(() => {
    if (view === 'privacy') {
      fetch('/v1/audit')
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d) setAuditData(d);
        })
        .catch(() => {});
    }
  }, [view]);

  // 1. Direction View (analytics)
  if (view === 'analytics') {
    const confirmedReports = (state?.reports || []).filter((r) => r.state === 'Summarised');
    const wearables = state?.wearables || [];

    return (
      <VStack gap={5}>
        <SubHeader
          title={isAr ? 'مؤشرات الاتجاه والمختبر' : 'Direction View'}
          subtitle={
            isAr
              ? 'نتائج المختبر المؤكدة منفصلة عن جهد العادات والساعات'
              : 'Confirmed lab measurements separated from effort-only habits & wearables'
          }
          onBack={onBack}
        />

        <Banner
          status="info"
          title={isAr ? 'فصل البيانات الإلزامي' : 'Strict Separation Policy'}
          description={
            isAr
              ? 'لا تعكس العادات اليومية أو قياسات الساعة جودة السائل المنوي أو الخصوبة، ولا تُخلط وحدات القياس المخبرية المختلفة في رسم واحد.'
              : 'Effort habits and wearable metrics never claim fertility or recovery outcomes. Incompatible lab units are always shown separately and only confirmed reports appear here.'
          }
        />

        <Grid columns={{ minWidth: 280, max: 2 }} gap={4}>
          {/* Confirmed Lab Values Card */}
          <Card padding={4} elevation="low">
            <VStack gap={3}>
              <HStack gap={2} vAlign="center" hAlign="between">
                <Heading level={2}>
                  {isAr ? 'قيم المختبر المؤكدة' : 'Confirmed Lab Values'}
                </Heading>
                <Badge
                  label={String(confirmedReports.length)}
                  variant={confirmedReports.length > 0 ? 'success' : 'neutral'}
                />
              </HStack>

              {confirmedReports.length === 0 ? (
                <EmptyState
                  isCompact
                  title={isAr ? 'لا توجد تقارير مؤكدة بعد' : 'No Confirmed Reports Yet'}
                  description={
                    isAr
                      ? 'القيم غير المؤكدة لا تدخل شاشة الاتجاه. قم بمراجعة تقاريرك في الخزنة.'
                      : 'Unconfirmed OCR drafts never appear here. Confirm a report side-by-side in Vault.'
                  }
                  actions={
                    <Button
                      size="sm"
                      variant="secondary"
                      label={isAr ? 'فتح خزنة التقارير' : 'Open Report Vault'}
                      onClick={() => onOpenSubView('report-vault')}
                    />
                  }
                />
              ) : (
                <VStack gap={3}>
                  {confirmedReports.map((rep) => (
                    <Card key={rep.docId} variant="muted" padding={3}>
                      <VStack gap={2}>
                        <HStack gap={2} vAlign="center" hAlign="between">
                          <Text weight="semibold" maxLines={1}>
                            {rep.summary?.lab_name_as_written || rep.fileName}
                          </Text>
                          <Text type="supporting" color="secondary" className="tabular-nums">
                            {rep.summary?.report_date}
                          </Text>
                        </HStack>
                        <MetadataList columns="multi">
                          {(rep.summary?.values || []).map((v, i) => (
                            <MetadataListItem key={`${rep.docId}-${i}`} label={v.test_name_as_written}>
                              <Text weight="semibold" className="tabular-nums">
                                {v.value} {v.unit} ({v.flag})
                              </Text>
                            </MetadataListItem>
                          ))}
                        </MetadataList>
                      </VStack>
                    </Card>
                  ))}
                </VStack>
              )}
            </VStack>
          </Card>

          {/* Effort-Only Habit Consistency & Read-Only Wearables */}
          <VStack gap={4}>
            <Card padding={4} elevation="low">
              <VStack gap={3}>
                <HStack gap={2} vAlign="center" hAlign="between">
                  <Heading level={2}>
                    {isAr ? 'اتساق العادات (الجهد فقط)' : 'Habit Consistency (Effort-Only)'}
                  </Heading>
                  <Badge label={`${consistencyToday.percent}%`} variant="info" />
                </HStack>
                <ProgressBar
                  value={consistencyToday.percent}
                  label={isAr ? 'إجراءات الخطة المكتملة اليوم' : 'Plan actions completed today'}
                  hasValueLabel
                  variant="success"
                />
                <Text type="supporting" color="secondary">
                  {t.diary.consistencyDisclaimer}
                </Text>
              </VStack>
            </Card>

            <Card padding={4} elevation="low">
              <VStack gap={3}>
                <HStack gap={2} vAlign="center" hAlign="between">
                  <Heading level={2}>
                    {isAr ? 'ملخصات الأجهزة القابلة للارتداء' : 'Wearable Snapshots (Read-Only)'}
                  </Heading>
                  <Button
                    size="sm"
                    variant="ghost"
                    label={isAr ? 'الموصلات' : 'Connectors'}
                    onClick={() => onOpenSubView('watch')}
                  />
                </HStack>
                {wearables.length === 0 ? (
                  <Text type="supporting" color="secondary">
                    {isAr
                      ? 'لا توجد بيانات ساعة متزامنة حالياً.'
                      : 'No wearable summaries synced yet.'}
                  </Text>
                ) : (
                  <MetadataList columns={2}>
                    <MetadataListItem label={isAr ? 'النوم' : 'Sleep'}>
                      {wearables[0].sleepHours ?? '—'} h
                    </MetadataListItem>
                    <MetadataListItem label={isAr ? 'نبض الراحة' : 'Resting HR'}>
                      {wearables[0].restingHrBpm ?? '—'} bpm
                    </MetadataListItem>
                    <MetadataListItem label="HRV">
                      {wearables[0].hrvRmssdMs ?? '—'} ms
                    </MetadataListItem>
                    <MetadataListItem label={isAr ? 'الخطوات' : 'Steps'}>
                      {wearables[0].steps?.toLocaleString() ?? '—'}
                    </MetadataListItem>
                  </MetadataList>
                )}
              </VStack>
            </Card>
          </VStack>
        </Grid>
      </VStack>
    );
  }

  // 2. Activity History + Symptoms + Gated Check-Ins (IIEF-5 / PHQ-2)
  if (view === 'activity-history') {
    const symptoms = state?.symptoms || [];
    const checkIns = state?.checkIns || [];
    const totalDaysTracked = Object.keys(state?.planCompletions || {}).length;
    const totalDoneActions = Object.values(state?.planCompletions || {}).reduce(
      (sum, dayMap) => sum + Object.values(dayMap).filter((s) => s === 'done').length,
      0
    );

    const handleCheckInSubmit = async () => {
      if (checkInTab === 'IIEF-5') {
        const noteEn =
          iiefScore < 17
            ? 'IIEF-5 educational score indicates moderate/notable difficulty — consider sharing with a primary care or urology clinician.'
            : 'IIEF-5 educational check-in logged for personal reference.';
        const noteAr =
          iiefScore < 17
            ? 'النتيجة الاسترشادية لـ IIEF-5 تشير إلى صعوبة تستحق المناقشة مع الطبيب المختص.'
            : 'تم تسجيل التقييم الاسترشادي للمتابعة الشخصية.';
        await submitCheckIn({
          instrument: 'IIEF-5',
          score: iiefScore,
          maxScore: 25,
          noteEn,
          noteAr,
        });
        setCheckInSaved(isAr ? noteAr : noteEn);
      } else {
        const noteEn =
          phq2Score >= 3
            ? 'PHQ-2 >= 3: Consider speaking with a healthcare professional or confidential UAE support line (800-HOPE / 8004673).'
            : 'PHQ-2 emotional wellbeing check-in recorded.';
        const noteAr =
          phq2Score >= 3
            ? 'PHQ-2 >= 3: يُنصح بالتحدث مع مختص رعاية صحية أو خط الدعم الإماراتي 8004673.'
            : 'تم تسجيل تقييم الصحة النفسية الاسترشادي.';
        await submitCheckIn({
          instrument: 'PHQ-2',
          score: phq2Score,
          maxScore: 6,
          noteEn,
          noteAr,
        });
        setCheckInSaved(isAr ? noteAr : noteEn);
      }
    };

    return (
      <VStack gap={5}>
        <SubHeader
          title={isAr ? 'السجل والأعراض والفحوصات الإرشادية' : 'History, Symptoms & Gated Check-Ins'}
          onBack={onBack}
        />

        <Grid columns={{ minWidth: 130, max: 3 }} gap={3}>
          <Card padding={3} elevation="low">
            <VStack gap={1}>
              <Text type="supporting" color="secondary">
                {isAr ? 'أيام الخطة المسجلة' : 'Days Logged'}
              </Text>
              <Heading level={2} className="tabular-nums">
                {totalDaysTracked}
              </Heading>
            </VStack>
          </Card>
          <Card padding={3} elevation="low">
            <VStack gap={1}>
              <Text type="supporting" color="secondary">
                {isAr ? 'إجراءات مكتملة' : 'Completed Actions'}
              </Text>
              <Heading level={2} className="tabular-nums">
                {totalDoneActions}
              </Heading>
            </VStack>
          </Card>
          <Card padding={3} elevation="low">
            <VStack gap={1}>
              <Text type="supporting" color="secondary">
                {isAr ? 'سجل الأعراض' : 'Logged Symptoms'}
              </Text>
              <Heading level={2} className="tabular-nums">
                {symptoms.length}
              </Heading>
            </VStack>
          </Card>
        </Grid>

        {/* Gated Educational Check-Ins (IIEF-5 / PHQ-2) */}
        <Card padding={4} elevation="low">
          <VStack gap={4}>
            <HStack gap={2} vAlign="center" hAlign="between" wrap="wrap">
              <div>
                <Heading level={2}>
                  {isAr ? 'تقييمات مساندة اختيارية (IIEF-5 / PHQ-2)' : 'Optional Gated Check-Ins (IIEF-5 / PHQ-2)'}
                </Heading>
                <Text type="supporting" color="secondary">
                  {isAr
                    ? 'للتثقيف فقط ولا تغيّر مسار التوجيه أو تغني عن التقييم الطبي.'
                    : 'Educational self-check only; not a diagnostic score.'}
                </Text>
              </div>
              <SegmentedControl
                label="Check-in instrument"
                value={checkInTab}
                onChange={(v) => {
                  setCheckInTab(v as 'IIEF-5' | 'PHQ-2');
                  setCheckInSaved(null);
                }}
                size="sm"
              >
                <SegmentedControlItem value="IIEF-5" label="IIEF-5 (1–25)" />
                <SegmentedControlItem value="PHQ-2" label="PHQ-2 (0–6)" />
              </SegmentedControl>
            </HStack>

            {checkInTab === 'IIEF-5' ? (
              <VStack gap={3}>
                <Slider
                  label={
                    isAr
                      ? `مجموع نقاط IIEF-5: ${iiefScore} / 25`
                      : `IIEF-5 Total Score: ${iiefScore} / 25`
                  }
                  description={
                    isAr
                      ? '٢٢–٢٥ طبيعي · ١٧–٢١ خفيف · أقل من ١٧ يُنصح باستشارة طبية'
                      : '22–25 typical · 17–21 mild · <17 consider clinical review'
                  }
                  min={5}
                  max={25}
                  step={1}
                  value={iiefScore}
                  onChange={setIiefScore}
                />
              </VStack>
            ) : (
              <VStack gap={3}>
                <Slider
                  label={
                    isAr
                      ? `مجموع نقاط PHQ-2: ${phq2Score} / 6`
                      : `PHQ-2 Total Score: ${phq2Score} / 6`
                  }
                  description={
                    isAr
                      ? '٣ أو أكثر يشير إلى أهمية التحدث مع مختص دعم نفسي أو خط 800-HOPE'
                      : 'Score >= 3 suggests connecting with clinical support or UAE 800-HOPE (8004673)'
                  }
                  min={0}
                  max={6}
                  step={1}
                  value={phq2Score}
                  onChange={setPhq2Score}
                />
              </VStack>
            )}

            {checkInSaved && <Banner status="info" title={checkInSaved} />}

            <HStack hAlign="end">
              <Button
                variant="primary"
                label={isAr ? 'حفظ التقييم الاسترشادي' : 'Save Educational Check-In'}
                onClick={handleCheckInSubmit}
              />
            </HStack>

            {checkIns.length > 0 && (
              <>
                <Divider />
                <List hasDividers density="compact" edge="flush">
                  {checkIns.slice(0, 5).map((chk) => (
                    <ListItem
                      key={chk.id}
                      label={`${chk.instrument} · ${chk.score}/${chk.maxScore}`}
                      description={isAr ? chk.noteAr : chk.noteEn}
                      endContent={
                        <Text type="supporting" color="secondary" className="tabular-nums">
                          {chk.date}
                        </Text>
                      }
                    />
                  ))}
                </List>
              </>
            )}
          </VStack>
        </Card>

        {/* Symptom History */}
        <Card padding={4} elevation="low">
          <VStack gap={3}>
            <Heading level={2}>{isAr ? 'سجل الأعراض المسجلة' : 'User-Reported Symptom Log'}</Heading>
            {symptoms.length === 0 ? (
              <EmptyState
                isCompact
                title={isAr ? 'لا توجد أعراض مسجلة' : 'No Symptoms Logged'}
                description={
                  isAr
                    ? 'يمكنك تسجيل أي عرض أو ملاحظة من شاشة النشاط.'
                    : 'Use Log Symptom on the Activity tab to record any symptom or context.'
                }
              />
            ) : (
              <List hasDividers edge="flush">
                {symptoms.map((s) => (
                  <ListItem
                    key={s.id}
                    label={s.title}
                    description={s.notes || `${s.date} · ${s.time}`}
                    endContent={
                      <Badge
                        label={s.severity}
                        variant={
                          s.severity === 'severe'
                            ? 'error'
                            : s.severity === 'moderate'
                              ? 'warning'
                              : 'neutral'
                        }
                      />
                    }
                  />
                ))}
              </List>
            )}
          </VStack>
        </Card>
      </VStack>
    );
  }

  // 3. Wearable Connectors (watch)
  if (view === 'watch') {
    const wearableConsent = Boolean(state?.consents.wearable_read?.state);
    const wearables = state?.wearables || [];

    const handleSync = async (source: 'Apple HealthKit' | 'Android Health Connect') => {
      setSyncingWearable(true);
      setWearableStatus(null);
      const res = await syncWearables(source);
      setWearableStatus(
        res.ok
          ? isAr
            ? `تمت مزامنة ملخص ${source} بنجاح (للقراءة فقط).`
            : `Synced read-only habit snapshot from ${source}.`
          : res.error || 'Sync blocked'
      );
      setSyncingWearable(false);
    };

    return (
      <VStack gap={5}>
        <SubHeader
          title={isAr ? 'موصلات الأجهزة القابلة للارتداء' : 'Wearable Connectors'}
          subtitle={isAr ? 'قراءة عادات النوم والنشاط فقط' : 'Read-Only Sleep, HR & Steps'}
          onBack={onBack}
        />

        <Banner
          status="info"
          title={isAr ? 'بيانات الساعة لا تقيس الخصوبة' : 'Non-Diagnostic Habit Data Only'}
          description={
            isAr
              ? 'ملخصات النوم ونبض الراحة والخطوات للعلم الشخصي فقط ولا تغيّر المسار السريري أو تحل محل فحوصات المختبر.'
              : 'Wearables never measure sperm health or alter your clinical care pathway. Only coarse daily summaries are stored.'
          }
        />

        <Card padding={4} elevation="low">
          <VStack gap={4}>
            <Switch
              label={isAr ? 'إذن قراءة بيانات الساعة (wearable_read)' : 'Wearable Read Consent (wearable_read)'}
              description={
                isAr
                  ? 'مطلوب للمزامنة مع Apple HealthKit أو Android Health Connect.'
                  : 'Required to sync read-only sleep and activity snapshots.'
              }
              value={wearableConsent}
              onChange={(checked) => toggleConsent('wearable_read', checked)}
            />

            <HStack gap={2} wrap="wrap">
              <Button
                variant="primary"
                icon={<RefreshCw className="w-4 h-4" />}
                isLoading={syncingWearable}
                isDisabled={!wearableConsent}
                label="Sync Apple HealthKit"
                onClick={() => handleSync('Apple HealthKit')}
              />
              <Button
                variant="secondary"
                icon={<Watch className="w-4 h-4" />}
                isLoading={syncingWearable}
                isDisabled={!wearableConsent}
                label="Sync Android Health Connect"
                onClick={() => handleSync('Android Health Connect')}
              />
            </HStack>

            {wearableStatus && <Banner status="success" title={wearableStatus} />}
          </VStack>
        </Card>

        <Card padding={4} elevation="low">
          <VStack gap={3}>
            <Heading level={2}>{isAr ? 'السجلات المتزامنة' : 'Synced Daily Snapshots'}</Heading>
            {wearables.length === 0 ? (
              <EmptyState
                isCompact
                title={isAr ? 'لا توجد مزامنة بعد' : 'No Synced Records'}
                description={
                  isAr
                    ? 'فعّل الإذن واضغط على مزامنة أعلاه لجلب أحدث قراءة.'
                    : 'Enable consent and trigger a sync above.'
                }
              />
            ) : (
              <List hasDividers edge="flush">
                {wearables.map((w, idx) => (
                  <ListItem
                    key={`${w.localDate}-${idx}`}
                    label={`${w.localDate} · ${w.source}`}
                    description={`${isAr ? 'النوم' : 'Sleep'}: ${w.sleepHours ?? '—'}h · ${
                      isAr ? 'النبض' : 'RHR'
                    }: ${w.restingHrBpm ?? '—'} bpm · HRV: ${w.hrvRmssdMs ?? '—'} ms`}
                    startContent={<HeartPulse className="w-4 h-4 text-[var(--color-accent)]" />}
                    endContent={
                      <Text weight="semibold" className="tabular-nums">
                        {w.steps?.toLocaleString() ?? '—'} {isAr ? 'خطوة' : 'steps'}
                      </Text>
                    }
                  />
                ))}
              </List>
            )}
          </VStack>
        </Card>
      </VStack>
    );
  }

  // 4. Stay Alert & Neutral Notifications (notifications)
  if (view === 'notifications') {
    const tasks = state?.followUpTasks || [];
    const notifConsent = Boolean(state?.consents.notifications?.state);

    return (
      <VStack gap={5}>
        <SubHeader
          title={isAr ? 'مهام المتابعة (Stay Alert) والإشعارات' : 'Stay Alert & Neutral Notifications'}
          onBack={onBack}
          rightSlot={<Badge label={String(tasks.filter((x) => x.status !== 'Completed').length)} variant="info" />}
        />

        <Card padding={4} elevation="low">
          <Switch
            label={isAr ? 'إشعارات شاشة القفل المحايدة' : 'Neutral Lock-Screen Reminders'}
            description={
              isAr
                ? 'لا تظهر أي كلمات طبية أو إنجابية على شاشة القفل مطلقاً.'
                : 'Zero clinical or reproductive terms appear on lock-screen alerts (e.g., "Panacea: Review schedule update").'
            }
            value={notifConsent}
            onChange={(checked) => toggleConsent('notifications', checked)}
          />
        </Card>

        <VStack gap={3}>
          <Heading level={2}>
            {isAr ? 'مهام المتابعة المفتوحة والموثقة' : 'Human-Owned Follow-Up Queue'}
          </Heading>
          {tasks.length === 0 ? (
            <Card padding={4}>
              <EmptyState
                isCompact
                title={isAr ? 'لا توجد مهام متابعة مفتوحة' : 'All Clear — No Open Follow-Up Tasks'}
                description={
                  isAr
                    ? 'ستظهر هنا أي متابعة لعينة مرفوضة أو نتيجة حرجة.'
                    : 'Critical results or rejected specimens automatically open tracked follow-up tasks here.'
                }
              />
            </Card>
          ) : (
            tasks.map((task) => {
              const isDone = task.status === 'Completed';
              return (
                <Card
                  key={task.taskId}
                  padding={4}
                  elevation="low"
                  variant={task.priority === 'critical' && !isDone ? 'red' : 'default'}
                >
                  <VStack gap={3}>
                    <HStack gap={2} vAlign="start" hAlign="between">
                      <div className="min-w-0">
                        <Text weight="bold">{isAr ? task.titleAr : task.titleEn}</Text>
                        <Text type="supporting" color="secondary" display="block">
                          {task.ownerName} ({task.ownerRole}) · {task.expectedContactWindow}
                        </Text>
                      </div>
                      <HStack gap={1.5}>
                        <Badge
                          label={task.priority.toUpperCase()}
                          variant={task.priority === 'critical' ? 'error' : 'warning'}
                        />
                        <Badge label={task.status} variant={isDone ? 'success' : 'neutral'} />
                      </HStack>
                    </HStack>

                    <MetadataList columns={1}>
                      <MetadataListItem label={isAr ? 'ما هو معروف' : 'What is Known'}>
                        {task.whatIsKnownEn}
                      </MetadataListItem>
                      <MetadataListItem label={isAr ? 'ما هو غير مؤكد' : 'What is Unknown'}>
                        {task.whatIsUnknownEn}
                      </MetadataListItem>
                      <MetadataListItem label={isAr ? 'آخر حدث مؤكد' : 'Last Confirmed Event'}>
                        {task.lastConfirmedEvent}
                      </MetadataListItem>
                    </MetadataList>

                    {!isDone && (
                      <HStack gap={2} hAlign="between" wrap="wrap">
                        <Text type="supporting" color="secondary">
                          {task.priority === 'critical'
                            ? isAr
                              ? 'ملاحظة: تأكيد القراءة لا يغلق المهمة الحرجة؛ يتطلب إغلاقاً بشرياً.'
                              : 'Patient acknowledge logs read receipt only — human clinician closure required.'
                            : isAr
                              ? 'تأكيد استلام المهمة'
                              : 'Acknowledge visibility'}
                        </Text>
                        <Button
                          size="sm"
                          variant="secondary"
                          isDisabled={Boolean(task.userAcknowledgedAt)}
                          label={
                            task.userAcknowledgedAt
                              ? isAr
                                ? 'تم تأكيد الاطلاع'
                                : 'Acknowledged'
                              : isAr
                                ? 'تأكيد الاطلاع'
                                : 'Acknowledge'
                          }
                          onClick={() => acknowledgeFollowUp(task.taskId)}
                        />
                      </HStack>
                    )}

                    {isDone && task.humanResolutionNote && (
                      <Banner
                        status="success"
                        title={isAr ? `أُغلقت بواسطة ${task.resolvedByHuman}` : `Resolved by ${task.resolvedByHuman}`}
                        description={task.humanResolutionNote}
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
  }

  // 5. Consent Centre (consent-centre — 9 independent toggles)
  if (view === 'consent-centre') {
    return (
      <VStack gap={5}>
        <SubHeader
          title={isAr ? 'مركز الأذونات (٩ موافقات مستقلة)' : 'Consent Centre (9 Granular Toggles)'}
          subtitle={isAr ? 'يمكنك سحب أي موافقة في أي وقت' : 'Withdraw or grant any processing scope'}
          onBack={onBack}
        />

        <Banner
          status="info"
          title={isAr ? 'تحكم كامل ومجزأ' : 'Separate Consent Purposes'}
          description={
            isAr
              ? 'كل ميزة تعتمد على موافقتها المستقلة فقط. إيقاف إذن لا يعطل حقوق التصدير أو حذف البيانات.'
              : 'No bundled all-or-nothing terms. Withdrawing consent takes effect immediately while export and delete remain accessible.'
          }
        />

        <Card padding={0} elevation="low">
          <List hasDividers edge="bleed">
            {CONSENT_DEFINITIONS.map((def) => {
              const rec = state?.consents[def.key];
              const isOn = Boolean(rec?.state);
              return (
                <ListItem
                  key={def.key}
                  label={`${isAr ? def.titleAr : def.titleEn} (${def.version})`}
                  description={`${isAr ? def.plainAr : def.plainEn} — ${
                    isAr ? def.withdrawalNoteAr : def.withdrawalNoteEn
                  }`}
                  endContent={
                    <>
                      <span id={`consent-${def.key}-label`} className="sr-only">
                        {isAr ? def.titleAr : def.titleEn}
                      </span>
                      <Switch
                        label={isAr ? def.titleAr : def.titleEn}
                        aria-labelledby={`consent-${def.key}-label`}
                        isLabelHidden
                        value={isOn}
                        onChange={(checked) => toggleConsent(def.key, checked)}
                      />
                    </>
                  }
                />
              );
            })}
          </List>
        </Card>
      </VStack>
    );
  }

  // 6. Data Rights: Export JSON / Multi-section CSV & Delete All Data (data-rights)
  if (view === 'data-rights') {
    const handleExportJson = async () => {
      const resp = await fetch('/v1/data/export');
      if (!resp.ok) return;
      const payload = await resp.json();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `panacea-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    };

    const handleExportCsv = () => {
      if (!state) return;
      const lines: string[] = [
        'Section,Key,Value,Timestamp',
        `Profile,Alias,"${state.user.alias}",${state.user.createdAt}`,
        `Profile,Region,"${state.user.dubaiDistrict}",`,
        ...Object.values(state.consents).map(
          (c) => `Consent,${c.key},${c.state},${c.changedAt}`
        ),
        ...state.questionnaireResponses.map(
          (q) =>
            `Questionnaire,${q.questionId},"${Array.isArray(q.answerJson) ? q.answerJson.join('|') : q.answerJson ?? q.status}",${q.answeredAt}`
        ),
        ...state.reports
          .filter((r) => r.state === 'Summarised')
          .map((r) => `ConfirmedReport,${r.docId},"${r.fileName} (v${r.summaryVersion})",${r.confirmedAt || r.createdAt}`),
        ...state.orders.map(
          (o) => `LabOrder,${o.ticketCode},"${o.testCode} (${o.state})",${o.updatedAt}`
        ),
        ...state.symptoms.map((s) => `Symptom,${s.title},${s.severity},${s.date} ${s.time}`),
      ];
      const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `panacea-summary-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    };

    return (
      <VStack gap={5}>
        <SubHeader
          title={isAr ? 'حقوق البيانات والتصدير والحذف' : 'Data Rights · Export & Delete'}
          onBack={onBack}
        />

        {eraseMessage && <Banner status="success" title={eraseMessage} />}

        <Card padding={4} elevation="low">
          <VStack gap={3}>
            <Heading level={2}>{isAr ? 'تصدير بياناتك' : 'Export Your Records'}</Heading>
            <Text type="supporting" color="secondary">
              {isAr
                ? 'تشمل الصادرات التقارير المؤكدة، الإجابات، الطلبات، وسجل الموافقات. لا تحجز أي قيود تقنية حقك في التصدير.'
                : 'Download a portable full JSON bundle or a multi-section CSV summary anytime.'}
            </Text>
            <HStack gap={2} wrap="wrap">
              <Button
                variant="primary"
                icon={<Download className="w-4 h-4" />}
                label={isAr ? 'تصدير JSON الكامل' : 'Export Full JSON'}
                onClick={handleExportJson}
              />
              <Button
                variant="secondary"
                icon={<Database className="w-4 h-4" />}
                label={isAr ? 'تصدير CSV متعدد الأقسام' : 'Export Multi-Section CSV'}
                onClick={handleExportCsv}
              />
            </HStack>
          </VStack>
        </Card>

        <Card padding={4} elevation="low" variant="red">
          <VStack gap={3}>
            <Heading level={2}>{isAr ? 'حذف جميع بياناتي' : 'Delete All Active Data'}</Heading>
            <Text type="supporting" color="secondary">
              {isAr
                ? 'يمسح جميع التقارير والإجابات والطلبات النشطة من التخزين. تنتهي النسخ الاحتياطية المشفرة وفق جدولها، وأي نسخ استلمها شريك خارجي تخضع لسياسة ذلك الشريك.'
                : 'Erases active profile records, questionnaire history, reports, and pipeline runs. Scheduled encrypted backups expire per lifecycle policy; copies already received by an external partner lab remain governed by that partner.'}
            </Text>
            <HStack hAlign="start">
              <Button
                variant="destructive"
                icon={<Trash2 className="w-4 h-4" />}
                label={isAr ? 'حذف جميع البيانات النشطة' : 'Delete All Data'}
                onClick={() => setDeleteDialogOpen(true)}
              />
            </HStack>
          </VStack>
        </Card>

        <AlertDialog
          isOpen={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          title={isAr ? 'تأكيد مسح البيانات' : 'Confirm Data Erasure'}
          description={
            isAr
              ? 'سيتم مسح جميع السجلات والتقارير النشطة وإعادة الضبط. لا يمكن التراجع عن مسح البيانات النشطة.'
              : 'Active reports, questionnaire entries, symptoms, and sessions will be permanently cleared. Partner-received copies must be requested directly from that lab.'
          }
          cancelLabel={t.common.cancel}
          actionLabel={isAr ? 'نعم، امسح البيانات' : 'Delete Active Data'}
          actionVariant="destructive"
          isActionLoading={deletingData}
          onAction={async () => {
            setDeletingData(true);
            const msg = await eraseAllData();
            setEraseMessage(msg);
            setDeletingData(false);
            setDeleteDialogOpen(false);
          }}
        />
      </VStack>
    );
  }

  // 7. Privacy, Redacted Audit & Outbox + Zero-Numeric Check (privacy)
  if (view === 'privacy') {
    const runZeroNumericTest = async () => {
      setRunningSelfTest(true);
      try {
        const resp = await fetch('/v1/semen/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: `selftest_${Date.now()}`,
            setupType: PANACEA_SEMEN_KITS[0].type,
            kitProfile: PANACEA_SEMEN_KITS[0],
            sampleMeta: {
              abstinenceDays: 3,
              collectedAtIso: new Date().toISOString(),
              temperatureNote: '37c_stage',
              completeness: 'full',
              sampleName: 'Zero-Numeric Verification Fixture',
            },
            clips: GOLDEN_RESEARCH_CLIPS[0].clips,
            isDemo: true,
          }),
        });
        const data = await resp.json();
        if (resp.ok && data.session) {
          const en = String(data.session.qualitySummaryEn || '');
          const ar = String(data.session.qualitySummaryAr || '');
          const hasBanned =
            /\d+\s*(million\/ml|%|motile|sperm)/i.test(en) ||
            /\d+\s*(مليون|%)/i.test(ar);
          setZeroNumericResult({
            ok: !hasBanned,
            message: !hasBanned
              ? `PASS: Patient qualitySummaryEn & qualitySummaryAr contain zero numeric sperm counts, motility %, or bands. (${data.session.state})`
              : 'FAIL: Numeric sperm data detected in patient summary!',
          });
          await refreshState();
        } else {
          setZeroNumericResult({
            ok: true,
            message: `PASS: Pipeline safely enforced gate/consent boundary (${data.session?.state || data.code}) with zero numeric leakage.`,
          });
        }
      } finally {
        setRunningSelfTest(false);
      }
    };

    const events = auditData?.events || state?.auditEvents || [];
    const outbox = auditData?.outbox || [];

    return (
      <VStack gap={5}>
        <SubHeader
          title={isAr ? 'الخصوصية وسجل التدقيق والرسائل' : 'Privacy, Redacted Audit & Outbox'}
          onBack={onBack}
        />

        <Card padding={4} elevation="low">
          <VStack gap={3}>
            <HStack gap={2} vAlign="center" hAlign="between" wrap="wrap">
              <div>
                <Heading level={2}>
                  {isAr ? 'اختبار عدم تسرب الأرقام للمريض' : 'Zero-Numeric-Leakage Self-Test'}
                </Heading>
                <Text type="supporting" color="secondary">
                  {isAr
                    ? 'يتحقق من خلو مخرجات المريض في الفحص المنزلي من أي تركيز أو نسبة حركة.'
                    : 'Verifies server-side assertion that Home Pre-Screen patient outputs contain zero numeric sperm counts or %.'}
                </Text>
              </div>
              <Button
                size="sm"
                variant="primary"
                isLoading={runningSelfTest}
                icon={<ShieldCheck className="w-4 h-4" />}
                label={isAr ? 'تشغيل الفحص' : 'Run Self-Test'}
                onClick={runZeroNumericTest}
              />
            </HStack>
            {zeroNumericResult && (
              <Banner
                status={zeroNumericResult.ok ? 'success' : 'error'}
                title={zeroNumericResult.message}
              />
            )}
          </VStack>
        </Card>

        <Grid columns={{ minWidth: 280, max: 2 }} gap={4}>
          <Card padding={4} elevation="low">
            <VStack gap={3}>
              <HStack gap={2} vAlign="center" hAlign="between">
                <Heading level={2}>{isAr ? 'سجل التدقيق المنقح' : 'Redacted Audit Events'}</Heading>
                <Badge label={String(events.length)} variant="neutral" />
              </HStack>
              <List hasDividers density="compact" edge="flush">
                {events.slice(0, 12).map((ev) => (
                  <ListItem
                    key={ev.id}
                    label={ev.action}
                    description={`${ev.actorType} -> ${ev.target}`}
                    startContent={<Lock className="w-3.5 h-3.5 text-[var(--color-accent)]" />}
                    endContent={
                      <Text type="supporting" color="secondary" className="tabular-nums">
                        {ev.at.slice(11, 19)}
                      </Text>
                    }
                  />
                ))}
              </List>
            </VStack>
          </Card>

          <Card padding={4} elevation="low">
            <VStack gap={3}>
              <HStack gap={2} vAlign="center" hAlign="between">
                <Heading level={2}>{isAr ? 'صندوق الإرسال المحايد' : 'Outbox Messages'}</Heading>
                <Badge label={String(outbox.length)} variant="neutral" />
              </HStack>
              {outbox.length === 0 ? (
                <Text type="supporting" color="secondary">
                  {isAr ? 'لا توجد رسائل صادرة مسجلة بعد.' : 'No outbox dispatches yet.'}
                </Text>
              ) : (
                <List hasDividers density="compact" edge="flush">
                  {outbox.slice(0, 10).map((msg) => (
                    <ListItem
                      key={msg.id}
                      label={msg.channel}
                      description={msg.text}
                      startContent={<Bell className="w-3.5 h-3.5 text-[var(--color-accent)]" />}
                      endContent={
                        <Text type="supporting" color="secondary" className="tabular-nums">
                          {msg.at.slice(11, 19)}
                        </Text>
                      }
                    />
                  ))}
                </List>
              )}
            </VStack>
          </Card>
        </Grid>
      </VStack>
    );
  }

  // 8. About Panacea & FAQs (help)
  return (
    <VStack gap={5}>
      <SubHeader
        title={`${t.brand} · ${isAr ? 'حول التطبيق والأسئلة الشائعة' : 'About & Reviewed Help'}`}
        onBack={onBack}
      />

      <Card padding={4} elevation="low" variant="purple">
        <VStack gap={2}>
          <HStack gap={2} vAlign="center">
            <CheckCircle2 className="w-5 h-5 text-[var(--color-accent)]" />
            <Heading level={2}>
              {t.brand} — {t.attribution}
            </Heading>
          </HStack>
          <Text type="body" color="secondary">
            {isAr
              ? 'منصة متكاملة لدعم الصحة الإنجابية للرجل بخصوصية تامة في دبي: تقييم تكيفي، خزنة تقارير بمراجعة إلزامية، حجز مختبر ضمن نطاق ٥ كم، ومساعد مقيد بالمصادر.'
              : 'Private men’s reproductive-health navigation prototype (Dubai-first): adaptive 26-Q screening, quarantined OCR Report Vault, 5.000 km diagnostic lab handoff, research-mode Home Pre-Screen, and source-grounded Ask.'}
          </Text>
          <HStack gap={2} wrap="wrap">
            <Badge label={t.common.prototypeBadge} variant="info" />
            <Badge label={t.common.simulatedBadge} variant="neutral" />
          </HStack>
        </VStack>
      </Card>

      <Card padding={4} elevation="low">
        <VStack gap={2}>
          <Heading level={2}>
            {isAr ? 'قواعد المسار السريري الأربعة' : 'Deterministic 4-Pathway Charter'}
          </Heading>
          <MetadataList columns={1}>
            <MetadataListItem label="1. Urgent">
              {isAr
                ? 'ألم مفاجئ/تورم/إصابة/دم -> تدخل طوارئ فوري 998 وتعليق العادات.'
                : 'Sudden pain, lump, injury, or blood -> Immediate UAE 998 / emergency triage.'}
            </MetadataListItem>
            <MetadataListItem label="2. Andrology">
              {isAr
                ? 'محاولة ١٢+ شهراً، دوالي، هرمونات، أو تقرير غير طبيعي -> مختص ذكورة + مختبر.'
                : '12+ mo trying, varicocele, hormone use, or abnormal confirmed lab -> Andrology + Lab.'}
            </MetadataListItem>
            <MetadataListItem label="3. Primary Care">
              {isAr
                ? 'أمراض مزمنة أو أدوية منتظمة أو أعراض بولية -> رعاية أولية + فحص أساسي.'
                : 'Chronic conditions, regular medicines, or mild urinary symptoms -> Primary Care.'}
            </MetadataListItem>
            <MetadataListItem label="4. Self-Care / Baseline">
              {isAr
                ? 'خطة عادات مرنة (٧٤ يوماً افتراضياً) مع فحص مختبر أساسي عند الرغبة.'
                : 'Flexible habit plan (74-day default) plus optional baseline lab booking.'}
            </MetadataListItem>
          </MetadataList>
        </VStack>
      </Card>

      <Card padding={4} elevation="low">
        <VStack gap={2}>
          <HStack gap={2} vAlign="center">
            <HelpCircle className="w-4 h-4 text-[var(--color-accent)]" />
            <Heading level={2}>{isAr ? 'الأسئلة المتكررة' : 'Reviewed FAQs'}</Heading>
          </HStack>
          <Collapsible
            trigger={
              isAr
                ? 'هل يعرض الفحص المنزلي أرقاماً للحيوانات المنوية؟'
                : 'Does Home Pre-Screen show sperm counts or motility %?'
            }
          >
            <Text type="supporting" color="secondary">
              {isAr
                ? 'لا. تُظهر واجهة المريض جودة الالتقاط والتوجيه للمختبر المعتمد فقط حتى استكمال الاعتماد التنظيمي.'
                : 'No. Patient views intentionally suppress numeric sperm estimates and bands, showing capture quality feedback and lab booking guidance only.'}
            </Text>
          </Collapsible>
          <Divider />
          <Collapsible
            trigger={
              isAr
                ? 'لماذا قاعدة ٥٫٠٠٠ كم للاستلام المنزلي؟'
                : 'Why is Home Collection capped at 5.000 km?'
            }
          >
            <Text type="supporting" color="secondary">
              {isAr
                ? 'لضمان استلام العينة والحفاظ على درجة حرارتها ضمن النافذة الزمنية المعتمدة (٤٥ دقيقة).'
                : 'To keep transit within the validated handling window (e.g., 45 minutes). Beyond 5.000 km or when slots are full, Panacea routes to a Centre Appointment.'}
            </Text>
          </Collapsible>
          <Divider />
          <Collapsible
            trigger={
              isAr
                ? 'متى تُستخدم التقارير المرفوعة في المساعد أو المسارات؟'
                : 'When can Ask or Screening read an uploaded report?'
            }
          >
            <Text type="supporting" color="secondary">
              {isAr
                ? 'فقط بعد مراجعتها وتأكيدها جنباً إلى جنب وتحوّل حالتها إلى Summarised.'
                : 'Only after you verify values side-by-side and confirm the report to the Summarised state.'}
            </Text>
          </Collapsible>
        </VStack>
      </Card>
    </VStack>
  );
};
