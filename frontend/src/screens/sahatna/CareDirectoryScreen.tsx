import React, { useState } from 'react';
import {
  Building2,
  Clock,
  Lock,
  MapPin,
  Phone,
  Share2,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { UAE_CARE_PROVIDERS } from '../../data/catalogs';
import { useSahatna } from '../../store/SahatnaContext';
import { CareProvider } from '../../types/sahatna';

export const CareDirectoryScreen: React.FC = () => {
  const { state, language, createShareGrant, revokeShareGrant, toggleConsent } = useSahatna();
  const [emirateFilter, setEmirateFilter] = useState<'All' | 'Dubai' | 'Abu Dhabi' | 'Sharjah'>('All');
  const [selectedProvider, setSelectedProvider] = useState<CareProvider | null>(
    UAE_CARE_PROVIDERS[0]
  );
  const [hoursValid, setHoursValid] = useState<number>(24);
  const [scopeFlags, setScopeFlags] = useState<string[]>([
    'Screening bar & reasons',
    'Semen pre-screen bands (no numbers)',
    'Confirmed lab summaries',
  ]);

  if (!state) return null;
  const isAr = language === 'ar';
  const shareConsent = state.consents.share_clinic?.state;

  const filteredProviders =
    emirateFilter === 'All'
      ? UAE_CARE_PROVIDERS
      : UAE_CARE_PROVIDERS.filter((p) => p.emirate === emirateFilter);

  const latestScreening = state.screeningRuns[0];
  const latestSemen = state.semenRuns.find((r) => !r.isDemo);
  const confirmedReportsCount = state.reports.filter((r) => r.state === 'Summarised').length;

  const toggleScope = (item: string) => {
    setScopeFlags((prev) =>
      prev.includes(item) ? prev.filter((x) => x !== item) : [...prev, item]
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#1A4D3E]">
            {isAr ? 'دليل الرعاية في الإمارات (F13)' : 'UAE Care Directory & Referral Sharing (F13)'}
          </p>
          <h1 className="text-[20px] font-bold text-[#151813]">
            {isAr ? 'المختبرات والعيادات المعتمدة' : 'Diagnostic Labs & Urology Clinics'}
          </h1>
        </div>

        <div className="flex gap-1.5">
          {(['All', 'Dubai', 'Abu Dhabi', 'Sharjah'] as const).map((em) => (
            <button
              key={em}
              type="button"
              onClick={() => setEmirateFilter(em)}
              className={`px-3 py-1.5 rounded-full text-[11px] font-semibold cursor-pointer border ${
                emirateFilter === em
                  ? 'bg-[#151813] text-white border-[#151813]'
                  : 'bg-white text-[#646A63] border-[#E2E6E0]'
              }`}
            >
              {em}
            </button>
          ))}
        </div>
      </div>

      <p className="text-[12px] text-[#646A63]">
        {isAr
          ? 'دليل منسق للعيادات والمختبرات في الإمارات. يتم حجز الموعد مباشرة مع المركز عبر الهاتف أو الاستقبال.'
          : 'Curated directory of UAE diagnostic centres. Direct bookings are arranged with the clinic by phone or reception.'}
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Provider Cards */}
        <div className="lg:col-span-6 space-y-3">
          {filteredProviders.map((prov) => {
            const active = selectedProvider?.id === prov.id;
            return (
              <div
                key={prov.id}
                onClick={() => setSelectedProvider(prov)}
                className={`rounded-3xl p-4 border cursor-pointer transition-colors space-y-2 ${
                  active
                    ? 'bg-[#E9F7EF] border-[#1A4D3E]'
                    : 'bg-white border-[#E2E6E0] hover:border-[#1A4D3E]'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5">
                    <span className="w-9 h-9 rounded-2xl bg-[#1A4D3E] text-white flex items-center justify-center shrink-0">
                      <Building2 className="w-4 h-4" />
                    </span>
                    <div>
                      <h2 className="text-[14px] font-bold text-[#151813]">
                        {isAr ? prov.nameAr : prov.nameEn}
                      </h2>
                      <p className="text-[11px] font-semibold text-[#1A4D3E]">
                        {prov.type} · {prov.emirate}
                      </p>
                    </div>
                  </div>
                </div>

                <p className="text-[12px] text-[#646A63] flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 shrink-0" />
                  <span>{isAr ? prov.addressAr : prov.addressEn}</span>
                </p>

                <div className="flex flex-wrap gap-1.5">
                  {prov.servicesEn.map((s) => (
                    <span
                      key={s}
                      className="px-2.5 py-1 rounded-full bg-white border border-[#E2E6E0] text-[10px] font-semibold text-[#151813]"
                    >
                      {s}
                    </span>
                  ))}
                </div>

                <div className="flex items-center justify-between pt-1">
                  <a
                    href={`tel:${prov.phone.replace(/\s+/g, '')}`}
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1.5 text-[12px] font-bold text-[#1A4D3E] hover:underline"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    <span className="tabular-nums">{prov.phone}</span>
                  </a>
                  <span className="text-[11px] text-[#646A63]">{prov.notesEn}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Referral Summary Preview & Expiring Share Grants (E12-S2) */}
        <div className="lg:col-span-6 space-y-4">
          <div className="rounded-3xl bg-white border border-[#E2E6E0] p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Share2 className="w-5 h-5 text-[#1A4D3E]" />
              <h2 className="text-[16px] font-bold text-[#151813]">
                {isAr ? 'معاينة ملخص الإحالة والمشاركة المؤقتة' : 'Referral Summary Preview & Expiry Share'}
              </h2>
            </div>

            {!shareConsent ? (
              <div className="rounded-2xl bg-[#FFF8E1] border border-[#F5DFA0] p-4 space-y-2.5">
                <p className="text-[12px] font-semibold text-[#614300] flex items-center gap-1.5">
                  <Lock className="w-4 h-4" /> Consent `share_clinic` is currently OFF.
                </p>
                <button
                  type="button"
                  onClick={() => toggleConsent('share_clinic', true)}
                  className="px-3.5 py-2 rounded-xl bg-[#1A4D3E] text-white text-[12px] font-semibold cursor-pointer"
                >
                  Allow Clinic Sharing
                </button>
              </div>
            ) : (
              <>
                <div className="rounded-2xl bg-[#F6F7F5] border border-[#E2E6E0] p-3.5 text-[12px] space-y-1">
                  <p className="font-bold text-[#151813]">
                    De-identified Summary Preview (Alias: @{state.user.username})
                  </p>
                  <p className="text-[#646A63]">
                    • Screening bar: {latestScreening ? `${latestScreening.colour.toUpperCase()} (${latestScreening.urgency})` : 'Not run yet'}
                  </p>
                  <p className="text-[#646A63]">
                    • Home Pre-Screen Bands: {latestSemen ? `Conc ${latestSemen.bandConc} / Motility ${latestSemen.bandMotility} (No numbers)` : 'None'}
                  </p>
                  <p className="text-[#646A63]">
                    • Confirmed Lab Reports: {confirmedReportsCount} summary record(s)
                  </p>
                </div>

                <div className="space-y-2">
                  <p className="text-[12px] font-bold text-[#151813]">Select Scope to Share:</p>
                  {[
                    'Screening bar & reasons',
                    'Semen pre-screen bands (no numbers)',
                    'Confirmed lab summaries',
                  ].map((item) => (
                    <label
                      key={item}
                      className="flex items-center gap-2 text-[12px] text-[#151813] cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={scopeFlags.includes(item)}
                        onChange={() => toggleScope(item)}
                      />
                      <span>{item}</span>
                    </label>
                  ))}
                </div>

                <div className="flex items-center justify-between gap-3">
                  <label className="text-[12px] font-semibold text-[#151813]">Expires after:</label>
                  <select
                    value={hoursValid}
                    onChange={(e) => setHoursValid(Number(e.target.value))}
                    className="px-3 py-2 rounded-xl bg-[#F6F7F5] border border-[#E2E6E0] text-[12px] font-semibold"
                  >
                    <option value={24}>24 hours</option>
                    <option value={168}>7 days</option>
                    <option value={720}>30 days</option>
                  </select>
                </div>

                <button
                  type="button"
                  disabled={!selectedProvider || scopeFlags.length === 0}
                  onClick={() =>
                    selectedProvider &&
                    createShareGrant(
                      selectedProvider.id,
                      isAr ? selectedProvider.nameAr : selectedProvider.nameEn,
                      scopeFlags,
                      hoursValid
                    )
                  }
                  className="w-full py-3 rounded-2xl bg-[#1A4D3E] text-white text-[13px] font-semibold disabled:opacity-40 cursor-pointer"
                >
                  Create Time-Limited Share Pass for{' '}
                  {selectedProvider ? (isAr ? selectedProvider.nameAr : selectedProvider.nameEn) : ''}
                </button>
              </>
            )}
          </div>

          {/* Active & Revoked Share Grants */}
          <div className="rounded-3xl bg-white border border-[#E2E6E0] p-5 space-y-3">
            <h3 className="text-[14px] font-bold text-[#151813]">
              Active Share Passes ({state.shareGrants.length})
            </h3>
            {state.shareGrants.length === 0 ? (
              <p className="text-[12px] text-[#646A63]">No clinic shares issued yet.</p>
            ) : (
              <div className="space-y-2">
                {state.shareGrants.map((g) => (
                  <div
                    key={g.grantId}
                    className={`rounded-2xl p-3 border text-[12px] flex items-start justify-between gap-2 ${
                      g.revoked
                        ? 'bg-[#F6F7F5] border-[#E2E6E0] opacity-60'
                        : 'bg-[#E9F7EF] border-[#B8E3C9]'
                    }`}
                  >
                    <div className="space-y-0.5">
                      <p className="font-bold text-[#151813] flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-[#1A4D3E]" />
                        <span>{g.providerName}</span>
                      </p>
                      <p className="font-mono text-[11px] font-bold text-[#124D30]">
                        Code: {g.shareCode} {g.revoked ? '(REVOKED)' : ''}
                      </p>
                      <p className="text-[11px] text-[#646A63] flex items-center gap-1">
                        <Clock className="w-3 h-3" /> Expires: {g.expiresAt.slice(0, 16).replace('T', ' ')}
                      </p>
                    </div>
                    {!g.revoked && (
                      <button
                        type="button"
                        onClick={() => revokeShareGrant(g.grantId)}
                        className="px-2.5 py-1.5 rounded-xl bg-white text-[#B42318] text-[11px] font-bold inline-flex items-center gap-1 border border-[#F9C6C2] cursor-pointer"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Revoke</span>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
