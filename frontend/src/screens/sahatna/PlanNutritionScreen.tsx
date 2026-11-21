import React, { useMemo, useState } from 'react';
import {
  Check,
  Copy,
  ExternalLink,
  Leaf,
  Lock,
  ShoppingBag,
  Sparkles,
} from 'lucide-react';
import { FOOD_CATALOGUE, PLAN_TEMPLATES_74_DAY } from '../../data/catalogs';
import { buildNoonSearchUrl } from '../../engine/screeningEngine';
import { getLocalIsoDate, useSahatna } from '../../store/SahatnaContext';
import { NoonListItem } from '../../types/sahatna';

export const PlanNutritionScreen: React.FC = () => {
  const {
    state,
    language,
    t,
    planDayNumber,
    togglePlanActionToday,
    setNoonList,
    toggleConsent,
  } = useSahatna();

  const [selectedFoodIds, setSelectedFoodIds] = useState<string[]>(['walnuts', 'pomegranate', 'spinach']);
  const [copiedMsg, setCopiedMsg] = useState<string | null>(null);

  if (!state) return null;
  const isAr = language === 'ar';
  const localDate = getLocalIsoDate(state.user.timeZone);
  const noonAllowed = state.consents.noon_assist?.state;

  // Respect food allergies from Q16
  const userAllergies = useMemo(() => {
    const q16 = state.responses.Q16;
    if (!q16 || q16.status !== 'answered' || !Array.isArray(q16.answerJson)) return [];
    return q16.answerJson.filter((a) => a !== 'None');
  }, [state.responses]);

  const safeFoods = useMemo(() => {
    return FOOD_CATALOGUE.filter(
      (food) => !food.allergyTags.some((tag) => userAllergies.includes(tag))
    );
  }, [userAllergies]);

  const completedToday = PLAN_TEMPLATES_74_DAY.filter(
    (item) => state.planCompletions[`${localDate}::${item.templateCode}`] === 'done'
  ).length;

  const toggleFoodSelect = (id: string) => {
    setSelectedFoodIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const buildSelectedNoonList = () => {
    const items: NoonListItem[] = safeFoods
      .filter((f) => selectedFoodIds.includes(f.id))
      .map((f) => ({
        id: f.id,
        nameEn: f.nameEn,
        nameAr: f.nameAr,
        searchUrlEn: buildNoonSearchUrl(f.nameEn, 'en'),
        searchUrlAr: buildNoonSearchUrl(f.nameAr, 'ar'),
        directUrl: f.noonUrl,
      }));
    setNoonList(items);
  };

  const handleCopy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMsg(label);
      setTimeout(() => setCopiedMsg(null), 2000);
    } catch {
      setCopiedMsg(label);
      setTimeout(() => setCopiedMsg(null), 2000);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#1A4D3E]">
            {isAr ? `الدورة ٧٤ يوماً · اليوم ${planDayNumber}` : `74-Day Cycle · Day ${planDayNumber} of 74`}
          </p>
          <h1 className="text-[20px] font-bold text-[#151813]">
            {isAr ? 'الخطة اليومية والتغذية (نون)' : '74-Day Plan & Noon Nutrition Assist'}
          </h1>
        </div>
        <span className="px-3 py-1.5 rounded-full bg-white border border-[#E2E6E0] text-[12px] font-semibold">
          {localDate} ({state.user.timeZone})
        </span>
      </div>

      {/* 74-Day Cycle Progress Bar (No reset on missed days) */}
      <div className="rounded-3xl bg-white border border-[#E2E6E0] p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-[16px] font-bold text-[#151813]">
              {isAr ? 'إجراءات اليوم المعتمدة' : 'Today’s Approved Habit Actions'}
            </h2>
            <p className="text-[12px] text-[#646A63]">
              {isAr
                ? 'تستغرق دورة تكوّن الحيوانات المنوية نحو ٧٤ يوماً. الأيام الفائتة لا تعيد الخطة للصفر.'
                : 'Sperm regeneration takes ~74 days. Missed days never reset your plan; no automatic supplement doses are prescribed.'}
            </p>
          </div>
          <span className="px-3 py-1 rounded-full bg-[#E9F7EF] text-[#124D30] text-[12px] font-bold shrink-0">
            {completedToday >= 3 ? 'Good day' : completedToday > 0 ? 'Steady' : 'Start today'}
          </span>
        </div>

        <div className="h-2.5 rounded-full bg-[#ECEEEB] overflow-hidden">
          <div
            className="h-full bg-[#1A4D3E]"
            style={{ width: `${Math.max(4, Math.round((planDayNumber / 74) * 100))}%` }}
          />
        </div>

        <div className="space-y-2">
          {PLAN_TEMPLATES_74_DAY.map((action) => {
            const done =
              state.planCompletions[`${localDate}::${action.templateCode}`] === 'done';
            return (
              <button
                key={action.templateCode}
                type="button"
                onClick={() => togglePlanActionToday(action.templateCode)}
                className={`w-full p-3.5 rounded-2xl border text-start flex items-center gap-3 cursor-pointer ${
                  done
                    ? 'bg-[#E9F7EF] border-[#B8E3C9]'
                    : 'bg-[#F6F7F5] border-transparent hover:border-[#E2E6E0]'
                }`}
              >
                <span
                  className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                    done ? 'bg-[#1D7A4C] text-white' : 'bg-white border border-[#CFD5CD] text-transparent'
                  }`}
                >
                  <Check className="w-3.5 h-3.5" />
                </span>
                <div>
                  <p className={`text-[13px] font-semibold ${done ? 'line-through text-[#124D30]' : 'text-[#151813]'}`}>
                    {isAr ? action.titleAr : action.titleEn}
                  </p>
                  <p className="text-[11px] text-[#646A63]">
                    {isAr ? action.detailAr : action.detailEn}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Nutrition Suggestions & Noon Assist (F10) */}
      <div className="rounded-3xl bg-white border border-[#E2E6E0] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Leaf className="w-5 h-5 text-[#1A4D3E]" />
            <h2 className="text-[16px] font-bold text-[#151813]">
              {isAr ? 'مقترحات غذائية متوازنة لليوم' : 'Today’s Balanced Food Suggestions'}
            </h2>
          </div>
          {userAllergies.length > 0 && (
            <span className="px-2.5 py-1 rounded-full bg-[#FFF8E1] text-[#614300] text-[11px] font-semibold">
              Filtered allergies: {userAllergies.join(', ')}
            </span>
          )}
        </div>

        <p className="text-[12px] text-[#646A63]">
          {isAr
            ? 'أفكار غذائية عامة متوازنة بدون أي وعود علاجية وبدون اقتراح مكملات أو جرعات.'
            : 'General balanced-diet guidance only (no fertility-cure claims, no supplement doses).'}
        </p>

        {/* Ask-first Noon flow */}
        <div className="rounded-2xl bg-[#FFF45A]/45 border border-[#E6D839] p-4 space-y-3">
          <div className="flex items-center gap-2 text-[14px] font-bold text-[#151813]">
            <Sparkles className="w-4 h-4" />
            <span>{t.noon.askTitle}</span>
          </div>

          {!noonAllowed ? (
            <div className="flex items-center justify-between gap-3 text-[12px]">
              <span className="inline-flex items-center gap-1.5 text-[#614300]">
                <Lock className="w-4 h-4" /> Consent `noon_assist` is OFF.
              </span>
              <button
                type="button"
                onClick={() => toggleConsent('noon_assist', true)}
                className="px-3 py-1.5 rounded-xl bg-[#1A4D3E] text-white font-semibold cursor-pointer"
              >
                Enable Noon Links
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {safeFoods.map((food) => {
                  const checked = selectedFoodIds.includes(food.id);
                  return (
                    <button
                      key={food.id}
                      type="button"
                      onClick={() => toggleFoodSelect(food.id)}
                      className={`p-3 rounded-2xl border text-start flex items-start gap-2.5 cursor-pointer transition-colors ${
                        checked
                          ? 'bg-white border-[#151813]'
                          : 'bg-white/60 border-transparent hover:bg-white'
                      }`}
                    >
                      <span
                        className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 mt-0.5 ${
                          checked ? 'bg-[#1A4D3E] text-white' : 'border border-[#CFD5CD] bg-white text-transparent'
                        }`}
                      >
                        <Check className="w-3 h-3" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[13px] font-bold text-[#151813]">
                          {isAr ? food.nameAr : food.nameEn}
                        </p>
                        <p className="text-[11px] text-[#646A63]">
                          {isAr ? food.categoryAr : food.categoryEn} ·{' '}
                          {isAr ? food.reasonAr : food.reasonEn}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={buildSelectedNoonList}
                className="px-4 py-2.5 rounded-2xl bg-[#151813] text-white text-[13px] font-semibold inline-flex items-center gap-2 cursor-pointer"
              >
                <ShoppingBag className="w-4 h-4 text-[#FFF45A]" />
                <span>
                  {isAr
                    ? `تجهيز قائمة نون (${selectedFoodIds.length})`
                    : `Build Noon UAE Search List (${selectedFoodIds.length})`}
                </span>
              </button>
            </>
          )}
        </div>

        {/* Generated Noon List */}
        {state.noonList.length > 0 && noonAllowed && (
          <div className="rounded-2xl bg-[#F6F7F5] border border-[#E2E6E0] p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[12px] font-semibold text-[#646A63]">{t.noon.pricesDisclaimer}</p>
              <button
                type="button"
                onClick={() =>
                  handleCopy(
                    state.noonList.map((i) => (isAr ? i.nameAr : i.nameEn)).join('\n'),
                    'Full list copied'
                  )
                }
                className="px-3 py-1.5 rounded-xl bg-white border border-[#E2E6E0] text-[12px] font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>{t.noon.copyList}</span>
              </button>
            </div>

            {copiedMsg && (
              <p className="text-[11px] font-bold text-[#1D7A4C]">{copiedMsg}</p>
            )}

            <div className="space-y-2">
              {state.noonList.map((item) => {
                const displayName = isAr ? item.nameAr : item.nameEn;
                const url = isAr ? item.searchUrlAr : item.searchUrlEn;
                return (
                  <div
                    key={item.id}
                    className="rounded-2xl bg-white border border-[#E2E6E0] p-3 flex flex-wrap items-center justify-between gap-2"
                  >
                    <div>
                      <p className="text-[13px] font-bold text-[#151813]">{displayName}</p>
                      <p className="text-[10px] text-[#646A63] truncate max-w-[260px]">
                        {item.nameEn} / {item.nameAr}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleCopy(displayName, `Copied "${displayName}"`)}
                        className="px-2.5 py-1.5 rounded-xl bg-[#ECEEEB] text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Copy className="w-3 h-3" />
                        <span>{t.noon.copyName}</span>
                      </button>
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 rounded-xl bg-[#FFF45A] text-[#151813] text-[11px] font-bold inline-flex items-center gap-1"
                      >
                        <span>{t.noon.openInNoon}</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
