import React from 'react';
import { Activity } from 'lucide-react';
import { useTheme } from '@astryxdesign/core/theme';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';

interface CalorieProgressRingProps {
  calories: number;
  goal: number;
  displayText?: string;
  subLabel?: string;
}

export const CalorieProgressRing: React.FC<CalorieProgressRingProps> = ({
  calories,
  goal,
  displayText,
  subLabel = 'consistency',
}) => {
  const { token, mode } = useTheme();
  const accentColor = token('--color-accent') || '#7955E8';
  const secondaryLavender = mode === 'dark' ? '#9B7DF0' : '#B9A4F5';
  const trackOuterColor = token('--color-border') || '#EEEEF2';
  const trackInnerColor = token('--color-accent-muted') || '#F6F3FF';

  const totalColumns = 19;
  const safeGoal = Math.max(1, goal);
  const ratio = Math.min(1, Math.max(0, calories / safeGoal));
  const activeColumns = calories === 0 ? 0 : Math.max(1, Math.round(ratio * totalColumns));

  const cx = 150;
  const cy = 142;
  const startAngleDeg = 180;
  const endAngleDeg = 0;

  const createArcSegmentPath = (
    innerR: number,
    outerR: number,
    a1Deg: number,
    a2Deg: number
  ) => {
    const rad = (deg: number) => (deg * Math.PI) / 180;
    const x1 = cx + outerR * Math.cos(rad(a1Deg));
    const y1 = cy - outerR * Math.sin(rad(a1Deg));
    const x2 = cx + outerR * Math.cos(rad(a2Deg));
    const y2 = cy - outerR * Math.sin(rad(a2Deg));
    const x3 = cx + innerR * Math.cos(rad(a2Deg));
    const y3 = cy - innerR * Math.sin(rad(a2Deg));
    const x4 = cx + innerR * Math.cos(rad(a1Deg));
    const y4 = cy - innerR * Math.sin(rad(a1Deg));

    return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${outerR} ${outerR} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)} L ${x3.toFixed(2)} ${y3.toFixed(2)} A ${innerR} ${innerR} 0 0 0 ${x4.toFixed(2)} ${y4.toFixed(2)} Z`;
  };

  const totalSpan = startAngleDeg - endAngleDeg;
  const stepDeg = totalSpan / totalColumns;
  const gapDeg = 2.6;

  return (
    <div className="relative flex flex-col items-center justify-center w-full select-none">
      <svg
        viewBox="0 0 300 164"
        className="w-full max-w-[270px] h-auto overflow-visible"
        role="img"
        aria-label={`${subLabel}: ${displayText ?? calories}`}
      >
        {Array.from({ length: totalColumns }).map((_, index) => {
          const a1 = startAngleDeg - index * stepDeg - gapDeg / 2;
          const a2 = startAngleDeg - (index + 1) * stepDeg + gapDeg / 2;
          const isLit = index < activeColumns;

          return (
            <g key={index}>
              <path
                d={createArcSegmentPath(103, 122, a1, a2)}
                fill={isLit ? accentColor : trackOuterColor}
                stroke={isLit ? accentColor : trackOuterColor}
                strokeWidth="3.5"
                strokeLinejoin="round"
                className="transition-colors duration-200"
              />
              <path
                d={createArcSegmentPath(79, 95, a1, a2)}
                fill={isLit ? secondaryLavender : trackInnerColor}
                stroke={isLit ? secondaryLavender : trackInnerColor}
                strokeWidth="3.5"
                strokeLinejoin="round"
                className="transition-colors duration-200"
              />
            </g>
          );
        })}
      </svg>

      <VStack
        gap={0.5}
        align="center"
        className="absolute bottom-[4px] left-1/2 -translate-x-1/2 text-center pointer-events-none"
      >
        <Activity className="w-5 h-5 text-accent" />
        <span className="text-[28px] leading-none font-bold tracking-tight text-primary tabular-nums">
          {displayText ?? `${calories}%`}
        </span>
        <Text type="supporting" color="secondary">
          {subLabel}
        </Text>
      </VStack>
    </div>
  );
};
