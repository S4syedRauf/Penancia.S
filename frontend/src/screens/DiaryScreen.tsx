import React, { useMemo } from 'react';
import {
  Bell,
  Calendar as CalendarIcon,
  ClipboardCheck,
  FileText,
  FlaskConical,
  Globe,
  Microscope,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { Avatar } from '@astryxdesign/core/Avatar';
import { Badge } from '@astryxdesign/core/Badge';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Grid } from '@astryxdesign/core/Grid';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { IconButton } from '@astryxdesign/core/IconButton';
import { List } from '@astryxdesign/core/List';
import { Section } from '@astryxdesign/core/Section';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { CalorieProgressRing } from '../components/CalorieProgressRing';
import { FoodRecommendationCard } from '../components/FoodRecommendationCard';
import { MacroNutrientCard } from '../components/MacroNutrientCard';
import { usePanacea } from '../store/PanaceaContext';
import type { PrimaryTab, SubView } from '../types/panacea';
import { formatHumanDate, parseISODate } from '../utils/dateUtils';

interface DiaryScreenProps {
  onOpenSearch: () => void;
  onOpenCalendar: () => void;
  onNavigateTab: (tab: PrimaryTab) => void;
  onOpenSubView: (view: SubView) => void;
}

export const DiaryScreen: React.FC<DiaryScreenProps> = ({
  onOpenSearch,
  onOpenCalendar,
  onNavigateTab,
  onOpenSubView,
}) => {
  const {
    state,
    language,
    setLanguage,
    t,
    selectedDate,
    consistencyToday,
    latestScreening,
    unreadFollowUpCount,
  } = usePanacea();

  const isAr = language === 'ar';

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
    const diff = Math.floor((sel - start) / 86400000) + 1;
    return Math.max(1, diff);
  }, [state, selectedDate]);

  const answered26Count = useMemo(() => {
    if (!state) return 0;
    return state.questionnaireResponses.filter((r) => r.status === 'answered').length;
  }, [state]);

  const confirmedReportsCount = useMemo(() => {
    if (!state) return 0;
    return state.reports.filter((r) => r.state === 'Summarised').length;
  }, [state]);

  const pendingReviewReportsCount = useMemo(() => {
    if (!state) return 0;
    return state.reports.filter((r) => r.state === 'NeedsUserReview').length;
  }, [state]);

  const latestOrder = state?.orders[0] || null;
  const latestSemen = state?.semenSessions[0] || null;

  const pathwayBadgeLabel = useMemo(() => {
    if (!latestScreening) return isAr ? 'غير مقيّم' : 'Pending';
    if (latestScreening.pathway === 'urgent') return isAr ? 'عاجل' : 'Urgent';
    if (latestScreening.pathway === 'andrology') return isAr ? 'ذكورة' : 'Andrology';
    if (latestScreening.pathway === 'primary_care') return isAr ? 'رعاية أولية' : 'Primary';
    return isAr ? 'أساسي' : 'Routine';
  }, [latestScreening, isAr]);

  const displayName = state?.user.discreetMode
    ? isAr
      ? 'الوضع الخفي'
      : 'Discreet Mode'
    : state?.user.alias || 'amber-falcon-42';

  const noRecoveryContact =
    state && !state.user.recoveryEmail.trim() && !state.user.recoveryPhone.trim();

  return (
    <VStack gap={5}>
      {/* Compact Header (Mobile-first header + quick controls) */}
      <HStack gap={2} vAlign="center" hAlign="between" wrap="wrap">
        <button
          type="button"
          onClick={() => onNavigateTab('profile')}
          className="flex items-center gap-3 min-w-0 text-start cursor-pointer rounded-md focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
        >
          {state?.user.discreetMode ? (
            <div className="w-10 h-10 rounded-full bg-accent-muted border border-border flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5 text-accent" />
            </div>
          ) : (
            <Avatar src={state?.user.avatar} name={displayName} size={40} />
          )}
          <div className="min-w-0">
            <Text type="supporting" color="secondary" display="block">
              {t.greetingHello}
            </Text>
            <Text weight="semibold" maxLines={1}>
              {displayName}
            </Text>
          </div>
        </button>

        <HStack gap={1.5} vAlign="center">
          <Button
            variant="secondary"
            size="sm"
            icon={<Globe className="w-3.5 h-3.5" />}
            label={language === 'en' ? 'العربية' : 'EN'}
            onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')}
          />
          <IconButton
            label={isAr ? 'بحث' : 'Search Panacea'}
            icon={<Search className="w-4 h-4" />}
            variant="secondary"
            size="sm"
            onClick={onOpenSearch}
          />
          <Button
            variant="secondary"
            size="sm"
            icon={<Bell className="w-4 h-4" />}
            label={isAr ? 'المتابعة' : 'Alerts'}
            isIconOnly={unreadFollowUpCount === 0}
            endContent={
              unreadFollowUpCount > 0 ? (
                <Badge label={String(unreadFollowUpCount)} variant="info" />
              ) : undefined
            }
            onClick={() => onOpenSubView('notifications')}
          />
        </HStack>
      </HStack>

      {/* Recovery Contact Notice */}
      {noRecoveryContact && (
        <Banner
          status="warning"
          title={
            isAr
              ? 'أضف بريد أو هاتف استرداد الحساب'
              : 'No account recovery contact saved yet'
          }
          description={
            isAr
              ? 'يمكن استخدام التطبيق دون بيانات تواصل، ولكن إضافة وسيلة استرداد يحمي سجلاتك.'
              : 'Optional, but adding a recovery email or phone protects access if you lose your alias.'
          }
          endContent={
            <Button
              size="sm"
              variant="secondary"
              label={isAr ? 'إعداد' : 'Add'}
              onClick={() => onNavigateTab('profile')}
            />
          }
        />
      )}

      {/* Title Bar + Calendar Action */}
      <HStack gap={3} vAlign="center" hAlign="between" wrap="wrap">
        <div>
          <Heading level={1}>{t.diary.scheduledTitle}</Heading>
          <Text type="supporting" color="secondary" className="tabular-nums">
            {isAr
              ? `اليوم ${planDayNumber} من ${planTotalDays} (مرنة)`
              : `Day ${planDayNumber} of ${planTotalDays} (Flexible)`}{' '}
            · {formatHumanDate(selectedDate)}
          </Text>
        </div>

        <Button
          variant="secondary"
          size="sm"
          icon={<CalendarIcon className="w-4 h-4" />}
          label={t.diary.calendarBtn}
          onClick={onOpenCalendar}
        />
      </HStack>

      {/* Main Responsive Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Column: Summary + 3 Metric Pillars */}
        <VStack gap={4} className="lg:col-span-6">
          <Section variant="transparent" padding={0}>
            <VStack gap={3}>
              <HStack gap={2} vAlign="center" hAlign="between">
                <Heading level={2}>{t.diary.summaryTitle}</Heading>
                <Button
                  variant="ghost"
                  size="sm"
                  label={t.diary.detailsBtn}
                  onClick={() => onOpenSubView('analytics')}
                />
              </HStack>

              <Card padding={5} elevation="low">
                <VStack gap={3} align="center">
                  <CalorieProgressRing
                    calories={consistencyToday.percent}
                    goal={100}
                    displayText={`${consistencyToday.percent}%`}
                    subLabel={
                      consistencyToday.statusLabel === 'not_started'
                        ? isAr
                          ? 'لم تبدأ بعد'
                          : 'not started'
                        : `${consistencyToday.completed}/${consistencyToday.eligible} ${t.diary.consistencyLabel}`
                    }
                  />
                  <Text
                    type="supporting"
                    color="secondary"
                    justify="center"
                    className="max-w-[360px]"
                  >
                    {t.diary.consistencyDisclaimer}
                  </Text>
                </VStack>
              </Card>
            </VStack>
          </Section>

          <Grid columns={{ minWidth: 100, max: 3 }} gap={2}>
            <MacroNutrientCard
              label={t.diary.pillars.plan}
              primaryText={`${consistencyToday.completed}/${consistencyToday.eligible}`}
              secondaryText={isAr ? 'مكتمل' : 'done'}
              percent={consistencyToday.percent}
              variant="success"
              onEditTarget={() => onNavigateTab('activity')}
            />
            <MacroNutrientCard
              label={t.diary.pillars.screening}
              primaryText={pathwayBadgeLabel}
              secondaryText={`${answered26Count}/26`}
              percent={Math.round((answered26Count / 26) * 100)}
              variant={latestScreening?.urgentTriggered ? 'error' : 'warning'}
              onEditTarget={() => onOpenSubView('health-check')}
            />
            <MacroNutrientCard
              label={t.diary.pillars.stayAlert}
              primaryText={`${unreadFollowUpCount}`}
              secondaryText={isAr ? 'مفتوحة' : 'open'}
              percent={unreadFollowUpCount > 0 ? 100 : 0}
              variant="accent"
              onEditTarget={() => onOpenSubView('notifications')}
            />
          </Grid>
        </VStack>

        {/* Right Column: Care & Actions List */}
        <VStack gap={3} className="lg:col-span-6">
          <HStack gap={2} vAlign="center" hAlign="between">
            <Heading level={2}>{t.diary.actionsHeading}</Heading>
            <Button
              variant="ghost"
              size="sm"
              label={t.diary.viewAllBtn}
              onClick={() => onNavigateTab('meals')}
            />
          </HStack>

          <Card padding={0} elevation="low">
            <List hasDividers edge="bleed">
              <FoodRecommendationCard
                title={t.diary.cards.healthCheckTitle}
                subtitle={t.diary.cards.healthCheckSub}
                statusText={
                  latestScreening
                    ? pathwayBadgeLabel
                    : isAr
                      ? `${answered26Count}/26`
                      : `${answered26Count}/26 Q`
                }
                statusVariant={latestScreening?.urgentTriggered ? 'error' : 'info'}
                icon={<ClipboardCheck className="w-5 h-5 text-[var(--color-accent)]" />}
                onCardClick={() => onOpenSubView('health-check')}
              />

              <FoodRecommendationCard
                title={t.diary.cards.reportsTitle}
                subtitle={t.diary.cards.reportsSub}
                statusText={
                  pendingReviewReportsCount > 0
                    ? isAr
                      ? `${pendingReviewReportsCount} بانتظار التأكيد`
                      : `${pendingReviewReportsCount} review`
                    : isAr
                      ? `${confirmedReportsCount} مؤكد`
                      : `${confirmedReportsCount} confirmed`
                }
                statusVariant={pendingReviewReportsCount > 0 ? 'warning' : 'success'}
                icon={<FileText className="w-5 h-5 text-[var(--color-accent)]" />}
                onCardClick={() => onOpenSubView('report-vault')}
              />

              <FoodRecommendationCard
                title={t.diary.cards.labBookingTitle}
                subtitle={t.diary.cards.labBookingSub}
                statusText={
                  latestOrder ? latestOrder.state : isAr ? '٥٫٠٠٠ كم' : '5 km rule'
                }
                statusVariant={latestOrder ? 'info' : 'neutral'}
                icon={<FlaskConical className="w-5 h-5 text-[var(--color-accent)]" />}
                onCardClick={() => onOpenSubView('lab-booking')}
              />

              <FoodRecommendationCard
                title={t.diary.cards.homePreScreenTitle}
                subtitle={t.diary.cards.homePreScreenSub}
                statusText={
                  latestSemen ? latestSemen.state : isAr ? 'وضع بحثي' : 'Research'
                }
                statusVariant="neutral"
                icon={<Microscope className="w-5 h-5 text-[var(--color-accent)]" />}
                onCardClick={() => onOpenSubView('semen-prescreen')}
              />
            </List>
          </Card>

          <Text type="supporting" color="secondary" justify="center">
            {t.brand} · {t.attribution}
          </Text>
        </VStack>
      </div>
    </VStack>
  );
};
