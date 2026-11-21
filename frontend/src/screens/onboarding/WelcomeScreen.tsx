import React from 'react';
import { Flame } from 'lucide-react';
import { ONBOARDING_IMAGES } from '../../data/assets';

interface WelcomeScreenProps {
  onGetStarted: () => void;
  onSignInExisting: () => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  onGetStarted,
  onSignInExisting,
}) => {
  return (
    <div className="min-h-screen bg-[#151813] text-white flex flex-col relative overflow-hidden">
      <img
        src={ONBOARDING_IMAGES.lifestyle}
        alt="Wellness lifestyle"
        referrerPolicy="no-referrer"
        className="absolute inset-0 w-full h-full object-cover opacity-75"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-[#13150E] via-[#13150E]/55 to-[#13150E]/35" />

      <div className="relative z-10 w-full max-w-[460px] lg:max-w-[780px] mx-auto flex-1 flex flex-col justify-between px-6 lg:px-10 pt-8 pb-9">
        <header className="flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-full bg-[#FFF45A] text-[#171706] flex items-center justify-center shadow-sm">
            <Flame className="w-5 h-5" />
          </span>
          <span className="text-[18px] font-semibold tracking-tight text-white">AuraFit</span>
        </header>

        <div className="space-y-6 pt-16">
          <div className="space-y-3">
            <h1
              className="text-[36px] sm:text-[42px] font-semibold tracking-tight leading-[1.06] text-white"
              style={{ textWrap: 'balance' }}
            >
              Your fitness journey
              <span className="block text-[#D8DDD8]">starts with clarity.</span>
            </h1>
            <p className="text-[13px] sm:text-[14px] text-white/80 leading-relaxed max-w-[44ch]">
              Answer 4 quick questions to personalize your daily calorie, macro, and activity
              dashboard.
            </p>
          </div>

          <div className="space-y-3">
            <button
              type="button"
              onClick={onGetStarted}
              className="w-full py-3.5 px-6 rounded-full bg-[#FFF45A] text-[#171706] text-[14px] font-semibold hover:bg-[#F7EB45] active:scale-[0.99] transition-all shadow-[0_8px_24px_rgba(255,244,90,0.28)] cursor-pointer"
            >
              Get Started
            </button>

            <button
              type="button"
              onClick={onSignInExisting}
              className="w-full py-2 text-[13px] font-medium text-white/90 underline underline-offset-4 hover:text-[#FFF45A] transition-colors cursor-pointer"
            >
              I already have an account
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
