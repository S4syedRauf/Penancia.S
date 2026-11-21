import React from 'react';
import { MoreHorizontal } from 'lucide-react';
import { ClickableCard } from '@astryxdesign/core/ClickableCard';
import { HStack } from '@astryxdesign/core/HStack';
import { IconButton } from '@astryxdesign/core/IconButton';
import { ProgressBar, type ProgressBarVariant } from '@astryxdesign/core/ProgressBar';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';

interface MacroNutrientCardProps {
  label: string;
  primaryText: string;
  secondaryText: string;
  percent: number;
  variant?: ProgressBarVariant;
  onEditTarget: () => void;
}

export const MacroNutrientCard: React.FC<MacroNutrientCardProps> = ({
  label,
  primaryText,
  secondaryText,
  percent,
  variant = 'accent',
  onEditTarget,
}) => {
  const safePercent = Math.min(100, Math.max(0, percent));

  return (
    <ClickableCard
      label={`${label}: ${primaryText} ${secondaryText}`}
      onClick={onEditTarget}
      padding={3}
      variant="default"
      elevation="low"
    >
      <VStack gap={2}>
        <HStack gap={1} vAlign="center" hAlign="between">
          <Text type="supporting" color="secondary" maxLines={1}>
            {label}
          </Text>
          <IconButton
            label={`Open ${label}`}
            icon={<MoreHorizontal className="w-4 h-4" />}
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onEditTarget();
            }}
          />
        </HStack>

        <HStack gap={1} vAlign="center">
          <span className="text-[15px] font-bold text-primary tabular-nums truncate">
            {primaryText}
          </span>
          <span className="text-[11px] font-medium text-secondary tabular-nums truncate">
            {secondaryText}
          </span>
        </HStack>

        <ProgressBar
          label={label}
          value={safePercent}
          max={100}
          variant={variant}
          isLabelHidden
        />
      </VStack>
    </ClickableCard>
  );
};
