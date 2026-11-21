import React from 'react';
import {
  Activity as ActivityIcon,
  Check,
  ChefHat,
  Flame,
  Footprints,
  Moon,
  Pause,
  SkipForward,
  Sparkles,
  Stethoscope,
} from 'lucide-react';
import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Divider } from '@astryxdesign/core/Divider';
import { HStack } from '@astryxdesign/core/HStack';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import type { Language, PlanActionStatus, PlanActionTemplate } from '../types/panacea';
import { formatDotTimeRange, formatHourLabel } from '../utils/dateUtils';

export interface TimelineRenderItem {
  id: string;
  kind: 'plan' | 'symptom' | 'lab';
  templateCode?: string;
  title: string;
  detail: string;
  startTime: string;
  endTime: string;
  category: PlanActionTemplate['category'] | 'symptom' | 'lab';
  status: PlanActionStatus;
}

interface ActivityTimelineProps {
  items: TimelineRenderItem[];
  language: Language;
  onSetPlanStatus: (templateCode: string, status: PlanActionStatus) => void;
  onAddSymptomAtHour: (hour: number) => void;
  onOpenLabOrder?: () => void;
}

const CATEGORY_ICON: Record<
  TimelineRenderItem['category'],
  React.ComponentType<{ className?: string }>
> = {
  sleep: Moon,
  nutrition: ChefHat,
  heat: Flame,
  movement: Footprints,
  stress: Sparkles,
  recheck: ActivityIcon,
  symptom: ActivityIcon,
  lab: Stethoscope,
};

