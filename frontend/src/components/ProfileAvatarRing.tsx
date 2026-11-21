import React from 'react';
import { Shield } from 'lucide-react';
import { Avatar } from '@astryxdesign/core/Avatar';
import { Badge } from '@astryxdesign/core/Badge';
import { useTheme } from '@astryxdesign/core/theme';
import { VStack } from '@astryxdesign/core/VStack';

interface ProfileAvatarRingProps {
  avatar: string;
  name: string;
  badgeText?: string;
  discreet?: boolean;
  completionPercent: number;
  onClick?: () => void;
}

export const ProfileAvatarRing: React.FC<ProfileAvatarRingProps> = ({
  avatar,
  name,
  badgeText = 'Panacea',
  discreet = false,
  completionPercent,
  onClick,
}) => {
  const { token } = useTheme();
  const accentColor = token('--color-accent') || '#7955E8';
  const trackColor = token('--color-border') || '#EEEEF2';

  const size = 112;
  const strokeWidth = 4;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(100, Math.max(0, completionPercent));
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <VStack gap={0} align="center" className="relative inline-flex">
      <button
        type="button"
        onClick={onClick}
        className="relative w-[112px] h-[112px] flex items-center justify-center cursor-pointer rounded-full focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
        aria-label={`Profile ${name}`}
      >
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="absolute inset-0 -rotate-90"
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={trackColor}
            strokeWidth={strokeWidth}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={accentColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="transition-all duration-300"
          />
        </svg>

        {discreet ? (
          <div className="w-[96px] h-[96px] rounded-full bg-accent-muted border border-border flex items-center justify-center">
            <Shield className="w-8 h-8 text-accent" />
          </div>
        ) : (
          <Avatar src={avatar} name={name} size={96} />
        )}
      </button>

      <div className="-mt-3 relative z-10">
        <Badge label={badgeText} variant="info" />
      </div>
    </VStack>
  );
};
