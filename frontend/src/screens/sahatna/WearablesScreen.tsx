import React, { useState } from 'react';
import { Activity, HeartPulse, Info, Lock, Moon, Watch } from 'lucide-react';
import { useSahatna } from '../../store/SahatnaContext';

export const WearablesScreen: React.FC = () => {
  const {
    state,
    language,
    t,
    toggleConsent,
    setWearableConnected,
    setWearableSource,
    toggleWearablePermission,
  } = useSahatna();

  const [windowDays, setWindowDays] = useState<7 | 28>(7);

  if (!state) return null;
  const isAr = language === 'ar';
  const wearableConsent = state.consents.wearable_read?.state;
  const slice = state.wearableMetrics.slice(0, windowDays).reverse();

  const avg = (vals: Array<number | null>): string => {
    const valid = vals.filter((v): v is number => v !== null);
    if (valid.length === 0) return 'Not available from your device';
    return (valid.reduce((a, b) => a + b, 0) / valid.length).toFixed(1);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#1A4D3E]">
            {isAr ? 'متابعة العادات (F11)' : 'Habit & Risk-Factor Tracker (F11)'}
          </p>
          <h1 className="text-[20px] font-bold text-[#151813]">
            {isAr ? 'بيانات الساعة والنوم' : 'Wearables: Sleep, Resting HR & Steps'}
          </h1>
        </div>

        <div className="inline-flex rounded-2xl bg-white border border-[#E2E6E0] p-1 gap-1">
          <button
            type="button"
            onClick={() => setWindowDays(7)}
            className={`px-3 py-1.5 rounded-xl text-[12px] font-semibold cursor-pointer ${
              windowDays === 7 ? 'bg-[#1A4D3E] text-white' : 'text-[#646A63]'
            }`}
          >
            7 Days
          </button>
          <button
            type="button"
            onClick={() => setWindowDays(28)}
            className={`px-3 py-1.5 rounded-xl text-[12px] font-semibold cursor-pointer ${
              windowDays === 28 ? 'bg-[#1A4D3E] text-white' : 'text-[#646A63]'
            }`}
          >
            28 Days
          </button>
        </div>
      </div>

      {/* Mandatory Non-Fertility Disclaimer (Part 9 & Part 17) */}
      <div className="rounded-2xl bg-[#ECEEEB] border border-[#CFD5CD] p-4 flex items-start gap-3">
        <Info className="w-5 h-5 text-[#1A4D3E] shrink-0 mt-0.5" />
        <div className="space-y-1 text-[12px]">
          <p className="font-bold text-[#151813]">{t.wearables.disclaimer}</p>
          <p className="text-[#646A63]">{t.wearables.evidenceNote}</p>
        </div>
      </div>

      {!wearableConsent ? (
        <div className="rounded-3xl bg-[#FFF8E1] border border-[#F5DFA0] p-5 space-y-3">
          <div className="flex items-center gap-2 text-[14px] font-bold text-[#614300]">
            <Lock className="w-4 h-4" />
            <span>Wearable sync consent (`wearable_read`) is OFF</span>
          </div>
          <button
            type="button"
            onClick={() => toggleConsent('wearable_read', true)}
            className="px-4 py-2.5 rounded-2xl bg-[#1A4D3E] text-white text-[12px] font-semibold cursor-pointer"
          >
            Allow Wearable Read Consent
          </button>
        </div>
      ) : (
        <>
          {/* Source & Per-Category Permissions */}
          <div className="rounded-3xl bg-white border border-[#E2E6E0] p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Watch className="w-5 h-5 text-[#1A4D3E]" />
                <div>
                  <p className="text-[14px] font-bold text-[#151813]">{state.wearableSource}</p>
                  <p className="text-[11px] text-[#646A63]">
                    {state.wearableConnected ? 'Connected (daily summaries only)' : 'Disconnected'}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <select
                  value={state.wearableSource}
                  onChange={(e) =>
                    setWearableSource(
                      e.target.value as 'Apple HealthKit' | 'Android Health Connect' | 'Manual Demo Sync'
                    )
                  }
                  className="px-3 py-1.5 rounded-xl bg-[#F6F7F5] border border-[#E2E6E0] text-[12px] font-semibold"
                >
                  <option value="Apple HealthKit">Apple HealthKit</option>
                  <option value="Android Health Connect">Android Health Connect</option>
                  <option value="Manual Demo Sync">Manual Demo Sync</option>
                </select>
                <button
                  type="button"
                  onClick={() => setWearableConnected(!state.wearableConnected)}
                  className={`px-3.5 py-1.5 rounded-xl text-[12px] font-semibold cursor-pointer ${
                    state.wearableConnected
                      ? 'bg-[#FEF3F2] text-[#B42318]'
                      : 'bg-[#1A4D3E] text-white'
                  }`}
                >
                  {state.wearableConnected ? 'Disconnect' : 'Reconnect'}
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {(['sleep', 'restingHr', 'hrv', 'steps'] as const).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => toggleWearablePermission(cat)}
                  className={`px-3 py-1.5 rounded-full text-[11px] font-semibold border cursor-pointer ${
                    state.wearablePermissions[cat]
                      ? 'bg-[#E9F7EF] border-[#B8E3C9] text-[#124D30]'
                      : 'bg-[#F6F7F5] border-[#E2E6E0] text-[#646A63]'
                  }`}
                >
                  {cat}: {state.wearablePermissions[cat] ? 'Allowed' : 'Off (NULL)'}
                </button>
              ))}
            </div>
          </div>

          {state.wearableConnected && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="rounded-3xl bg-white border border-[#E2E6E0] p-4 space-y-2">
                <div className="flex items-center gap-2 text-[#1A4D3E] text-[12px] font-bold">
                  <Moon className="w-4 h-4" />
                  <span>Sleep ({windowDays}d avg)</span>
                </div>
                <p className="text-[22px] font-extrabold text-[#151813] tabular-nums">
                  {state.wearablePermissions.sleep
                    ? `${avg(slice.map((d) => d.sleepHours))} h`
                    : 'Permission off'}
                </p>
                <p className="text-[11px] text-[#646A63]">Source: {state.wearableSource}</p>
              </div>

              <div className="rounded-3xl bg-white border border-[#E2E6E0] p-4 space-y-2">
                <div className="flex items-center gap-2 text-[#1A4D3E] text-[12px] font-bold">
                  <HeartPulse className="w-4 h-4" />
                  <span>Resting HR ({windowDays}d)</span>
                </div>
                <p className="text-[22px] font-extrabold text-[#151813] tabular-nums">
                  {state.wearablePermissions.restingHr
                    ? `${avg(slice.map((d) => d.restingHrBpm))} bpm`
                    : 'Permission off'}
                </p>
                <p className="text-[11px] text-[#646A63]">Never affects screening colour</p>
              </div>

              <div className="rounded-3xl bg-white border border-[#E2E6E0] p-4 space-y-2">
                <div className="flex items-center gap-2 text-[#1A4D3E] text-[12px] font-bold">
                  <Activity className="w-4 h-4" />
                  <span>HRV RMSSD ({windowDays}d)</span>
                </div>
                <p className="text-[22px] font-extrabold text-[#151813] tabular-nums">
                  {state.wearablePermissions.hrv
                    ? `${avg(slice.map((d) => d.hrvRmssdMs))} ms`
                    : 'Permission off'}
                </p>
                <p className="text-[11px] text-[#646A63]">Missing days kept NULL</p>
              </div>

              <div className="rounded-3xl bg-white border border-[#E2E6E0] p-4 space-y-2">
                <div className="flex items-center gap-2 text-[#1A4D3E] text-[12px] font-bold">
                  <Activity className="w-4 h-4" />
                  <span>Steps ({windowDays}d avg)</span>
                </div>
                <p className="text-[22px] font-extrabold text-[#151813] tabular-nums">
                  {state.wearablePermissions.steps
                    ? Math.round(Number(avg(slice.map((d) => d.steps)))).toLocaleString()
                    : 'Permission off'}
                </p>
                <p className="text-[11px] text-[#646A63]">Moderate movement nudge</p>
              </div>
            </div>
          )}

          {/* Simple SVG Bar Trend Chart for Sleep */}
          {state.wearableConnected && state.wearablePermissions.sleep && (
            <div className="rounded-3xl bg-white border border-[#E2E6E0] p-5 space-y-3">
              <p className="text-[14px] font-bold text-[#151813]">
                {windowDays}-Day Sleep Duration Trend ({state.wearableSource})
              </p>
              <div className="flex items-end gap-1.5 h-32 pt-2">
                {slice.map((d) => {
                  const hPct = d.sleepHours ? Math.min(100, Math.round((d.sleepHours / 10) * 100)) : 0;
                  return (
                    <div
                      key={d.localDate}
                      title={`${d.localDate}: ${d.sleepHours ?? 'NULL'}h`}
                      className="flex-1 flex flex-col items-center justify-end h-full gap-1"
                    >
                      <div
                        className="w-full rounded-t-md bg-[#1A4D3E] min-h-[4px]"
                        style={{ height: `${hPct}%` }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
