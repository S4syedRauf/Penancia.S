import React, { useEffect, useState } from 'react';
import {
  AlertOctagon,
  ArrowRight,
  MessageSquareHeart,
  Send,
  Trash2,
} from 'lucide-react';
import { useSahatna } from '../../store/SahatnaContext';
import { AskMessage } from '../../types/sahatna';

const QUICK_PROMPTS = [
  'How do I test my sample?',
  'Where are my lab results?',
  'What should I eat today?',
  'Find these on Noon',
  'Book a lab',
  'Delete my data',
];

export const AskAgentScreen: React.FC = () => {
  const {
    state,
    language,
    isRtl,
    askPrefillPrompt,
    setAskPrefillPrompt,
    appendAskMessage,
    clearAskHistory,
    setActiveTab,
    togglePlanActionToday,
  } = useSahatna();

  const [input, setInput] = useState<string>('');
  const [sending, setSending] = useState<boolean>(false);

  useEffect(() => {
    if (askPrefillPrompt) {
      setInput(askPrefillPrompt);
      setAskPrefillPrompt(null);
    }
  }, [askPrefillPrompt, setAskPrefillPrompt]);

  if (!state) return null;
  const isAr = language === 'ar';

  const sendQuestion = async (questionText: string) => {
    const trimmed = questionText.trim();
    if (!trimmed || sending) return;
    setInput('');
    setSending(true);

    const userMsg: AskMessage = {
      id: `msg_u_${Date.now()}`,
      role: 'user',
      text: trimmed,
      createdAt: new Date().toISOString(),
    };
    appendAskMessage(userMsg);

    try {
      const res = await fetch('/v1/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: trimmed,
          language,
          llmMode: state.featureFlags.askLlmMode,
          reportsAiConsent: state.consents.reports_ai?.state,
          wearableReadConsent: state.consents.wearable_read?.state,
          latestScreening: state.screeningRuns[0] || null,
          latestSemen: state.semenRuns.find((r) => !r.isDemo) || null,
          confirmedReports: state.reports.filter((r) => r.state === 'Summarised'),
          planCompletedToday: Object.values(state.planCompletions).filter((v) => v === 'done').length,
          planTotalToday: 5,
          wearables: state.wearableMetrics.slice(0, 7),
        }),
      });
      const data = await res.json();
      appendAskMessage({
        id: `msg_a_${Date.now()}`,
        role: 'assistant',
        text: data.text || 'Could not respond right now.',
        sourceLabels: data.sourceLabels || [],
        buttons: data.buttons || [],
        urgentAlert: Boolean(data.urgentAlert),
        modeUsed: data.modeUsed,
        createdAt: new Date().toISOString(),
      });
    } catch {
      appendAskMessage({
        id: `msg_err_${Date.now()}`,
        role: 'assistant',
        text: 'Ask service is offline. You can still browse your 74-day plan, Report Vault, and Care Directory directly.',
        buttons: [
          { code: 'CARE', labelEn: 'Open Care Directory', labelAr: 'دليل العيادات', route: 'care' },
        ],
        modeUsed: 'TemplatesOnly',
        createdAt: new Date().toISOString(),
      });
    } finally {
      setSending(false);
    }
  };

  void togglePlanActionToday;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#1A4D3E]">
            {isAr ? 'المساعد المقيّد (F12)' : 'Ask Sahatna · Controlled Router (F12)'}
          </p>
          <h1 className="text-[20px] font-bold text-[#151813]">
            {isAr ? 'اسأل عن تقاريرك وميزات التطبيق' : 'Ask Agent & Feature Navigator'}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-2.5 py-1 rounded-full bg-white border border-[#E2E6E0] text-[11px] font-semibold">
            Mode: {state.featureFlags.askLlmMode}
          </span>
          {state.askMessages.length > 0 && (
            <button
              type="button"
              onClick={clearAskHistory}
              className="p-2 rounded-xl bg-white border border-[#E2E6E0] text-[#646A63] hover:text-[#B42318] cursor-pointer"
              aria-label="Clear conversation"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Quick Prompt Chips (7.3 Navigation & Report Tests) */}
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
        {QUICK_PROMPTS.map((qp) => (
          <button
            key={qp}
            type="button"
            onClick={() => sendQuestion(qp)}
            className="px-3 py-1.5 rounded-full bg-white border border-[#E2E6E0] text-[12px] font-semibold text-[#151813] whitespace-nowrap hover:border-[#1A4D3E] cursor-pointer"
          >
            {qp}
          </button>
        ))}
      </div>

      {/* Chat Thread */}
      <div className="rounded-3xl bg-white border border-[#E2E6E0] p-4 min-h-[340px] max-h-[500px] overflow-y-auto space-y-3">
        {state.askMessages.length === 0 && (
          <div className="py-12 text-center space-y-2">
            <MessageSquareHeart className="w-8 h-8 text-[#1A4D3E] mx-auto" />
            <p className="text-[14px] font-bold text-[#151813]">
              {isAr ? 'اسأل عن فحصك أو تقريرك أو أين تجد أي ميزة' : 'Ask about your pre-screen, confirmed reports, or app features'}
            </p>
            <p className="text-[12px] text-[#646A63] max-w-md mx-auto">
              {isAr
                ? 'المساعد يقرأ فقط القيم المؤكدة من خزنتك عند منح الإذن، ولا يصدر تشخيصاً ولا أرقاماً منزلية.'
                : 'Reads only de-identified, confirmed data with consent. Never diagnoses, prescribes doses, or reveals home sperm counts.'}
            </p>
          </div>
        )}

        {state.askMessages.map((m) => (
          <div
            key={m.id}
            className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl p-3.5 space-y-2 ${
                m.role === 'user'
                  ? 'bg-[#1A4D3E] text-white'
                  : m.urgentAlert
                    ? 'bg-[#FEF3F2] border-2 border-[#B42318] text-[#7A1810]'
                    : 'bg-[#F6F7F5] border border-[#E2E6E0] text-[#151813]'
              }`}
            >
              {m.urgentAlert && (
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#B42318]">
                  <AlertOctagon className="w-4 h-4" />
                  <span>URGENT CARE SAFETY ROUTER</span>
                </div>
              )}

              <p className="text-[13px] leading-relaxed whitespace-pre-wrap">{m.text}</p>

              {m.buttons && m.buttons.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {m.buttons.map((b) => (
                    <button
                      key={b.code}
                      type="button"
                      onClick={() => setActiveTab(b.route)}
                      className="px-3 py-1.5 rounded-xl bg-[#151813] text-white text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <span>{isAr ? b.labelAr : b.labelEn}</span>
                      <ArrowRight className={`w-3 h-3 ${isRtl ? 'rotate-180' : ''}`} />
                    </button>
                  ))}
                </div>
              )}

              {m.sourceLabels && m.sourceLabels.length > 0 && (
                <p className="text-[10px] opacity-75">
                  Sources: {m.sourceLabels.join(' · ')} ({m.modeUsed})
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Input Composer */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          sendQuestion(input);
        }}
        className="flex gap-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            isAr ? 'اكتب سؤالك هنا...' : 'Ask about a report, pre-screen step, Noon food list, or clinics...'
          }
          className="flex-1 px-4 py-3 rounded-2xl bg-white border border-[#E2E6E0] text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1A4D3E]"
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="px-5 py-3 rounded-2xl bg-[#1A4D3E] text-white text-[13px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-40 cursor-pointer"
        >
          <Send className="w-4 h-4" />
          <span>{sending ? '...' : isAr ? 'إرسال' : 'Ask'}</span>
        </button>
      </form>
    </div>
  );
};
