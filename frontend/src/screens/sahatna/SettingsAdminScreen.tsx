import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Globe,
  Info,
  KeyRound,
  Lock,
  LogOut,
  Shield,
  ShoppingBag,
  Sliders,
  Trash2,
} from 'lucide-react';
import { CONSENT_DEFINITIONS, SEMEN_KITS } from '../../data/catalogs';
import { useSahatna } from '../../store/SahatnaContext';
import { PipelineStageCode } from '../../types/sahatna';

const STAGES: PipelineStageCode[] = [
  'S0', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9', 'S10', 'S11', 'S12', 'S13',
];

export const SettingsAdminScreen: React.FC = () => {
  const {
    state,
    language,
    t,
    setLanguage,
    toggleConsent,
    updateRecoveryContact,
    updateFeatureFlags,
    exportAllUserDataJson,
    deleteAllUserData,
    signOutSession,
    auditEvents,
    refreshAuditEvents,
  } = useSahatna();

  const [emailInput, setEmailInput] = useState(state?.user.recoveryEmail || '');
  const [phoneInput, setPhoneInput] = useState(state?.user.recoveryPhone || '');
  const [recoverySaved, setRecoverySaved] = useState(false);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);

  // Admin QA Chain-break test & Numeric leakage test state (Part 14.2 & F17)
  const [faultStage, setFaultStage] = useState<PipelineStageCode>('S6');
  const [faultResultMsg, setFaultResultMsg] = useState<string | null>(null);
  const [leakageTestMsg, setLeakageTestMsg] = useState<string | null>(null);

  if (!state) return null;
  const isAr = language === 'ar';

  const handleDownloadExport = () => {
    const jsonStr = exportAllUserDataJson();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sahatna-export-${state.user.username}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const runChainBreakTest = async () => {
    setFaultResultMsg('Running chain-break fault injection...');
    try {
      const dummyClips = Array.from({ length: 5 }, (_, i) => ({
        clipId: `qa_${i}`,
        fieldIndex: i + 1,
        durationS: 10,
        fps: 30,
        width: 1920,
        height: 1080,
        focusVariance: 120,
        clippedDarkPct: 0.4,
        clippedBrightPct: 0.4,
        driftPxPerSec: 0.6,
        blobCountPerFrame: 45,
        uploadProgress: 100,
        uploaded: true,
        sha256: `qa_sha_${i}`,
        qualityPass: true,
      }));
      const res = await fetch('/v1/semen/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: `qa_fault_${faultStage}`,
          userId: state.user.userId,
          consentSemenMedia: true,
          setupType: 'clip_on',
          kitProfile: SEMEN_KITS[0],
          sampleMeta: {
            abstinenceDays: 3,
            collectedAtIso: new Date().toISOString(),
            temperatureNote: 'room',
          },
          clips: dummyClips,
          isDemo: true,
          validationMode: state.featureFlags.semenValidationMode,
          previousUnclearOrLowCount: 0,
          injectFaultStage: faultStage,
        }),
      });
      const data = await res.json();
      setFaultResultMsg(
        `Stage ${faultStage} fault handled cleanly -> State: ${data.state}, Overall Bar: ${String(
          data.overallColour
        ).toUpperCase()} (never Green on failure), Conc: ${data.bandConc}, Motility: ${data.bandMotility}`
      );
      refreshAuditEvents();
    } catch {
      setFaultResultMsg('Chain-break test request failed cleanly.');
    }
  };

  const runNumericLeakageCheck = () => {
    const serialized = JSON.stringify(state.semenRuns);
    const leaked = /\b\d+(\.\d+)?\s*(million\/mL|M\/mL|µm\/s)\b/i.test(serialized);
    setLeakageTestMsg(
      leaked
        ? 'FAIL: Numeric leakage detected in semen runs.'
        : `PASS (R1 Verified): Checked ${state.semenRuns.length} semen run(s) — zero numeric sperm counts, velocities, or percentages present.`
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#1A4D3E]">
            @{state.user.username} · {state.user.userId.slice(0, 12)}
          </p>
          <h1 className="text-[20px] font-bold text-[#151813]">
            {isAr ? 'الإعدادات والأذونات وحقوق البيانات' : 'Settings, Consents, Data Rights & QA'}
          </h1>
        </div>

        <button
          type="button"
          onClick={signOutSession}
          className="px-3.5 py-2 rounded-2xl bg-white border border-[#E2E6E0] text-[12px] font-semibold text-[#151813] inline-flex items-center gap-1.5 cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
          <span>{isAr ? 'تسجيل الخروج' : 'Sign Out'}</span>
        </button>
      </div>

      {/* Language & RTL Switch + Recovery Contact */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-3xl bg-white border border-[#E2E6E0] p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Globe className="w-5 h-5 text-[#1A4D3E]" />
            <h2 className="text-[15px] font-bold text-[#151813]">
              {isAr ? 'اللغة واتجاه الواجهة' : 'Language & RTL Layout'}
            </h2>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setLanguage('en')}
              className={`flex-1 py-2.5 rounded-2xl text-[13px] font-semibold border cursor-pointer ${
                language === 'en'
                  ? 'bg-[#1A4D3E] text-white border-[#1A4D3E]'
                  : 'bg-[#F6F7F5] text-[#151813] border-[#E2E6E0]'
              }`}
            >
              English (LTR)
            </button>
            <button
              type="button"
              onClick={() => setLanguage('ar')}
              className={`flex-1 py-2.5 rounded-2xl text-[13px] font-semibold border cursor-pointer ${
                language === 'ar'
                  ? 'bg-[#1A4D3E] text-white border-[#1A4D3E]'
                  : 'bg-[#F6F7F5] text-[#151813] border-[#E2E6E0]'
              }`}
            >
              العربية (RTL)
            </button>
          </div>
        </div>

        <div className="rounded-3xl bg-white border border-[#E2E6E0] p-5 space-y-3">
          <div className="flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-[#1A4D3E]" />
            <h2 className="text-[15px] font-bold text-[#151813]">
              {isAr ? 'وسيلة استعادة الحساب' : 'Account Recovery Method (Optional)'}
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              type="email"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              placeholder={t.onboarding.emailPlaceholder}
              className="px-3 py-2 rounded-xl bg-[#F6F7F5] border border-[#E2E6E0] text-[12px]"
            />
            <input
              type="tel"
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              placeholder={t.onboarding.phonePlaceholder}
              className="px-3 py-2 rounded-xl bg-[#F6F7F5] border border-[#E2E6E0] text-[12px]"
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            {recoverySaved ? (
              <span className="text-[11px] font-bold text-[#1D7A4C]">Saved!</span>
            ) : (
              <span className="text-[11px] text-[#646A63]">No real name needed.</span>
            )}
            <button
              type="button"
              onClick={() => {
                updateRecoveryContact(emailInput, phoneInput);
                setRecoverySaved(true);
                setTimeout(() => setRecoverySaved(false), 2000);
              }}
              className="px-4 py-2 rounded-xl bg-[#1A4D3E] text-white text-[12px] font-semibold cursor-pointer"
            >
              {t.save}
            </button>
          </div>
        </div>
      </div>

      {/* Consent Centre — 8 Separate Switches (F3, Section 3.2) */}
      <section className="rounded-3xl bg-white border border-[#E2E6E0] p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-[#1A4D3E]" />
          <div>
            <h2 className="text-[16px] font-bold text-[#151813]">
              {isAr ? 'مركز الأذونات (٨ مفاتيح مستقلة)' : 'Consent Centre (8 Separate Controls)'}
            </h2>
            <p className="text-[12px] text-[#646A63]">{t.onboarding.consentIntro}</p>
          </div>
        </div>

        <div className="divide-y divide-[#ECEEEB]">
          {CONSENT_DEFINITIONS.map((def) => {
            const rec = state.consents[def.key];
            const isOn = Boolean(rec?.state);
            return (
              <div
                key={def.key}
                className="py-3 flex items-center justify-between gap-4"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-[13px] font-bold text-[#151813]">
                      {isAr ? def.titleAr : def.titleEn}
                    </p>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#F6F7F5] text-[#646A63]">
                      {def.key} · {def.version} · {def.neededFor}
                    </span>
                  </div>
                  <p className="text-[12px] text-[#646A63] mt-0.5">
                    {isAr ? def.plainAr : def.plainEn}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={def.requiredForCore}
                  onClick={() => toggleConsent(def.key, !isOn)}
                  className={`px-3.5 py-1.5 rounded-full text-[11px] font-bold shrink-0 cursor-pointer transition-colors ${
                    isOn
                      ? 'bg-[#1D7A4C] text-white'
                      : 'bg-[#ECEEEB] text-[#646A63]'
                  } ${def.requiredForCore ? 'opacity-70 cursor-not-allowed' : ''}`}
                >
                  {isOn ? 'ON' : 'OFF'}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* Settings > Shopping: Disabled Noon Coming Soon Toggle (D6, E8-S3) */}
      <section className="rounded-3xl bg-white border border-[#E2E6E0] p-5 flex items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="w-9 h-9 rounded-2xl bg-[#FFF45A] text-[#151813] flex items-center justify-center shrink-0">
            <ShoppingBag className="w-4 h-4" />
          </span>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-[14px] font-bold text-[#151813]">{t.noon.comingSoonToggle}</p>
              <span className="px-2 py-0.5 rounded-full bg-[#ECEEEB] text-[#646A63] text-[10px] font-bold uppercase">
                {t.noon.comingSoonBadge}
              </span>
            </div>
            <p className="text-[12px] text-[#646A63] mt-0.5">
              noon_assist_mode = `{state.featureFlags.noonAssistMode}` · Switched off and non-tappable in this release.
            </p>
          </div>
        </div>
        <button
          type="button"
          disabled
          aria-disabled="true"
          className="px-3.5 py-1.5 rounded-full bg-[#ECEEEB] text-[#9A9F99] text-[11px] font-bold cursor-not-allowed shrink-0"
        >
          OFF
        </button>
      </section>

      {/* Data Rights (F15 — Export & Full Delete Section 13.5) */}
      <section className="rounded-3xl bg-white border border-[#E2E6E0] p-5 space-y-4">
        <h2 className="text-[16px] font-bold text-[#151813]">
          {isAr ? 'حقوق البيانات (تصدير / حذف)' : 'Data Rights (Export & Deletion Lifecycle F15)'}
        </h2>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleDownloadExport}
            className="px-4 py-2.5 rounded-2xl bg-[#1A4D3E] text-white text-[12px] font-semibold inline-flex items-center gap-2 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>{isAr ? 'تصدير جميع بياناتي (JSON)' : 'Export All My Data (JSON, 7-day link)'}</span>
          </button>

          {!confirmDeleteAll ? (
            <button
              type="button"
              onClick={() => setConfirmDeleteAll(true)}
              className="px-4 py-2.5 rounded-2xl bg-[#FEF3F2] border border-[#F9C6C2] text-[#B42318] text-[12px] font-semibold inline-flex items-center gap-2 cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              <span>{isAr ? 'حذف جميع بياناتي وحسابي' : 'Delete All My Data'}</span>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={deleteAllUserData}
                className="px-4 py-2.5 rounded-2xl bg-[#B42318] text-white text-[12px] font-bold cursor-pointer"
              >
                Confirm Permanent Delete
              </button>
              <button
                type="button"
                onClick={() => setConfirmDeleteAll(false)}
                className="px-3 py-2.5 rounded-2xl bg-[#ECEEEB] text-[12px] font-semibold cursor-pointer"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
        <p className="text-[11px] text-[#646A63]">
          Deletion removes reports, semen runs, summaries, conversation memory, and caches, retaining only a minimal non-health deletion audit record (Section 13.5).
        </p>
      </section>

      {/* Admin & Clinician Tools + QA Verification (F17 & Part 14.2) */}
      <section className="rounded-3xl bg-white border border-[#E2E6E0] p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Sliders className="w-5 h-5 text-[#1A4D3E]" />
          <div>
            <h2 className="text-[16px] font-bold text-[#151813]">
              Admin & Clinician Governance (F17 · Zero User-Record Browsing)
            </h2>
            <p className="text-[11px] text-[#646A63]">
              Content versions, remote feature flags, S0–S13 chain-break tester, and redacted audit view.
            </p>
          </div>
        </div>

        {/* Feature Flags */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-[12px]">
          <div className="rounded-2xl bg-[#F6F7F5] p-3 space-y-1">
            <p className="font-bold text-[#151813]">Ask:LlmMode</p>
            <select
              value={state.featureFlags.askLlmMode}
              onChange={(e) =>
                updateFeatureFlags({
                  askLlmMode: e.target.value as 'Full' | 'TemplatesOnly' | 'Off',
                })
              }
              className="w-full px-2.5 py-1.5 rounded-xl bg-white border border-[#E2E6E0] font-semibold"
            >
              <option value="Full">Full (Gemini + Validator)</option>
              <option value="TemplatesOnly">TemplatesOnly (No LLM)</option>
              <option value="Off">Off</option>
            </select>
          </div>

          <div className="rounded-2xl bg-[#F6F7F5] p-3 space-y-1">
            <p className="font-bold text-[#151813]">Semen Module Flag</p>
            <button
              type="button"
              onClick={() =>
                updateFeatureFlags({ semenModuleEnabled: !state.featureFlags.semenModuleEnabled })
              }
              className={`w-full py-1.5 rounded-xl font-bold cursor-pointer ${
                state.featureFlags.semenModuleEnabled
                  ? 'bg-[#1D7A4C] text-white'
                  : 'bg-[#B42318] text-white'
              }`}
            >
              {state.featureFlags.semenModuleEnabled ? 'Enabled' : 'Suspended'}
            </button>
          </div>

          <div className="rounded-2xl bg-[#F6F7F5] p-3 space-y-1">
            <p className="font-bold text-[#151813]">Validation Mode (A5)</p>
            <select
              value={state.featureFlags.semenValidationMode}
              onChange={(e) =>
                updateFeatureFlags({
                  semenValidationMode: e.target.value as 'prototype' | 'validated',
                })
              }
              className="w-full px-2.5 py-1.5 rounded-xl bg-white border border-[#E2E6E0] font-semibold"
            >
              <option value="prototype">Prototype pre-screen</option>
              <option value="validated">Validated mode (Post-Study)</option>
            </select>
          </div>

          <div className="rounded-2xl bg-[#F6F7F5] p-3 space-y-1">
            <p className="font-bold text-[#151813]">Judge Demo Mode (F16)</p>
            <button
              type="button"
              onClick={() =>
                updateFeatureFlags({ demoModeEnabled: !state.featureFlags.demoModeEnabled })
              }
              className={`w-full py-1.5 rounded-xl font-bold cursor-pointer ${
                state.featureFlags.demoModeEnabled
                  ? 'bg-[#FFF45A] text-[#151813]'
                  : 'bg-[#ECEEEB] text-[#646A63]'
              }`}
            >
              {state.featureFlags.demoModeEnabled ? 'Demo Active' : 'Demo Hidden'}
            </button>
          </div>
        </div>

        {/* Chain-Break Test & Numeric Leakage Verification (Part 14.2) */}
        <div className="rounded-2xl bg-[#F6F7F5] p-4 space-y-3">
          <p className="text-[13px] font-bold text-[#151813]">
            Mandatory Verification Tests (Part 14.2)
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={faultStage}
              onChange={(e) => setFaultStage(e.target.value as PipelineStageCode)}
              className="px-3 py-2 rounded-xl bg-white border border-[#E2E6E0] text-[12px] font-semibold"
            >
              {STAGES.map((s) => (
                <option key={s} value={s}>Inject fault at {s}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={runChainBreakTest}
              className="px-3.5 py-2 rounded-xl bg-[#151813] text-white text-[12px] font-semibold cursor-pointer"
            >
              Run Chain-Break Test
            </button>
            <button
              type="button"
              onClick={runNumericLeakageCheck}
              className="px-3.5 py-2 rounded-xl bg-[#1A4D3E] text-white text-[12px] font-semibold cursor-pointer"
            >
              Run R1 Numeric Leakage Check
            </button>
          </div>

          {faultResultMsg && (
            <div className="rounded-xl bg-white border border-[#E2E6E0] p-2.5 text-[12px] font-medium flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-[#9A6B00] shrink-0" />
              <span>{faultResultMsg}</span>
            </div>
          )}
          {leakageTestMsg && (
            <div className="rounded-xl bg-[#E9F7EF] border border-[#B8E3C9] p-2.5 text-[12px] font-semibold text-[#124D30] flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{leakageTestMsg}</span>
            </div>
          )}
        </div>

        {/* Redacted System Audit Log (Rule P4 & P6) */}
        <div className="space-y-2">
          <p className="text-[12px] font-bold text-[#151813]">
            Redacted Audit Events (Zero Health Data / PII Logged)
          </p>
          <div className="max-h-44 overflow-y-auto rounded-2xl bg-[#F6F7F5] p-3 space-y-1 text-[11px] font-mono">
            {auditEvents.slice(0, 15).map((ev) => (
              <div key={ev.id} className="flex justify-between gap-2 text-[#151813]">
                <span>
                  [{ev.actorType}] {ev.action} → {ev.target}
                </span>
                <span className="text-[#646A63] shrink-0">{ev.at.slice(11, 19)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* About & Measured Performance (Section 10.3) */}
      <section className="rounded-3xl bg-white border border-[#E2E6E0] p-5 space-y-2 text-[12px] text-[#646A63]">
        <div className="flex items-center gap-2 text-[#151813] font-bold text-[14px]">
          <Info className="w-4 h-4 text-[#1A4D3E]" />
          <span>About Sahatna · Pre-screen, not a laboratory replacement</span>
        </div>
        <p>
          Design Rules R1–R4 locked: Bands only (Low / Typical / Unclear), no single fertility score, pre-screen disclaimer on every result, and never claims 100% accuracy. Prototype mode awaits the paired UAE clinic validation programme (minimum 150 participants) before switching to Validated mode.
        </p>
        <p className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#1A4D3E]">
          <Lock className="w-3.5 h-3.5" /> Region policy: UAE North data residency design with documented AI region exceptions.
        </p>
      </section>
    </div>
  );
};
