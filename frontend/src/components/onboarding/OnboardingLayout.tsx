import React from 'react';
import { ChevronLeft } from 'lucide-react';

interface OnboardingLayoutProps {
  titleDark: string;
  titleMuted: string;
  description?: string;
  sectionLabel?: string;
  progressPercent?: number;
  onBack?: () => void;
  primaryLabel?: string;
  onPrimaryClick?: () => void;
  primaryDisabled?: boolean;
  secondaryLabel?: string;
  onSecondaryClick?: () => void;
  rightHeaderSlot?: React.ReactNode;
  children: React.ReactNode;
}

export const OnboardingLayout: React.FC<OnboardingLayoutProps> = ({
  titleDark,
  titleMuted,
  description,
  sectionLabel,
  progressPercent,
  onBack,
  primaryLabel = 'Continue',
  onPrimaryClick,
  primaryDisabled = false,
  secondaryLabel,
  onSecondaryClick,
  rightHeaderSlot,
  children,
}) => {
  return (
    <div className="min-h-screen bg-[#D9DDDA] text-[#191A12] flex flex-col">
      <div className="w-full max-w-[460px] lg:max-w-[780px] mx-auto flex-1 flex flex-col px-5 lg:px-8 pt-5 pb-7">
        {/* Top Bar matching reference circular back button + progress indicator */}
        <header className="flex items-center justify-between gap-4 mb-5">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              aria-label="Go back"
              className="w-10 h-10 rounded-full bg-[#ECEEEB] hover:bg-[#FFFFFF] text-[#191A12] flex items-center justify-center transition-colors shadow-2xs cursor-pointer shrink-0"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          ) : (
            <div className="w-10 h-10 shrink-0" />
          )}

          {progressPercent !== undefined ? (
            <div className="flex-1 max-w-[230px] flex flex-col items-end gap-1.5">
              {sectionLabel && (
                <span className="text-[11px] font-semibold text-[#5C605C] tabular-nums">
                  {sectionLabel}
                </span>
              )}
              <div className="w-full h-1.5 rounded-full bg-[#C7CCC8] overflow-hidden">
                <div
                  className="h-full rounded-full bg-[#FFF45A] transition-all duration-300"
                  style={{ width: `${Math.min(100, Math.max(4, progressPercent))}%` }}
                />
              </div>
            </div>
          ) : rightHeaderSlot ? (
            rightHeaderSlot
          ) : (
            <div className="w-10 h-10 shrink-0" />
          )}
        </header>

        {/* Two-tone Editorial Heading matching reference */}
        <div className="mb-5">
          <h1
            className="text-[33px] sm:text-[38px] font-semibold tracking-tight leading-[1.08]"
            style={{ textWrap: 'balance' }}
          >
            <span className="block text-[#191A12]">{titleDark}</span>
            <span className="block text-[#9DA39E]">{titleMuted}</span>
          </h1>
          {description && (
            <p className="text-[13px] leading-relaxed text-[#646964] mt-2.5 max-w-[60ch]">
              {description}
            </p>
          )}
        </div>

        {/* Interactive Content Area */}
        <div className="flex-1 flex flex-col">{children}</div>

        {/* Bottom Action Bar matching dark olive/black rounded CTA */}
        {(onPrimaryClick || onSecondaryClick) && (
          <div className="pt-5 mt-auto space-y-2.5">
            {onPrimaryClick && (
              <button
                type="button"
                onClick={onPrimaryClick}
                disabled={primaryDisabled}
                className={`w-full py-3.5 px-6 rounded-full text-[13px] font-semibold transition-all cursor-pointer ${
                  primaryDisabled
                    ? 'bg-[#A5AAA7] text-[#F1F2F0] cursor-not-allowed'
                    : 'bg-[#171706] text-white hover:bg-[#2A2A10] active:scale-[0.99] shadow-[0_8px_20px_rgba(23,23,6,0.16)]'
                }`}
              >
                {primaryLabel}
              </button>
            )}
            {onSecondaryClick && secondaryLabel && (
              <button
                type="button"
                onClick={onSecondaryClick}
                className="w-full py-2.5 text-[12px] font-semibold text-[#5E635E] hover:text-[#191A12] transition-colors cursor-pointer"
              >
                {secondaryLabel}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
