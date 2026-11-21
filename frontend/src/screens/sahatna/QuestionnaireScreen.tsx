import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  History,
} from 'lucide-react';
import { ThreeColourBar } from '../../components/sahatna/ThreeColourBar';
import { UrgentCareBanner } from '../../components/sahatna/UrgentCareBanner';
import { QUESTIONNAIRE_26, QUESTIONNAIRE_DEFINITION_VERSION } from '../../data/questionnaire26';
import { useSahatna } from '../../store/SahatnaContext';
import { QuestionStatus } from '../../types/sahatna';

export const QuestionnaireScreen: React.FC = () => {
  const {
    state,
    language,
    isRtl,
    saveQuestionAnswer,
    runScreeningEvaluation,
    urgentTriggered,
  } = useSahatna();

  const [index, setIndex] = useState<number>(() => {
    if (!state) return 0;
    const firstUnanswered = QUESTIONNAIRE_26.findIndex((q) => !state.responses[q.id]);
    return firstUnanswered === -1 ? 0 : firstUnanswered;
  });
  const [viewMode, setViewMode] = useState<'question' | 'summary' | 'history'>('question');

  if (!state) return null;
  const isAr = language === 'ar';
  const currentQ = QUESTIONNAIRE_26[index];
  const currentResp = state.responses[currentQ.id];
  const answeredTotal = Object.keys(state.responses).length;

  const blocks = useMemo(() => {
    const map = new Map<number, { titleEn: string; titleAr: string; firstIdx: number }>();
    QUESTIONNAIRE_26.forEach((q, idx) => {
      if (!map.has(q.blockNumber)) {
        map.set(q.blockNumber, {
          titleEn: q.blockTitleEn,
          titleAr: q.blockTitleAr,
          firstIdx: idx,
        });
      }
    });
    return Array.from(map.entries());
  }, []);

  const handleSelectOption = (val: string) => {
    if (currentQ.answerType === 'multi') {
      const existingArr = Array.isArray(currentResp?.answerJson) ? currentResp.answerJson : [];
      let nextArr: string[];
      if (val === 'None') {
        nextArr = ['None'];
      } else {
        const withoutNone = existingArr.filter((v) => v !== 'None');
        nextArr = withoutNone.includes(val)
          ? withoutNone.filter((v) => v !== val)
          : [...withoutNone, val];
      }
      saveQuestionAnswer(currentQ.id, nextArr.length ? nextArr : ['None'], 'answered');
    } else {
      saveQuestionAnswer(currentQ.id, val, 'answered');
    }
  };

  const handleSpecialStatus = (status: Extract<QuestionStatus, 'prefer_not_to_say' | 'not_sure'>) => {
    saveQuestionAnswer(currentQ.id, null, status);
    if (index < QUESTIONNAIRE_26.length - 1) {
      setIndex(index + 1);
    } else {
      runScreeningEvaluation();
      setViewMode('summary');
    }
  };

  const isSelected = (val: string) => {
    if (!currentResp || currentResp.status !== 'answered') return false;
    if (Array.isArray(currentResp.answerJson)) return currentResp.answerJson.includes(val);
    return currentResp.answerJson === val;
  };

  return (
    <div className="space-y-5">
      {/* Header & Mode Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#1A4D3E]">
            {QUESTIONNAIRE_DEFINITION_VERSION} · {answeredTotal}/{QUESTIONNAIRE_26.length}
          </p>
          <h1 className="text-[20px] font-bold text-[#151813]">
            {isAr ? 'استبيان الصحة الإنجابية (٥ أقسام)' : '26-Question Check (5 Blocks)'}
          </h1>
        </div>

        <div className="inline-flex rounded-2xl bg-white border border-[#E2E6E0] p-1 gap-1">
          <button
            type="button"
            onClick={() => setViewMode('question')}
            className={`px-3 py-1.5 rounded-xl text-[12px] font-semibold cursor-pointer ${
              viewMode === 'question' ? 'bg-[#1A4D3E] text-white' : 'text-[#646A63]'
            }`}
          >
            {isAr ? 'الأسئلة' : 'Questions'}
          </button>
          <button
            type="button"
            onClick={() => {
              runScreeningEvaluation();
              setViewMode('summary');
            }}
            className={`px-3 py-1.5 rounded-xl text-[12px] font-semibold cursor-pointer ${
              viewMode === 'summary' ? 'bg-[#1A4D3E] text-white' : 'text-[#646A63]'
            }`}
          >
            {isAr ? 'النتيجة' : 'Result'}
          </button>
          <button
            type="button"
            onClick={() => setViewMode('history')}
            className={`px-3 py-1.5 rounded-xl text-[12px] font-semibold cursor-pointer inline-flex items-center gap-1 ${
              viewMode === 'history' ? 'bg-[#1A4D3E] text-white' : 'text-[#646A63]'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>{isAr ? 'السجل' : 'History'}</span>
          </button>
        </div>
      </div>

      {/* Prompt note before questionnaire (Part 17) */}
      <p className="text-[12px] text-[#646A63]">
        {isAr
          ? 'تستغرق هذه الأسئلة قرابة ٥ دقائق. يمكنك اختيار «أفضل عدم الإجابة» في أي وقت ويُحفظ تقدمك تلقائياً.'
          : 'These questions take about 5 minutes. You can choose "Prefer not to say" any time, and progress saves after every answer.'}
      </p>

      {/* Immediate offline urgent warning whenever Block 1 triggers */}
      {urgentTriggered && <UrgentCareBanner />}

      {viewMode === 'question' && (
        <div className="space-y-4">
          {/* 5 Block Pills */}
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
            {blocks.map(([blockNum, meta]) => {
              const active = currentQ.blockNumber === blockNum;
              return (
                <button
                  key={blockNum}
                  type="button"
                  onClick={() => setIndex(meta.firstIdx)}
                  className={`px-3 py-1.5 rounded-full text-[11px] font-semibold whitespace-nowrap cursor-pointer border transition-colors ${
                    active
                      ? 'bg-[#151813] text-white border-[#151813]'
                      : 'bg-white text-[#646A63] border-[#E2E6E0] hover:border-[#1A4D3E]'
                  }`}
                >
                  {isAr ? meta.titleAr : meta.titleEn}
                </button>
              );
            })}
          </div>

          {/* Progress Bar */}
          <div className="h-2 rounded-full bg-[#ECEEEB] overflow-hidden">
            <div
              className="h-full bg-[#1A4D3E] transition-all duration-300"
              style={{ width: `${Math.round(((index + 1) / QUESTIONNAIRE_26.length) * 100)}%` }}
            />
          </div>

          {/* Single Question Card */}
          <div className="rounded-[28px] bg-white border border-[#E2E6E0] p-6 space-y-5 shadow-xs">
            <div className="flex items-center justify-between text-[12px] font-semibold text-[#646A63]">
              <span>{isAr ? currentQ.blockTitleAr : currentQ.blockTitleEn}</span>
              <span className="tabular-nums">
                {index + 1} / {QUESTIONNAIRE_26.length} ({currentQ.id})
              </span>
            </div>

            <div className="space-y-1.5">
              <h2 className="text-[19px] font-bold text-[#151813] leading-snug">
                {isAr ? currentQ.textAr : currentQ.textEn}
              </h2>
              {(currentQ.helperEn || currentQ.helperAr) && (
                <p className="text-[12px] text-[#646A63]">
                  {isAr ? currentQ.helperAr : currentQ.helperEn}
                </p>
              )}
            </div>

            {/* Answer Choices */}
            <div className="space-y-2.5">
              {currentQ.options.map((opt) => {
                const selected = isSelected(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleSelectOption(opt.value)}
                    className={`w-full px-4 py-3.5 rounded-2xl border text-start flex items-center justify-between gap-3 transition-all cursor-pointer ${
                      selected
                        ? 'bg-[#FFF45A] border-[#151813] text-[#151813] font-bold'
                        : 'bg-[#F6F7F5] border-transparent text-[#151813] font-medium hover:border-[#CFD5CD]'
                    }`}
                  >
                    <span className="text-[14px]">{isAr ? opt.labelAr : opt.labelEn}</span>
                    {selected && <CheckCircle2 className="w-4 h-4 text-[#151813] shrink-0" />}
                  </button>
                );
              })}

              {/* Mandatory "Prefer not to say" and "Not sure" on EVERY question */}
              <div className="grid grid-cols-2 gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => handleSpecialStatus('prefer_not_to_say')}
                  className={`px-3 py-3 rounded-2xl border text-[12px] font-semibold cursor-pointer transition-colors ${
                    currentResp?.status === 'prefer_not_to_say'
                      ? 'bg-[#151813] text-white border-[#151813]'
                      : 'bg-white text-[#646A63] border-[#E2E6E0] hover:bg-[#ECEEEB]'
                  }`}
                >
                  {isAr ? 'أفضل عدم الإجابة' : 'Prefer not to say'}
                </button>
                <button
                  type="button"
                  onClick={() => handleSpecialStatus('not_sure')}
                  className={`px-3 py-3 rounded-2xl border text-[12px] font-semibold cursor-pointer transition-colors ${
                    currentResp?.status === 'not_sure'
                      ? 'bg-[#151813] text-white border-[#151813]'
                      : 'bg-white text-[#646A63] border-[#E2E6E0] hover:bg-[#ECEEEB]'
                  }`}
                >
                  {isAr ? 'غير متأكد' : 'Not sure'}
                </button>
              </div>
            </div>

            {/* Prev / Next Navigation */}
            <div className="flex items-center justify-between gap-3 pt-2 border-t border-[#ECEEEB]">
              <button
                type="button"
                disabled={index === 0}
                onClick={() => setIndex(Math.max(0, index - 1))}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-2xl bg-[#ECEEEB] text-[#151813] text-[13px] font-semibold disabled:opacity-40 cursor-pointer"
              >
                <ArrowLeft className={`w-4 h-4 ${isRtl ? 'rotate-180' : ''}`} />
                <span>{isAr ? 'السابق' : 'Previous'}</span>
              </button>

              {index < QUESTIONNAIRE_26.length - 1 ? (
                <button
                  type="button"
                  onClick={() => setIndex(index + 1)}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-2xl bg-[#1A4D3E] text-white text-[13px] font-semibold hover:bg-[#143D31] cursor-pointer"
                >
                  <span>{isAr ? 'التالي' : 'Next Question'}</span>
                  <ArrowRight className={`w-4 h-4 ${isRtl ? 'rotate-180' : ''}`} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    runScreeningEvaluation();
                    setViewMode('summary');
                  }}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-2xl bg-[#151813] text-white text-[13px] font-semibold cursor-pointer"
                >
                  <ClipboardList className="w-4 h-4 text-[#FFF45A]" />
                  <span>{isAr ? 'عرض شريط النتيجة' : 'View Screening Bar'}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {viewMode === 'summary' && (
        <div className="space-y-4">
          <ThreeColourBar run={state.screeningRuns[0] || null} />
        </div>
      )}

      {viewMode === 'history' && (
        <div className="space-y-4">
          <div className="rounded-3xl bg-white border border-[#E2E6E0] p-5 space-y-3">
            <h2 className="text-[15px] font-bold text-[#151813]">
              {isAr ? 'سجل نتائج الفحص (غير قابل للكتابة الفوقية)' : 'Versioned Screening Run History'}
            </h2>
            {state.screeningRuns.length === 0 ? (
              <p className="text-[12px] text-[#646A63]">
                {isAr ? 'لا توجد تشغيلات مسجلة بعد.' : 'No screening runs recorded yet.'}
              </p>
            ) : (
              <div className="space-y-2">
                {state.screeningRuns.map((run) => (
                  <div
                    key={run.runId}
                    className="rounded-2xl bg-[#F6F7F5] p-3 flex items-center justify-between gap-3 text-[12px]"
                  >
                    <div>
                      <p className="font-bold text-[#151813]">
                        {run.colour.toUpperCase()} · {run.urgency} ({run.ruleVersion})
                      </p>
                      <p className="text-[#646A63]">{isAr ? run.reasonAr : run.reasonEn}</p>
                    </div>
                    <span className="text-[11px] text-[#646A63] shrink-0 tabular-nums">
                      {run.createdAt.slice(0, 16).replace('T', ' ')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-3xl bg-white border border-[#E2E6E0] p-5 space-y-3">
            <h2 className="text-[15px] font-bold text-[#151813]">
              {isAr ? 'سجل تعديلات الإجابات' : 'Answer Change Log (Append-Only)'}
            </h2>
            {state.responseHistory.length === 0 ? (
              <p className="text-[12px] text-[#646A63]">
                {isAr ? 'لم يتم حفظ أي إجابات بعد.' : 'No saved response rows yet.'}
              </p>
            ) : (
              <div className="max-h-72 overflow-y-auto space-y-1.5">
                {state.responseHistory.slice(0, 25).map((r) => (
                  <div
                    key={r.responseId}
                    className="rounded-xl bg-[#F6F7F5] px-3 py-2 flex items-center justify-between text-[12px]"
                  >
                    <span className="font-semibold text-[#151813]">
                      {r.questionId}:{' '}
                      {r.status === 'answered'
                        ? Array.isArray(r.answerJson)
                          ? r.answerJson.join(', ')
                          : r.answerJson
                        : r.status}
                    </span>
                    <span className="text-[11px] text-[#646A63] tabular-nums">
                      {r.answeredAt.slice(11, 19)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