export const ActivityTimeline: React.FC<ActivityTimelineProps> = ({
  items,
  language,
  onSetPlanStatus,
  onAddSymptomAtHour,
  onOpenLabOrder,
}) => {
  const isAr = language === 'ar';
  const sorted = [...items].sort((a, b) => a.startTime.localeCompare(b.startTime));

  const hoursSet = new Set<number>([7, 8, 9]);
  sorted.forEach((act) => {
    const h = parseInt(act.startTime.split(':')[0], 10);
    if (!Number.isNaN(h)) hoursSet.add(h);
  });
  const hours = Array.from(hoursSet).sort((a, b) => a - b);

  return (
    <Card padding={3} elevation="low" variant="default">
      <VStack gap={3}>
        {hours.map((hour, hourIdx) => {
          const hourActivities = sorted.filter(
            (act) => parseInt(act.startTime.split(':')[0], 10) === hour
          );
          const { time, period } = formatHourLabel(hour);

          return (
            <React.Fragment key={hour}>
              {hourIdx > 0 && <Divider />}
              <div className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-3">
                <div className="flex items-center justify-between sm:block sm:w-16 shrink-0">
                  <button
                    type="button"
                    onClick={() => onAddSymptomAtHour(hour)}
                    title={isAr ? `تسجيل عرض الساعة ${time}` : `Log symptom at ${time} ${period}`}
                    className="inline-flex sm:flex sm:flex-col items-baseline sm:items-start gap-1 sm:gap-0 px-2.5 py-1 sm:px-2 sm:py-1.5 rounded-md bg-muted hover:bg-accent-muted text-start transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
                  >
                    <span className="text-[12px] font-bold text-primary tabular-nums leading-tight">
                      {time}
                    </span>
                    <span className="text-[10px] font-semibold text-secondary uppercase tracking-wide leading-tight">
                      {period}
                    </span>
                  </button>

                  {hourActivities.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      label={isAr ? '+ عرض' : '+ Note'}
                      onClick={() => onAddSymptomAtHour(hour)}
                      xstyle={undefined}
                    />
                  )}
                </div>

                <VStack gap={2} className="flex-1 min-w-0">
                  {hourActivities.length === 0 ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      width="100%"
                      label={
                        isAr
                          ? `+ إضافة عرض أو ملاحظة (${time})`
                          : `+ Log symptom / check-in at ${time} ${period}`
                      }
                      onClick={() => onAddSymptomAtHour(hour)}
                    />
                  ) : (
                    hourActivities.map((act) => {
                      const Icon = CATEGORY_ICON[act.category] || CATEGORY_ICON.movement;
                      const isPlan = act.kind === 'plan' && act.templateCode;

                      return (
                        <Card
                          key={act.id}
                          padding={3}
                          variant={act.status === 'paused' ? 'muted' : 'default'}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                            <button
                              type="button"
                              onClick={() => {
                                if (act.kind === 'lab' && onOpenLabOrder) onOpenLabOrder();
                                else if (isPlan) {
                                  onSetPlanStatus(
                                    act.templateCode!,
                                    act.status === 'done' ? 'pending' : 'done'
                                  );
                                }
                              }}
                              className="flex items-center gap-3 flex-1 min-w-0 text-start cursor-pointer"
                            >
                              <span className="w-9 h-9 rounded-md bg-accent-muted border border-border flex items-center justify-center text-accent shrink-0">
                                <Icon className="w-4 h-4" />
                              </span>
                              <div className="min-w-0 flex-1">
                                <Text weight="semibold" maxLines={2}>
                                  {act.title}
                                </Text>
                                <Text type="supporting" color="secondary" className="tabular-nums">
                                  {formatDotTimeRange(act.startTime, act.endTime)}
                                  {act.status === 'skipped' &&
                                    (isAr ? ' · تم التخطي' : ' · Skipped')}
                                  {act.status === 'paused' &&
                                    (isAr ? ' · متوقف مؤقتاً' : ' · Paused')}
                                </Text>
                              </div>
                            </button>

                            <div className="flex items-center justify-end gap-1.5 shrink-0 pt-1 sm:pt-0 border-t sm:border-t-0 border-border">
                              {isPlan ? (
                                <HStack gap={1} vAlign="center">
                                  <IconButton
                                    label={isAr ? 'تخطي اليوم' : 'Skip action'}
                                    icon={<SkipForward className="w-3.5 h-3.5" />}
                                    variant={act.status === 'skipped' ? 'primary' : 'ghost'}
                                    size="sm"
                                    onClick={() =>
                                      onSetPlanStatus(
                                        act.templateCode!,
                                        act.status === 'skipped' ? 'pending' : 'skipped'
                                      )
                                    }
                                  />
                                  <IconButton
                                    label={isAr ? 'إيقاف مؤقت' : 'Pause action'}
                                    icon={<Pause className="w-3.5 h-3.5" />}
                                    variant={act.status === 'paused' ? 'primary' : 'ghost'}
                                    size="sm"
                                    onClick={() =>
                                      onSetPlanStatus(
                                        act.templateCode!,
                                        act.status === 'paused' ? 'pending' : 'paused'
                                      )
                                    }
                                  />
                                  <IconButton
                                    label={
                                      act.status === 'done'
                                        ? `Mark ${act.title} pending`
                                        : `Mark ${act.title} done`
                                    }
                                    icon={<Check className="w-4 h-4" />}
                                    variant={act.status === 'done' ? 'primary' : 'secondary'}
                                    size="sm"
                                    onClick={() =>
                                      onSetPlanStatus(
                                        act.templateCode!,
                                        act.status === 'done' ? 'pending' : 'done'
                                      )
                                    }
                                  />
                                </HStack>
                              ) : (
                                <Badge
                                  label={
                                    act.kind === 'lab'
                                      ? isAr
                                        ? 'مختبر'
                                        : 'Lab'
                                      : isAr
                                        ? 'عرض'
                                        : 'User'
                                  }
                                  variant={act.kind === 'lab' ? 'info' : 'warning'}
                                />
                              )}
                            </div>
                          </div>
                        </Card>
                      );
                    })
                  )}
                </VStack>
              </div>
            </React.Fragment>
          );
        })}
      </VStack>
    </Card>
  );
};
