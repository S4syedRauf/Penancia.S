import React from 'react';
import { AlertOctagon, PhoneCall } from 'lucide-react';
import { useSahatna } from '../../store/SahatnaContext';

export const UrgentCareBanner: React.FC<{ onOpenCare?: () => void }> = ({ onOpenCare }) => {
  const { t, setActiveTab, language } = useSahatna();
  const isAr = language === 'ar';

  return (
    <div
      role="alert"
      className="rounded-3xl bg-[#FEF3F2] border-2 border-[#B42318] p-5 space-y-3 shadow-xs"
    >
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 rounded-2xl bg-[#B42318] text-white flex items-center justify-center shrink-0">
          <AlertOctagon className="w-5 h-5" />
        </span>
        <div>
          <h2 className="text-[16px] font-bold text-[#7A1810]">{t.screening.urgentTitle}</h2>
          <p className="text-[11px] font-semibold text-[#B42318] mt-0.5">
            {t.screening.urgentSubtitle}
          </p>
        </div>
      </div>

      <p className="text-[13px] leading-relaxed text-[#7A1810]">{t.screening.urgentBody}</p>

      <div className="flex flex-wrap gap-2.5 pt-1">
        <button
          type="button"
          onClick={() => (onOpenCare ? onOpenCare() : setActiveTab('care'))}
          className="px-4 py-2.5 rounded-2xl bg-[#B42318] text-white text-[12px] font-semibold hover:bg-[#911B12] transition-colors cursor-pointer"
        >
          {t.screening.bookLabCta}
        </button>
        <a
          href="tel:998"
          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-2xl bg-white border border-[#F9C6C2] text-[#7A1810] text-[12px] font-semibold hover:bg-[#FEE4E2] transition-colors"
        >
          <PhoneCall className="w-3.5 h-3.5" />
          <span>{isAr ? 'طوارئ الإسعاف: ٩٩٨' : 'UAE Emergency: 998'}</span>
        </a>
      </div>
    </div>
  );
};
