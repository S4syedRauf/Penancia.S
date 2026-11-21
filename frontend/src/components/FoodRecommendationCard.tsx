import React from 'react';
import { ChevronRight } from 'lucide-react';
import { ListItem } from '@astryxdesign/core/List';
import { Badge, type BadgeVariant } from '@astryxdesign/core/Badge';

interface FoodRecommendationCardProps {
  title: string;
  subtitle: string;
  statusText?: string;
  statusVariant?: BadgeVariant;
  icon?: React.ReactNode;
  onCardClick: () => void;
}

export const FoodRecommendationCard: React.FC<FoodRecommendationCardProps> = ({
  title,
  subtitle,
  statusText,
  statusVariant = 'neutral',
  icon,
  onCardClick,
}) => {
  return (
    <ListItem
      label={title}
      description={subtitle}
      onClick={onCardClick}
      startContent={
        icon ? (
          <div className="w-10 h-10 rounded-md bg-accent-muted border border-border flex items-center justify-center shrink-0">
            {icon}
          </div>
        ) : undefined
      }
      endContent={
        <div className="flex items-center gap-2">
          {statusText && <Badge label={statusText} variant={statusVariant} />}
          <ChevronRight className="w-4 h-4 text-secondary rtl:rotate-180" />
        </div>
      }
    />
  );
};
