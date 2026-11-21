import React from 'react';
import { AlertOctagon, AlertTriangle, ArrowRight, CheckCircle2, Info } from 'lucide-react';
import { useSahatna } from '../../store/SahatnaContext';
import { ScreeningRun } from '../../types/sahatna';

interface ThreeColourBarProps {
  run: ScreeningRun | null;
  compact?: boolean;
  onActionClick?: () => void;
}

export const ThreeColourBar: React.FC<ThreeColourBarProps> = ({
  run,
  compact = false,
  onActionClick,
}) => {
  const { language, t, setActiveTab, isRtl } = useSahatna();
  const isAr = language === 'ar';

  if (!run) {
    return (
      <div className="rounded-3xl bg-white border border-[#E2E6E0] p-5 space-y-3">
        <div className="flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-2xl bg-[#ECEEEB] text-[#151813] flex items-center justify-center shrink-0">
            <Info className="w-5 h-5" />
          </span>
          <div>
            <p className="text-[14px] font-bold text-[#151813]">
              {isAr ? 'ابدأ التقييم المبدئي (٢٦ سؤالاً)' : 'Start Your Screening Baseline'}
            </p>
            <p className="text-[12px] text-[#646A63]">
              {isAr
                ? 'أجب على الأسئلة لإظهار شريط الحالة (أخضر / أصفر / أحمر).'
                : 'Answer the intake blocks to generate your 3-colour bar (no fertility score).'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setActiveTab('questionnaire')}
          className="w-full py-3 rounded-2xl bg-[#1A4D3E] text-white text-[13px] font-semibold hover:bg-[#143D31] transition-colors cursor-pointer"
        >
          {isAr ? 'بدء الاستبيان (٥ دقائق)' : 'Start 26-Question Check'}
        </button>
      </div>
    );
  }

  const theme =
    run.colour === 'green'
      ? {
          bg: 'bg-[#E9F7EF]',
          border: 'border-[#B8E3C9]',
          badgeBg: 'bg-[#1D7A4C] text-white',
          text: 'text-[#124D30]',
          label: t.screening.greenLabel,
          Icon: CheckCircle2,
          activeIndex: 0,
        }
      : run.colour === 'yellow'
        ? {
            bg: 'bg-[#FFF8E1]',
            border: 'border-[#F5DFA0]',
            badgeBg: 'bg-[#9A6B00] text-white',
            text: 'text-[#614300]',
            label: t.screening.yellowLabel,
            Icon: AlertTriangle,
            activeIndex: 1,
          }
        : {
            bg: 'bg-[#FEF3F2]',
            border: 'border-[#F9C6C2]',
            badgeBg: 'bg-[#B42318] text-white',
            text: 'text-[#7A1810]',
            label: t.screening.redLabel,
            Icon: AlertOctagon,
            activeIndex: 2,
          };

  const Icon = theme.Icon;

  return (
    <section
      aria-label="3-Colour Screening Status"
      className={`rounded-3xl ${theme.bg} border ${theme.border} p-5 space-y-3.5`}
    >
      {/* 3-segment visual bar + word + icon (never colour-only) */}
      <div className="space-y-2">
        <div className="grid grid-cols-3 gap-1.5">
          <div
            className={`h-2.5 rounded-full transition-opacity ${
              theme.activeIndex === 0 ? 'bg-[#1D7A4C]' : 'bg-[#1D7A4C]/20'
            }`}
          />
          <div
            className={`h-2.5 rounded-full transition-opacity ${
              theme.activeIndex === 1 ? 'bg-[#D99B00]' : 'bg-[#D99B00]/20'
            }`}
          />
          <div
            className={`h-2.5 rounded-full transition-opacity ${
              theme.activeIndex === 2 ? 'bg-[#B42318]' : 'bg-[#B42318]/20'
            }`}
          />
        </div>

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-bold ${theme.badgeBg}`}
          >
            <Icon className="w-3.5 h-3.5" />
            <span>{theme.label}</span>
          </span>
          <span className="text-[11px] font-medium text-[#646A63]">
            {run.urgency} · {run.ruleVersion}
          </span>
        </div>
      </div>

      <p className={`text-[13px] font-medium leading-relaxed ${theme.text}`}>
        {isAr ? run.reasonAr : run.reasonEn}
      </p>

      {!compact && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
          <div className="rounded-2xl bg-white/80 border border-black/5 p-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#646A63] mb-1">
              {t.screening.whatWeUsed}
            </p>
            {run.used.length > 0 ? (
              <ul className="space-y-1 text-[12px] text-[#151813]">
                {run.used.map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
            ) : (
              <p className="text-[12px] text-[#646A63]">—</p>
            )}
          </div>
          <div className="rounded-2xl bg-white/80 border border-black/5 p-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#646A63] mb-1">
              {t.screening.whatIsMissing}
            </p>
            {run.missing.length > 0 ? (
              <ul className="space-y-1 text-[12px] text-[#646A63]">
                {run.missing.map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
            ) : (
              <p className="text-[12px] text-[#1D7A4C]">
                {isAr ? 'البيانات الأساسية مكتملة' : 'Baseline inputs present'}
              </p>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
        <p className="text-[11px] text-[#646A63]">{t.screening.disclaimer}</p>
        <button
          type="button"
          onClick={() => {
            if (onActionClick) onActionClick();
            else setActiveTab(run.nextActionRoute);
          }}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-2xl bg-[#151813] text-white text-[12px] font-semibold hover:bg-[#2A3026] transition-colors shrink-0 cursor-pointer"
        >
          <span>{isAr ? run.nextActionAr : run.nextActionEn}</span>
          <ArrowRight className={`w-3.5 h-3.5 ${isRtl ? 'rotate-180' : ''}`} />
        </button>
      </div>
    </section>
  );
};
