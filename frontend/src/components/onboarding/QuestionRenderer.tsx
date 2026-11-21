import React from 'react';
import { Activity, Check } from 'lucide-react';
import { ONBOARDING_IMAGES } from '../../data/assets';
import { AnswerValue, QuestionDefinition } from '../../types/questionnaire';

interface QuestionRendererProps {
  question: QuestionDefinition;
  value: AnswerValue | undefined;
  onChange: (val: AnswerValue) => void;
  error?: string | null;
}

export const QuestionRenderer: React.FC<QuestionRendererProps> = ({
  question,
  value,
  onChange,
  error,
}) => {
  return (
    <div className="space-y-4">
      <div className="rounded-[24px] bg-[#F1F2F0] p-4 sm:p-5 shadow-[0_2px_14px_rgba(25,26,18,0.04)] space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1 flex-1">
            <h2 className="text-[18px] sm:text-[20px] font-semibold text-[#191A12] leading-snug">
              {question.text}
            </h2>
            {question.description && (
              <p className="text-[12px] text-[#646964] leading-relaxed pt-0.5">
                {question.description}
              </p>
            )}
          </div>

          <div className="hidden sm:block relative w-16 h-16 shrink-0">
            <div className="absolute -inset-1 rounded-2xl bg-[#9B91DB]/30 rotate-6" />
            <img
              src={ONBOARDING_IMAGES.lifestyle}
              alt="Wellness routine"
              referrerPolicy="no-referrer"
              className="relative w-16 h-16 rounded-2xl object-cover border border-white shadow-xs"
            />
          </div>
        </div>

        {/* Single-Select Yellow Pill Options */}
        {question.inputType === 'single' && (
          <div className="flex flex-wrap gap-2.5 pt-1">
            {(question.options || []).map((opt) => {
              const selected = value === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onChange(opt.value)}
                  className={`min-h-[44px] px-4 py-2.5 rounded-full text-[13px] font-medium transition-all flex items-center gap-2 text-left cursor-pointer ${
                    selected
                      ? 'bg-[#FFF45A] text-[#191A12] font-semibold shadow-[0_4px_12px_rgba(255,244,90,0.4)]'
                      : 'bg-[#E5E7E4] text-[#191A12] hover:bg-[#DCE0DC]'
                  }`}
                >
                  <span>{opt.label}</span>
                  {selected && (
                    <span className="w-4 h-4 rounded-full bg-[#171706] text-[#FFF45A] flex items-center justify-center shrink-0">
                      <Check className="w-2.5 h-2.5 stroke-[3]" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Numeric Input */}
        {question.inputType === 'numeric' && (
          <div className="rounded-2xl bg-white px-4 py-3.5 flex items-center justify-between gap-3 border border-[#E2E5E1]">
            <input
              type="number"
              inputMode="numeric"
              min={question.min}
              max={question.max}
              value={typeof value === 'number' ? value : ''}
              onChange={(e) => {
                const raw = e.target.value;
                onChange(raw === '' ? null : Number(raw));
              }}
              placeholder={question.placeholder || '0'}
              className="w-full text-[28px] font-bold text-[#191A12] placeholder:text-[#A5AAA7] tabular-nums bg-transparent focus:outline-none"
            />
            {question.unit && (
              <span className="text-[14px] font-semibold text-[#7B807B] shrink-0">
                {question.unit}
              </span>
            )}
          </div>
        )}

        {/* Validation error */}
        {error && (
          <div className="rounded-xl bg-[#C94B45]/10 border border-[#C94B45]/30 px-3.5 py-2.5 flex items-start gap-2 text-[#A3302B]">
            <Activity className="w-4 h-4 shrink-0 mt-0.5" />
            <p className="text-[12px] font-medium leading-snug">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
};
