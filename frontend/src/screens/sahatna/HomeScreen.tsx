import React from 'react';
import {
  Activity,
  AlertTriangle,
  CalendarClock,
  Check,
  ClipboardCheck,
  FileText,
  FlaskConical,
  MessageSquareHeart,
  ShieldAlert,
  Sparkles,
  Stethoscope,
} from 'lucide-react';
import { ThreeColourBar } from '../../components/sahatna/ThreeColourBar';
import { UrgentCareBanner } from '../../components/sahatna/UrgentCareBanner';
import { PLAN_TEMPLATES_74_DAY } from '../../data/catalogs';
import { QUESTIONNAIRE_26 } from '../../data/questionnaire26';
import { getLocalIsoDate, useSahatna } from '../../store/SahatnaContext';

export const HomeScreen: React.FC = () => {
  const {
    state,
    language,
    setActiveTab,
    urgentTriggered,
    togglePlanActionToday,
    planDayNumber,
  } = useSahatna();

  if (!state) return null;
  const isAr = language === 'ar';
  const latestScreening = state.screeningRuns[0] || null;
  const localDate = getLocalIsoDate(state.user.timeZone);
  const answeredCount = Object.keys(state.responses).length;
  const latestSemen = state.semenRuns.find((r) => !r.isDemo) || null;
  const confirmedReports = state.reports.filter((r) => r.state === 'Summarised');

  // Detect conflicting lab values across two confirmed reports of same test code (Section 5.7)
  const conflictNotice = (() => {
    if (confirmedReports.length < 2) return null;
    const [r1, r2] = confirmedReports;
    const conc1 = r1.summary?.values.find((v) => v.test_code === 'SEMEN_CONC');
    const conc2 = r2.summary?.values.find((v) => v.test_code === 'SEMEN_CONC');
    if (conc1 && conc2 && conc1.flag !== conc2.flag) {
      return {
        date1: r1.summary?.report_date,
        val1: `${conc1.value} ${conc1.unit} (${conc1.flag})`,
        date2: r2.summary?.report_date,
        val2: `${conc2.value} ${conc2.unit} (${conc2.flag})`,
      };
    }
    return null;
  })();

  const completedTodayCount = PLAN_TEMPLATES_74_DAY.filter(
    (item) => state.planCompletions[`${localDate}::${item.templateCode}`] === 'done'
  ).length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[12px] font-medium text-[#646A63]">
            {isAr ? 'مرحباً بعودتك' : 'Private Companion'} · @{state.user.username}
          </p>
          <h1 className="text-[22px] font-bold text-[#151813] tracking-tight">
            {isAr ? 'لوحة صحتنا اليومية' : 'Sahatna Overview'}
          </h1>
        </div>

        <button
          type="button"
          onClick={() => setActiveTab('ask')}
          className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl bg-[#1A4D3E] text-white text-[12px] font-semibold hover:bg-[#143D31] transition-colors cursor-pointer shrink-0"
        >
          <MessageSquareHeart className="w-4 h-4 text-[#FFF45A]" />
          <span>{isAr ? 'اسأل المساعد' : 'Ask Sahatna'}</span>
        </button>
      </header>

      {/* Urgent Care Offline Alert */}
      {urgentTriggered && <UrgentCareBanner />}

      {/* Recovery reminder if none configured */}
      {!state.user.recoveryEmail && !state.user.recoveryPhone && (
        <div className="rounded-2xl bg-[#FFF8E1] border border-[#F5DFA0] px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-[12px] text-[#614300]">
            <ShieldAlert className="w-4 h-4 text-[#9A6B00] shrink-0" />
            <span>
              {isAr
                ? 'لم يتم تعيين وسيلة استعادة للحساب بعد.'
                : 'No account recovery email or phone set yet.'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className="text-[12px] font-bold text-[#1A4D3E] underline shrink-0 cursor-pointer"
          >
            {isAr ? 'إضافة' : 'Add'}
          </button>
        </div>
      )}

      {/* Report conflict notice (Section 5.7) */}
      {conflictNotice && (
        <div className="rounded-2xl bg-white border border-[#F5DFA0] p-4 flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-[#9A6B00] shrink-0 mt-0.5" />
            <div className="text-[12px]">
              <p className="font-bold text-[#151813]">
                {isAr
                  ? 'يوجد اختلاف بين تقريرين مخبريين — أيهما الأحدث؟'
                  : 'Conflicting lab report values found — which is current?'}
              </p>
              <p className="text-[#646A63] mt-0.5">
                {conflictNotice.date1}: {conflictNotice.val1} vs {conflictNotice.date2}:{' '}
                {conflictNotice.val2}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab('reports')}
            className="px-3 py-1.5 rounded-xl bg-[#ECEEEB] text-[11px] font-semibold cursor-pointer shrink-0"
          >
            {isAr ? 'مراجعة' : 'Review'}
          </button>
        </div>
      )}

      {/* 3-Colour Bar (F5 - no numeric fertility score) */}
      <ThreeColourBar run={latestScreening} />

      {/* Main 2-column grid on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Today's 74-day plan actions (F9) */}
        <section className="lg:col-span-7 rounded-3xl bg-white border border-[#E2E6E0] p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#1A4D3E]">
                {isAr ? `اليوم ${planDayNumber} من ٧٤` : `Day ${planDayNumber} of 74`}
              </span>
              <h2 className="text-[16px] font-bold text-[#151813]">
                {isAr ? 'خطة اليوم' : 'Today’s Actions'}
              </h2>
            </div>
            <span className="px-3 py-1 rounded-full bg-[#F6F7F5] text-[12px] font-semibold text-[#151813]">
              {completedTodayCount >= 3
                ? isAr
                  ? 'يوم جيد'
                  : 'Good day'
                : completedTodayCount > 0
                  ? isAr
                    ? 'تقدم هادئ'
                    : 'Steady progress'
                  : isAr
                    ? 'لا توجد بيانات كافية بعد'
                    : 'Not enough info yet'}
            </span>
          </div>

          <div className="space-y-2">
            {PLAN_TEMPLATES_74_DAY.slice(0, 4).map((action) => {
              const done =
                state.planCompletions[`${localDate}::${action.templateCode}`] === 'done';
              return (
                <button
                  key={action.templateCode}
                  type="button"
                  onClick={() => togglePlanActionToday(action.templateCode)}
                  className={`w-full p-3.5 rounded-2xl border text-start flex items-center gap-3 transition-colors cursor-pointer ${
                    done
                      ? 'bg-[#E9F7EF] border-[#B8E3C9]'
                      : 'bg-[#F6F7F5] border-transparent hover:border-[#E2E6E0]'
                  }`}
                >
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                      done
                        ? 'bg-[#1D7A4C] text-white'
                        : 'bg-white border border-[#CFD5CD] text-transparent'
                    }`}
                  >
                    <Check className="w-3.5 h-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-[13px] font-semibold ${
                        done ? 'text-[#124D30] line-through' : 'text-[#151813]'
                      }`}
                    >
                      {isAr ? action.titleAr : action.titleEn}
                    </p>
                    <p className="text-[11px] text-[#646A63] truncate">
                      {isAr ? action.detailAr : action.detailEn}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between pt-1 text-[12px]">
            <span className="text-[#646A63]">
              {isAr
                ? 'الأيام الفائتة لا تُعيد ضبط الخطة أبداً.'
                : 'Missed days never reset your 74-day cycle.'}
            </span>
            <button
              type="button"
              onClick={() => setActiveTab('plan')}
              className="font-semibold text-[#1A4D3E] hover:underline cursor-pointer"
            >
              {isAr ? 'الخطة والتغذية ←' : 'Plan & Noon Food →'}
            </button>
          </div>
        </section>

        {/* Shortcuts & Status Cards */}
        <section className="lg:col-span-5 grid grid-cols-2 gap-3 content-start">
          <button
            type="button"
            onClick={() => setActiveTab('semen')}
            className="col-span-2 rounded-3xl bg-[#1A4D3E] text-white p-4 text-start space-y-2 hover:bg-[#143D31] transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between">
              <span className="w-9 h-9 rounded-2xl bg-[#FFF45A] text-[#151813] flex items-center justify-center">
                <FlaskConical className="w-5 h-5" />
              </span>
              <span className="px-2.5 py-1 rounded-full bg-white/15 text-[10px] font-bold uppercase tracking-wider">
                {state.featureFlags.semenValidationMode === 'prototype'
                  ? isAr
                    ? 'نسخة أولية تجريبية'
                    : 'Prototype pre-screen'
                  : 'Validated'}
              </span>
            </div>
            <p className="text-[15px] font-bold">
              {isAr ? 'فحص السائل المنوي المنزلي' : 'Home Semen Pre-Screen'}
            </p>
            <p className="text-[12px] text-white/80">
              {latestSemen
                ? isAr
                  ? `آخر نطاق: التركيز (${latestSemen.bandConc}) · الحركة (${latestSemen.bandMotility})`
                  : `Latest bands: Conc (${latestSemen.bandConc}) · Motility (${latestSemen.bandMotility})`
                : isAr
                  ? 'عدسة هاتف أو محول مجهر أو الوضع التجريبي'
                  : 'Clip-on lens, microscope adapter, or judge Demo Mode'}
            </p>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('questionnaire')}
            className="rounded-3xl bg-white border border-[#E2E6E0] p-4 text-start space-y-2 hover:border-[#1A4D3E] transition-colors cursor-pointer"
          >
            <ClipboardCheck className="w-5 h-5 text-[#1A4D3E]" />
            <p className="text-[13px] font-bold text-[#151813]">
              {isAr ? 'الاستبيان (٢٦)' : '26-Q Intake'}
            </p>
            <p className="text-[11px] text-[#646A63] tabular-nums">
              {answeredCount}/{QUESTIONNAIRE_26.length} {isAr ? 'مكتمل' : 'answered'}
            </p>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('reports')}
            className="rounded-3xl bg-white border border-[#E2E6E0] p-4 text-start space-y-2 hover:border-[#1A4D3E] transition-colors cursor-pointer"
          >
            <FileText className="w-5 h-5 text-[#1A4D3E]" />
            <p className="text-[13px] font-bold text-[#151813]">
              {isAr ? 'خزنة التقارير' : 'Report Vault'}
            </p>
            <p className="text-[11px] text-[#646A63] tabular-nums">
              {confirmedReports.length} {isAr ? 'تقارير مؤكدة' : 'confirmed'}
            </p>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('wearables')}
            className="rounded-3xl bg-white border border-[#E2E6E0] p-4 text-start space-y-2 hover:border-[#1A4D3E] transition-colors cursor-pointer"
          >
            <Activity className="w-5 h-5 text-[#1A4D3E]" />
            <p className="text-[13px] font-bold text-[#151813]">
              {isAr ? 'عادات الساعة' : 'Wearable Habits'}
            </p>
            <p className="text-[11px] text-[#646A63]">
              {state.wearableConnected
                ? isAr
                  ? 'نوم ونبض (للعادات فقط)'
                  : 'Sleep & HR (habits only)'
                : isAr
                  ? 'غير متصل'
                  : 'Disconnected'}
            </p>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('care')}
            className="rounded-3xl bg-white border border-[#E2E6E0] p-4 text-start space-y-2 hover:border-[#1A4D3E] transition-colors cursor-pointer"
          >
            <Stethoscope className="w-5 h-5 text-[#1A4D3E]" />
            <p className="text-[13px] font-bold text-[#151813]">
              {isAr ? 'دليل العيادات' : 'UAE Clinics'}
            </p>
            <p className="text-[11px] text-[#646A63]">
              {isAr ? 'مختبرات ومشاركة مؤقتة' : 'Labs & expiry shares'}
            </p>
          </button>

          {state.retestReminders.length > 0 && (
            <div className="col-span-2 rounded-2xl bg-[#ECEEEB] px-4 py-3 flex items-center gap-2.5 text-[12px]">
              <CalendarClock className="w-4 h-4 text-[#1A4D3E] shrink-0" />
              <div className="min-w-0">
                <p className="font-semibold text-[#151813]">
                  {state.retestReminders[0].labelNeutral}
                </p>
                <p className="text-[11px] text-[#646A63]">
                  {isAr ? 'التاريخ المقترح:' : 'Scheduled:'} {state.retestReminders[0].dueDate}
                </p>
              </div>
            </div>
          )}

          {state.featureFlags.demoModeEnabled && (
            <div className="col-span-2 rounded-2xl bg-[#FFF45A]/45 border border-[#E6D839] px-4 py-2.5 flex items-center justify-between text-[11px] font-semibold text-[#151813]">
              <span className="inline-flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                {isAr
                  ? 'الوضع التجريبي متاح في الفحص المنزلي'
                  : 'Judge Demo Mode ready in Pre-Screen'}
              </span>
              <button
                type="button"
                onClick={() => setActiveTab('semen')}
                className="underline cursor-pointer"
              >
                {isAr ? 'تشغيل' : 'Try Demo'}
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
