import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Globe,
  KeyRound,
  Lock,
  RefreshCw,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import { generateRandomUsername, useSahatna } from '../../store/SahatnaContext';
import { Language } from '../../types/sahatna';

type Step = 'welcome' | 'username' | 'signin';

export const OnboardingFlow: React.FC = () => {
  const {
    t,
    language,
    setLanguage,
    isRtl,
    arabicSuggestionVisible,
    dismissArabicSuggestion,
    completeOnboardingUser,
    signInExistingAccount,
  } = useSahatna();

  const [step, setStep] = useState<Step>('welcome');
  const [username, setUsername] = useState<string>(() => generateRandomUsername());
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoveryPhone, setRecoveryPhone] = useState('');
  const [signInIdentifier, setSignInIdentifier] = useState('');
  const [signInError, setSignInError] = useState<string | null>(null);

  const isAr = language === 'ar';

  const handleLangPick = (lang: Language) => {
    setLanguage(lang);
  };

  return (
    <div className="min-h-screen bg-[#F6F7F5] text-[#151813] flex flex-col justify-center py-8 px-4">
      <div className="w-full max-w-[460px] mx-auto space-y-4">
        {/* Arabic browser detection banner (E1-S1) */}
        {arabicSuggestionVisible && (
          <div className="rounded-2xl bg-[#FFF45A] border border-[#E6D839] p-3.5 flex items-center justify-between gap-3">
            <p className="text-[12px] font-semibold text-[#151813]">{t.switchToArabicPrompt}</p>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setLanguage('ar')}
                className="px-3 py-1.5 rounded-xl bg-[#151813] text-white text-[11px] font-semibold cursor-pointer"
              >
                {t.switchToArabicAction}
              </button>
              <button
                type="button"
                onClick={dismissArabicSuggestion}
                className="px-2.5 py-1.5 rounded-xl bg-white/70 text-[11px] font-medium cursor-pointer"
              >
                {t.dismiss}
              </button>
            </div>
          </div>
        )}

        {/* Top Language Switcher & Brand */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-[#1A4D3E] text-[#FFF45A] flex items-center justify-center font-extrabold text-[18px]">
              S
            </div>
            <div>
              <h1 className="text-[18px] font-bold text-[#151813] leading-tight">{t.appName}</h1>
              <p className="text-[11px] text-[#646A63]">{t.tagline}</p>
            </div>
          </div>

          <div className="inline-flex rounded-full bg-white border border-[#E2E6E0] p-1">
            <button
              type="button"
              onClick={() => handleLangPick('en')}
              className={`px-3 py-1 rounded-full text-[12px] font-semibold cursor-pointer transition-colors ${
                language === 'en' ? 'bg-[#1A4D3E] text-white' : 'text-[#646A63]'
              }`}
            >
              English
            </button>
            <button
              type="button"
              onClick={() => handleLangPick('ar')}
              className={`px-3 py-1 rounded-full text-[12px] font-semibold cursor-pointer transition-colors ${
                language === 'ar' ? 'bg-[#1A4D3E] text-white' : 'text-[#646A63]'
              }`}
            >
              العربية
            </button>
          </div>
        </div>

        {step === 'welcome' && (
          <div className="rounded-[28px] bg-white border border-[#E2E6E0] p-6 space-y-5 shadow-xs">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#E9F7EF] text-[#1A4D3E] text-[12px] font-semibold">
              <ShieldCheck className="w-4 h-4" />
              <span>{t.onboarding.privacyTitle}</span>
            </div>

            <div className="space-y-2.5">
              <h2 className="text-[24px] font-bold tracking-tight leading-snug text-[#151813]">
                {t.firstOpenNote}
              </h2>
              <p className="text-[13px] leading-relaxed text-[#646A63]">
                {t.onboarding.privacySummary}
              </p>
            </div>

            <div className="rounded-2xl bg-[#F6F7F5] border border-[#E2E6E0] p-4 space-y-2 text-[12px] text-[#151813]">
              <div className="flex items-center gap-2 font-semibold">
                <Globe className="w-4 h-4 text-[#1A4D3E]" />
                <span>{t.onboarding.chooseLang}: {language === 'en' ? 'English (LTR)' : 'العربية (RTL)'}</span>
              </div>
              <p className="text-[#646A63]">
                {isAr
                  ? 'لا يجمع التطبيق أي اسم حقيقي أو رقم هوية، ولا يقدم تشخيصاً طبياً أو أرقاماً نهائية للسائل المنوي من المنزل.'
                  : 'Zero real names collected. Home pre-screen shows Low / Typical / Unclear bands only, never exact sperm counts.'}
              </p>
            </div>

            <div className="space-y-2.5 pt-1">
              <button
                type="button"
                onClick={() => setStep('username')}
                className="w-full py-3.5 px-5 rounded-2xl bg-[#1A4D3E] text-white text-[14px] font-semibold flex items-center justify-center gap-2 hover:bg-[#143D31] transition-colors cursor-pointer"
              >
                <span>{t.continue}</span>
                <ArrowRight className={`w-4 h-4 ${isRtl ? 'rotate-180' : ''}`} />
              </button>

              <button
                type="button"
                onClick={() => {
                  setSignInError(null);
                  setStep('signin');
                }}
                className="w-full py-3 px-4 rounded-2xl bg-[#ECEEEB] text-[#151813] text-[13px] font-semibold hover:bg-[#E2E6E0] transition-colors cursor-pointer"
              >
                {t.onboarding.signInExisting}
              </button>
            </div>
          </div>
        )}

        {step === 'username' && (
          <div className="rounded-[28px] bg-white border border-[#E2E6E0] p-6 space-y-5 shadow-xs">
            <div>
              <h2 className="text-[22px] font-bold text-[#151813]">{t.onboarding.usernameTitle}</h2>
              <p className="text-[12px] text-[#646A63] mt-1">{t.onboarding.usernameSubtitle}</p>
            </div>

            <div className="rounded-2xl bg-[#F6F7F5] border border-[#E2E6E0] p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-10 h-10 rounded-2xl bg-[#FFF45A] text-[#151813] flex items-center justify-center shrink-0">
                  <UserCheck className="w-5 h-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-medium text-[#646A63]">
                    {isAr ? 'الاسم المستعار العشوائي' : 'Assigned Alias'}
                  </p>
                  <p className="text-[18px] font-extrabold text-[#151813] truncate tabular-nums">
                    {username}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setUsername(generateRandomUsername())}
                title={t.onboarding.generateAnother}
                className="px-3 py-2 rounded-xl bg-white border border-[#E2E6E0] text-[12px] font-semibold text-[#151813] inline-flex items-center gap-1.5 hover:bg-[#ECEEEB] cursor-pointer shrink-0"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>{isAr ? 'تبديل' : 'New'}</span>
              </button>
            </div>

            <div className="space-y-3">
              <p className="text-[13px] font-semibold text-[#151813]">
                {t.onboarding.recoveryOptionalTitle}
              </p>
              <input
                type="email"
                value={recoveryEmail}
                onChange={(e) => setRecoveryEmail(e.target.value)}
                placeholder={t.onboarding.emailPlaceholder}
                className="w-full px-4 py-3 rounded-2xl bg-[#F6F7F5] border border-[#E2E6E0] text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1A4D3E]"
              />
              <input
                type="tel"
                value={recoveryPhone}
                onChange={(e) => setRecoveryPhone(e.target.value)}
                placeholder={t.onboarding.phonePlaceholder}
                className="w-full px-4 py-3 rounded-2xl bg-[#F6F7F5] border border-[#E2E6E0] text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1A4D3E]"
              />

              {!recoveryEmail.trim() && !recoveryPhone.trim() && (
                <div className="rounded-2xl bg-[#FFF8E1] border border-[#F5DFA0] p-3 flex items-start gap-2.5 text-[12px] text-[#614300]">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-[#9A6B00]" />
                  <span>{t.onboarding.recoveryWarning}</span>
                </div>
              )}
            </div>

            <div className="flex gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setStep('welcome')}
                className="px-4 py-3.5 rounded-2xl bg-[#ECEEEB] text-[#151813] text-[13px] font-semibold cursor-pointer"
              >
                {t.back}
              </button>
              <button
                type="button"
                onClick={() =>
                  completeOnboardingUser({
                    username,
                    language,
                    recoveryEmail,
                    recoveryPhone,
                  })
                }
                className="flex-1 py-3.5 px-5 rounded-2xl bg-[#1A4D3E] text-white text-[14px] font-semibold hover:bg-[#143D31] transition-colors cursor-pointer"
              >
                {t.onboarding.enterApp}
              </button>
            </div>
          </div>
        )}

        {step === 'signin' && (
          <div className="rounded-[28px] bg-white border border-[#E2E6E0] p-6 space-y-5 shadow-xs">
            <div className="flex items-center gap-2.5">
              <span className="w-9 h-9 rounded-2xl bg-[#ECEEEB] flex items-center justify-center">
                <KeyRound className="w-4 h-4 text-[#1A4D3E]" />
              </span>
              <div>
                <h2 className="text-[19px] font-bold text-[#151813]">
                  {t.onboarding.signInExisting}
                </h2>
                <p className="text-[12px] text-[#646A63]">
                  {isAr
                    ? 'أدخل اسم المستخدم العشوائي أو بريد/رقم الاستعادة لاسترجاع حسابك.'
                    : 'Restores the exact UserId via OIDC PKCE session.'}
                </p>
              </div>
            </div>

            {signInError && (
              <div className="rounded-2xl bg-[#FEF3F2] border border-[#F9C6C2] p-3 text-[12px] font-medium text-[#7A1810]">
                {signInError}
              </div>
            )}

            <input
              type="text"
              value={signInIdentifier}
              onChange={(e) => setSignInIdentifier(e.target.value)}
              placeholder={isAr ? 'مثال: BlueFalcon-4821' : 'e.g. BlueFalcon-4821 or recovery email'}
              className="w-full px-4 py-3 rounded-2xl bg-[#F6F7F5] border border-[#E2E6E0] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#1A4D3E]"
            />

            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => setStep('welcome')}
                className="px-4 py-3 rounded-2xl bg-[#ECEEEB] text-[#151813] text-[13px] font-semibold cursor-pointer"
              >
                {t.back}
              </button>
              <button
                type="button"
                onClick={() => {
                  const res = signInExistingAccount(signInIdentifier);
                  if (!res.ok) setSignInError(res.error || 'Could not sign in');
                }}
                className="flex-1 py-3 rounded-2xl bg-[#1A4D3E] text-white text-[13px] font-semibold inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                <Lock className="w-4 h-4" />
                <span>{isAr ? 'دخول آمن' : 'Sign In (PKCE)'}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
