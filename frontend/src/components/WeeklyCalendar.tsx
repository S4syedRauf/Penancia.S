import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Card } from '@astryxdesign/core/Card';
import { HStack } from '@astryxdesign/core/HStack';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import type { Language } from '../types/panacea';
import { addDays, getWeekDays } from '../utils/dateUtils';

interface WeeklyCalendarProps {
  selectedDate: string;
  onSelectDate: (date: string) => void;
  completedDates: string[];
  language?: Language;
}

const AR_DAY_LETTERS = ['ن', 'ث', 'ر', 'خ', 'ج', 'س', 'ح'];

export const WeeklyCalendar: React.FC<WeeklyCalendarProps> = ({
  selectedDate,
  onSelectDate,
  completedDates,
  language = 'en',
}) => {
  const days = getWeekDays(selectedDate);
  const isAr = language === 'ar';

  return (
    <Card padding={4} elevation="low" variant="default">
      <VStack gap={3}>
        <HStack gap={2} vAlign="center" hAlign="between">
          <IconButton
            label={isAr ? 'الأسبوع السابق' : 'Previous week'}
            icon={<ChevronLeft className="w-4 h-4 rtl:rotate-180" />}
            variant="ghost"
            size="sm"
            onClick={() => onSelectDate(addDays(selectedDate, -7))}
          />
          <Text type="supporting" color="secondary" className="tabular-nums">
            {new Date(days[0].dateStr + 'T12:00:00').toLocaleDateString(
              isAr ? 'ar-AE' : 'en-US',
              { month: 'short', day: 'numeric' }
            )}{' '}
            –{' '}
            {new Date(days[6].dateStr + 'T12:00:00').toLocaleDateString(
              isAr ? 'ar-AE' : 'en-US',
              { month: 'short', day: 'numeric' }
            )}
          </Text>
          <IconButton
            label={isAr ? 'الأسبوع التالي' : 'Next week'}
            icon={<ChevronRight className="w-4 h-4 rtl:rotate-180" />}
            variant="ghost"
            size="sm"
            onClick={() => onSelectDate(addDays(selectedDate, 7))}
          />
        </HStack>

        <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
          {days.map((day, idx) => {
            const isSelected = day.dateStr === selectedDate;
            const hasCompleted = completedDates.includes(day.dateStr);

            return (
              <button
                key={day.dateStr}
                type="button"
                onClick={() => onSelectDate(day.dateStr)}
                className={`min-h-[54px] sm:min-h-[60px] rounded-md py-1.5 sm:py-2 flex flex-col items-center justify-between transition-colors cursor-pointer border focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] ${
                  isSelected
                    ? 'bg-accent-bg text-on-accent border-accent-bg shadow-xs'
                    : 'bg-muted text-primary border-transparent hover:border-border'
                }`}
              >
                <span
                  className={`text-[10px] sm:text-[11px] font-semibold ${
                    isSelected ? 'opacity-90' : 'text-secondary'
                  }`}
                >
                  {isAr ? AR_DAY_LETTERS[idx] : day.dayLetter}
                </span>
                <span className="text-[12px] sm:text-[13px] font-bold tabular-nums">
                  {day.dayNumber}
                </span>
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    hasCompleted
                      ? isSelected
                        ? 'bg-white'
                        : 'bg-success'
                      : 'bg-transparent'
                  }`}
                />
              </button>
            );
          })}
        </div>
      </VStack>
    </Card>
  );
};
