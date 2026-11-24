import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ChevronRight,
  Clock,
  FlaskConical,
  HelpCircle,
  Lock,
  PauseCircle,
  Play,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import { SEMEN_KITS } from '../../data/catalogs';
import { useSahatna } from '../../store/SahatnaContext';
import {
  SemenBand,
  SemenClipRecord,
  SemenKitProfile,
  SemenSessionRun,
  SemenSetupType,
} from '../../types/sahatna';
import { DEMO_MODE } from '../../config';

const DEMO_SAMPLES: Array<{
  id: string;
  labelEn: string;
  labelAr: string;
  conc: SemenBand;
  motility: SemenBand;
  noSperm?: boolean;
  blobs: number;
}> = [
  {
    id: 'visem_typical',
    labelEn: 'VISEM Sample #01 (Typical Reference Loop)',
    labelAr: 'عينة تجريبية #٠١ (نطاق معتاد)',
    conc: 'Typical',
    motility: 'Typical',
    blobs: 52,
  },
  {
    id: 'visem_low_mot',
    labelEn: 'VISEM Sample #02 (Reduced Motility Loop)',
    labelAr: 'عينة تجريبية #٠٢ (حركة منخفضة)',
    conc: 'Typical',
    motility: 'Low',
    blobs: 48,
  },
  {
    id: 'visem_low_both',
    labelEn: 'VISEM Sample #03 (Low Count & Motility Loop)',
    labelAr: 'عينة تجريبية #٠٣ (تركيز وحركة منخفضان)',
    conc: 'Low',
    motility: 'Low',
    blobs: 14,
  },
  {
    id: 'visem_none',
    labelEn: 'Sample #04 (No Sperm Seen Loop)',
    labelAr: 'عينة تجريبية #٠٤ (لم تُرصد خلايا)',
    conc: 'Low',
    motility: 'Low',
    noSperm: true,
    blobs: 0,
  },
];

export const SemenPreScreenFlow: React.FC = () => {
  const {
    state,
    language,
    setActiveTab,
    setAskPrefillPrompt,
    toggleConsent,
    setSemenSetup,
    updateKitProfile,
    saveIncompleteSemenSession,
    addSemenRunResult,
    deleteSemenRun,
    addRetestReminder,
  } = useSahatna();

  const [guideStep, setGuideStep] = useState<number>(1);
  const [setupChoice, setSetupChoice] = useState<SemenSetupType>(
    state?.semenSetupType || 'clip_on'
  );
  const [selectedKit, setSelectedKit] = useState<SemenKitProfile>(
    state?.activeKitProfile || SEMEN_KITS[0]
  );
  const [customDepthUnknown, setCustomDepthUnknown] = useState<boolean>(false);
  const [showSupportedKits, setShowSupportedKits] = useState<boolean>(false);

  // Step 3 sample prep
  const [abstinenceDays, setAbstinenceDays] = useState<number>(3);
  const [sampleElapsedMins, setSampleElapsedMins] = useState<number>(32);
  const [temperatureNote, setTemperatureNote] = useState<'room' | '37c_stage'>('room');

  // Step 5 calibration
  const [calibrationStatus, setCalibrationStatus] = useState<'pending' | 'ok' | 'failed' | 'skipped'>(
    selectedKit.calibratedUmPerPx ? 'ok' : 'pending'
  );
  const [calibrationMsg, setCalibrationMsg] = useState<string>('');

  // Step 7 & 8 Live Quality Gate + Canvas Simulation
  const [useRealWebcam, setUseRealWebcam] = useState<boolean>(false);
  const [focusScore, setFocusScore] = useState<number>(125); // threshold >= 95
  const [brightness, setBrightness] = useState<number>(52); // 20..82 good
  const [driftPx, setDriftPx] = useState<number>(0.7); // <= 1.5
  const [blobCount, setBlobCount] = useState<number>(48); // 8..190 good
  const [aeAfLocked, setAeAfLocked] = useState<boolean>(false);
  const [torchOff, setTorchOff] = useState<boolean>(true);
  const [recordingSec, setRecordingSec] = useState<number | null>(null);
  const [recordedClips, setRecordedClips] = useState<SemenClipRecord[]>([]);
  const [moveSlidePrompt, setMoveSlidePrompt] = useState<boolean>(false);

  // Upload & Pipeline state
  const [uploadPaused, setUploadPaused] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [pipelineRunning, setPipelineRunning] = useState<boolean>(false);
  const [latestRun, setLatestRun] = useState<SemenSessionRun | null>(
    state?.semenRuns[0] || null
  );
  const [isDemoRun, setIsDemoRun] = useState<boolean>(false);
  const [demoChoice, setDemoChoice] = useState(DEMO_SAMPLES[0]);
  const [reminderSavedMsg, setReminderSavedMsg] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Optical live field animation loop
  useEffect(() => {
    if (guideStep !== 7) return;
    let raf = 0;
    const particles = Array.from({ length: Math.min(90, Math.max(0, blobCount)) }, (_, i) => ({
      x: (i * 73) % 320,
      y: (i * 131) % 200,
      vx: ((i % 7) - 3) * 0.45,
      vy: ((i % 5) - 2) * 0.45,
    }));

    const render = () => {
      const cvs = canvasRef.current;
      if (cvs) {
        const ctx = cvs.getContext('2d');
        if (ctx) {
          const lum = Math.round((brightness / 100) * 235);
          ctx.fillStyle = `rgb(${lum}, ${Math.min(245, lum + 6)}, ${lum})`;
          ctx.fillRect(0, 0, cvs.width, cvs.height);

          // Circular microscope field vignette
          ctx.strokeStyle = 'rgba(21,24,19,0.35)';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.arc(cvs.width / 2, cvs.height / 2, 92, 0, Math.PI * 2);
          ctx.stroke();

          // Particles
          const blurPx = focusScore < 95 ? (95 - focusScore) / 14 : 0;
          ctx.filter = blurPx > 0 ? `blur(${blurPx.toFixed(1)}px)` : 'none';
          particles.forEach((p) => {
            p.x = (p.x + p.vx + driftPx * 0.25 + cvs.width) % cvs.width;
            p.y = (p.y + p.vy + cvs.height) % cvs.height;
            ctx.fillStyle = lum > 110 ? '#1A4D3E' : '#FFF45A';
            ctx.beginPath();
            ctx.arc(p.x, p.y, 2.4, 0, Math.PI * 2);
            ctx.fill();
          });
          ctx.filter = 'none';
        }
      }
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [guideStep, focusScore, brightness, driftPx, blobCount]);

  // Real webcam toggle for Step 7
  useEffect(() => {
    let stream: MediaStream | null = null;
    if (useRealWebcam && guideStep === 7 && navigator.mediaDevices?.getUserMedia) {
      navigator.mediaDevices
        .getUserMedia({ video: { facingMode: 'environment' } })
        .then((s) => {
          stream = s;
          if (videoRef.current) videoRef.current.srcObject = s;
        })
        .catch(() => setUseRealWebcam(false));
    }
    return () => {
      stream?.getTracks().forEach((tr) => tr.stop());
    };
  }, [useRealWebcam, guideStep]);

  if (!state) return null;
  const isAr = language === 'ar';
  const hasSemenConsent = state.consents.semen_media?.state;

  if (!state.featureFlags.semenModuleEnabled) {
    return (
      <div className="rounded-3xl bg-white border border-[#E2E6E0] p-6 space-y-3">
        <h1 className="text-[18px] font-bold text-[#151813]">
          {isAr ? 'وحدة الفحص المنزلي متوقفة مؤقتاً' : 'Semen Pre-Screen Temporarily Paused'}
        </h1>
        <p className="text-[13px] text-[#646A63]">
          {isAr
            ? 'تم تعطيل الوحدة عبر علم الميزات الإداري. يمكنك الاستمرار بالاستبيان والتقارير وحجز المختبر.'
            : 'This module is currently paused via Admin feature flags. Your questionnaire, vault, and Care Directory remain active.'}
        </p>
        <button
          type="button"
          onClick={() => setActiveTab('care')}
          className="px-4 py-2.5 rounded-2xl bg-[#1A4D3E] text-white text-[13px] font-semibold cursor-pointer"
        >
          {isAr ? 'فتح دليل العيادات' : 'Open Care Directory'}
        </button>
      </div>
    );
  }

  // Quality gate real-time check (Section 6.6)
  const gateChecks = [
    {
      label: 'Resolution >= 1080p & 30+ fps',
      ok: true,
    },
    {
      label: `Focus: ${focusScore >= 95 ? 'Sharp' : 'Blurry — adjust focus'}`,
      ok: focusScore >= 95,
    },
    {
      label: `Exposure: ${
        brightness < 25 ? 'Too dark' : brightness > 82 ? 'Too bright' : 'Balanced (<2% clipped)'
      }`,
      ok: brightness >= 25 && brightness <= 82,
    },
    {
      label: `Stage drift: ${driftPx <= 1.5 ? 'Steady (<1.5 px/s)' : 'Slide moving — hold still'}`,
      ok: driftPx <= 1.5,
    },
    {
      label: `Density: ${
        blobCount < 8
          ? 'Too few cells — move to another area'
          : blobCount > 190
            ? 'Too dense'
            : 'In range'
      }`,
      ok: blobCount >= 8 && blobCount <= 190,
    },
    {
      label: `Auto-adjust lock & Torch off: ${aeAfLocked && torchOff ? 'Locked' : 'Tap Lock AE/AF'}`,
      ok: aeAfLocked && torchOff,
    },
  ];
  const qualityGatePasses = gateChecks.every((g) => g.ok);

  const handleRunCalibration = async (simulateFail = false) => {
    const res = await fetch('/v1/semen/calibration', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        detectedLinesCount: simulateFail ? 5 : 10,
        spacingVariancePct: simulateFail ? 6.2 : 1.1,
        fieldWidthUm: selectedKit.fieldWidthUmDefault,
      }),
    });
    
    if (res.status === 404) {
      const errorData = await res.json();
      const notAvailableMsg = isAr
        ? 'خدمة المعايرة غير متاحة في الإنتاج حالياً.'
        : 'Calibration service is not available in production yet.';
      setCalibrationStatus('failed');
      setCalibrationMsg(notAvailableMsg);
      return;
    }
    
    const data = await res.json();
    if (!data.ok) {
      setCalibrationStatus('failed');
      setCalibrationMsg(isAr ? data.messageAr : data.messageEn);
      return;
    }
    const updatedKit: SemenKitProfile = {
      ...selectedKit,
      calibratedUmPerPx: data.umPerPx,
      calibratedAt: data.calibratedAt,
    };
    setSelectedKit(updatedKit);
    updateKitProfile(updatedKit);
    setCalibrationStatus('ok');
    setCalibrationMsg(`Calibrated (${data.linesDetected} ruler lines within ${data.spacingVariancePct}% variance).`);
  };

  const handleRecordField = (fastPreview = false) => {
    if (!qualityGatePasses && !fastPreview) return;
    const totalMs = fastPreview ? 900 : 3000; // concise recording timer in web preview while labelling 10s field clip
    setRecordingSec(10);
    const stepTimer = setInterval(() => {
      setRecordingSec((prev) => (prev && prev > 1 ? prev - 1 : prev));
    }, totalMs / 10);

    setTimeout(() => {
      clearInterval(stepTimer);
      setRecordingSec(null);
      const nextClip: SemenClipRecord = {
        clipId: `clip_${Date.now()}_${recordedClips.length + 1}`,
        fieldIndex: recordedClips.length + 1,
        durationS: 10,
        fps: 30,
        width: 1920,
        height: 1080,
        focusVariance: focusScore,
        clippedDarkPct: brightness < 25 ? 4.5 : 0.4,
        clippedBrightPct: brightness > 82 ? 4.2 : 0.5,
        driftPxPerSec: driftPx,
        blobCountPerFrame: blobCount,
        uploadProgress: 0,
        uploaded: false,
        sha256: `sha256_${Math.random().toString(36).slice(2, 12)}`,
        qualityPass: true,
        syntheticSeed: {
          concCategory: blobCount < 20 ? 'Low' : 'Typical',
          motilityCategory: 'Typical',
        },
      };
      const updated = [...recordedClips, nextClip];
      setRecordedClips(updated);
      setMoveSlidePrompt(true);
      saveIncompleteSemenSession({
        sessionId: `ses_${Date.now()}`,
        setupType: setupChoice,
        kitProfile: selectedKit,
        sampleMeta: {
          abstinenceDays,
          collectedAtIso: new Date().toISOString(),
          temperatureNote,
        },
        clips: updated,
        isDemo: false,
        currentGuideStep: 7,
      });
    }, totalMs);
  };

  const runServerAnalysis = async (clipsToRun: SemenClipRecord[], demoModeFlag: boolean, demoItem?: typeof DEMO_SAMPLES[number]) => {
    setPipelineRunning(true);
    setUploadProgress(25);
    await new Promise((r) => setTimeout(r, 300));
    if (uploadPaused) return;
    setUploadProgress(75);
    await new Promise((r) => setTimeout(r, 300));
    setUploadProgress(100);

    const kitForRun: SemenKitProfile = customDepthUnknown
      ? { ...selectedKit, chamberDepthUm: null }
      : calibrationStatus === 'skipped' || calibrationStatus === 'failed'
        ? { ...selectedKit, calibratedUmPerPx: null }
        : selectedKit;

    const uploadedClips = clipsToRun.map((c) => ({ ...c, uploaded: true, uploadProgress: 100 }));

    const prevUnclearOrLow = state.semenRuns.filter(
      (r) =>
        !r.isDemo &&
        (r.bandConc !== 'Typical' || r.bandMotility !== 'Typical')
    ).length;

    const res = await fetch('/v1/semen/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: `ses_${Date.now()}`,
        userId: state.user.userId,
        consentSemenMedia: hasSemenConsent,
        setupType: setupChoice === 'neither' ? 'clip_on' : setupChoice,
        kitProfile: kitForRun,
        sampleMeta: {
          abstinenceDays,
          collectedAtIso: new Date().toISOString(),
          temperatureNote,
          sampleName: demoItem?.labelEn,
        },
        clips: uploadedClips,
        isDemo: demoModeFlag,
        demoAttribution: demoModeFlag ? 'VISEM-Tracking (CC BY 4.0) · Demo data' : undefined,
        validationMode: state.featureFlags.semenValidationMode,
        previousUnclearOrLowCount: prevUnclearOrLow,
      }),
    });
    
    if (res.status === 404) {
      setPipelineRunning(false);
      const errorData = await res.json();
      // Show clear "not available yet" message
      const notAvailableMsg = isAr
        ? 'خدمة الفحص المنزلي غير متاحة في الإنتاج حالياً. يرجى استخدام حجز المختبر أو الانتظار حتى تفعيل الخدمة.'
        : 'Home pre-screen service is not available in production yet. Please use lab booking or wait for service activation.';
      // Store the error message in a way the UI can display it
      const errorRun: SemenSessionRun = {
        sessionId: `ses_${Date.now()}`,
        runId: `run_${Date.now()}`,
        userId: state.user.userId,
        setupType: setupChoice === 'neither' ? 'clip_on' : setupChoice,
        kitProfile: selectedKit,
        sampleMeta: {
          abstinenceDays,
          collectedAtIso: new Date().toISOString(),
          temperatureNote,
          sampleName: demoItem?.labelEn,
        },
        isDemo: false,
        demoAttribution: 'Service Unavailable',
        modelVersion: 'unavailable',
        pipelineVersion: 'unavailable',
        validationMode: 'prototype',
        state: 'Rejected',
        bandConc: 'Unclear',
        bandMotility: 'Unclear',
        overallColour: 'red',
        explanationEn: notAvailableMsg,
        explanationAr: notAvailableMsg,
        noSpermSeen: false,
        usedItems: [],
        couldNotUseItems: ['Home pre-screen service unavailable in production'],
        stageLogs: [],
        createdAt: new Date().toISOString(),
        concReasonEn: 'Service not deployed',
        concReasonAr: 'الخدمة غير نشر',
        motilityReasonEn: 'Service not deployed',
        motilityReasonAr: 'الخدمة غير نشر',
      };
      addSemenRunResult(errorRun);
      setLatestRun(errorRun);
      setGuideStep(9);
      return;
    }
    
    const runResult: SemenSessionRun = await res.json();
    setPipelineRunning(false);
    addSemenRunResult(runResult);
    setLatestRun(runResult);
    setGuideStep(9);
  };

  const launchDemoModeRun = (sample: typeof DEMO_SAMPLES[number]) => {
    setIsDemoRun(true);
    setDemoChoice(sample);
    const demoClips: SemenClipRecord[] = Array.from({ length: 5 }, (_, idx) => ({
      clipId: `demo_${sample.id}_${idx + 1}`,
      fieldIndex: idx + 1,
      durationS: 10,
      fps: 30,
      width: 1920,
      height: 1080,
      focusVariance: 132,
      clippedDarkPct: 0.3,
      clippedBrightPct: 0.4,
      driftPxPerSec: 0.5,
      blobCountPerFrame: sample.blobs,
      uploadProgress: 100,
      uploaded: true,
      sha256: `demo_sha_${sample.id}_${idx}`,
      qualityPass: true,
      syntheticSeed: {
        concCategory: sample.conc,
        motilityCategory: sample.motility,
        noSperm: sample.noSperm,
      },
    }));
    runServerAnalysis(demoClips, true, sample);
  };

  const renderBandChip = (label: string, band: SemenBand, reason: string) => {
    const tone =
      band === 'Typical'
        ? 'bg-[#E9F7EF] border-[#B8E3C9] text-[#124D30]'
        : band === 'Low'
          ? 'bg-[#FFF8E1] border-[#F5DFA0] text-[#614300]'
          : 'bg-[#ECEEEB] border-[#CFD5CD] text-[#151813]';
    return (
      <div className={`rounded-2xl border p-4 space-y-1 ${tone}`}>
        <p className="text-[11px] font-bold uppercase tracking-wider opacity-80">{label}</p>
        <p className="text-[20px] font-extrabold">{band}</p>
        <p className="text-[12px] leading-snug">{reason}</p>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* Header + "I need help" Scoped Guide Button (6.3) */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#1A4D3E]">
            {isAr ? 'الوحدة الأساسية · F8' : 'Core Module · Home Pre-Screen (F8)'}
          </p>
          <h1 className="text-[20px] font-bold text-[#151813]">
            {isAr ? 'الفحص المنزلي الأولي للسائل المنوي' : 'Guided Semen Pre-Screen'}
          </h1>
        </div>

        <button
          type="button"
          onClick={() => {
            setAskPrefillPrompt(`I need help on semen pre-screen step ${guideStep}.`);
            setActiveTab('ask');
          }}
          className="px-3.5 py-2 rounded-2xl bg-white border border-[#E2E6E0] text-[12px] font-semibold text-[#151813] inline-flex items-center gap-1.5 hover:border-[#1A4D3E] cursor-pointer"
        >
          <HelpCircle className="w-4 h-4 text-[#1A4D3E]" />
          <span>{isAr ? 'أحتاج مساعدة' : 'I need help'}</span>
        </button>
      </div>

      {/* Incomplete session recovery banner (Part 12) */}
      {state.incompleteSemenSession && guideStep !== 7 && (
        <div className="rounded-2xl bg-[#FFF8E1] border border-[#F5DFA0] p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[13px] font-bold text-[#614300]">
              {isAr ? 'توجد جلسة تسجيل غير مكتملة' : 'Incomplete recording session found'}
            </p>
            <p className="text-[12px] text-[#614300]">
              {state.incompleteSemenSession.clips.length} clips saved locally.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setRecordedClips(state.incompleteSemenSession!.clips);
                setGuideStep(7);
              }}
              className="px-3 py-1.5 rounded-xl bg-[#151813] text-white text-[12px] font-semibold cursor-pointer"
            >
              {isAr ? 'متابعة' : 'Continue'}
            </button>
            <button
              type="button"
              onClick={() => saveIncompleteSemenSession(null)}
              className="px-3 py-1.5 rounded-xl bg-white text-[#7A1810] text-[12px] font-semibold cursor-pointer"
            >
              {isAr ? 'تجاهل' : 'Discard'}
            </button>
          </div>
        </div>
      )}

      {/* Consent Gate */}
      {!hasSemenConsent && (
        <div className="rounded-3xl bg-[#FFF8E1] border border-[#F5DFA0] p-5 space-y-3">
          <div className="flex items-center gap-2 text-[#614300] font-bold text-[14px]">
            <Lock className="w-4 h-4" />
            <span>
              {isAr
                ? 'مطلوب إذن تخزين فيديو الفحص المنزلي للمتابعة'
                : 'Consent `semen_media` is OFF — video storage is blocked at S0.'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => toggleConsent('semen_media', true)}
            className="px-4 py-2.5 rounded-2xl bg-[#1A4D3E] text-white text-[12px] font-semibold cursor-pointer"
          >
            {isAr ? 'السماح بتحليل الفيديو الآن' : 'Allow semen_media Consent'}
          </button>
        </div>
      )}

      {/* Judge Demo Mode Bar (F16) — only when DEMO_MODE is enabled */}
      {DEMO_MODE && state.featureFlags.demoModeEnabled && (
        <div className="rounded-3xl bg-[#FFF45A]/40 border border-[#E6D839] p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#151813]" />
              <span className="text-[13px] font-bold text-[#151813]">
                {isAr
                  ? 'الوضع التجريبي للتحكيم (مقاطع VISEM-Tracking CC BY 4.0)'
                  : 'Judge Demo Mode (F16) — Real Pipeline S2→S13'}
              </span>
            </div>
            <span className="text-[11px] font-medium text-[#614300]">
              {isAr ? 'لا تدخل نتائج التجربة في الخطة أو الأبحاث' : 'Excluded from plan & research'}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {DEMO_SAMPLES.map((s) => (
              <button
                key={s.id}
                type="button"
                disabled={pipelineRunning || !hasSemenConsent}
                onClick={() => launchDemoModeRun(s)}
                className="px-3 py-1.5 rounded-xl bg-white border border-[#D4C737] text-[11px] font-semibold text-[#151813] hover:bg-[#151813] hover:text-white transition-colors disabled:opacity-40 cursor-pointer"
              >
                {isAr ? s.labelAr : s.labelEn}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Stepper Pills */}
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
        {[
          { step: 1, label: '1. Intro' },
          { step: 2, label: '2. Kit & Setup' },
          { step: 3, label: '3. Sample Prep' },
          { step: 4, label: '4. Device' },
          { step: 5, label: '5. Calibrate' },
          { step: 6, label: '6. Load Slide' },
          { step: 7, label: '7. Capture (5–10)' },
          { step: 8, label: '8. Upload' },
          { step: 9, label: '9. Result' },
          { step: 10, label: '10. Clean-up' },
        ].map((item) => (
          <button
            key={item.step}
            type="button"
            onClick={() => setGuideStep(item.step)}
            className={`px-3 py-1.5 rounded-full text-[11px] font-semibold whitespace-nowrap cursor-pointer border ${
              guideStep === item.step
                ? 'bg-[#1A4D3E] text-white border-[#1A4D3E]'
                : 'bg-white text-[#646A63] border-[#E2E6E0]'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* STEP 1 — Before you start */}
      {guideStep === 1 && (
        <div className="rounded-3xl bg-white border border-[#E2E6E0] p-6 space-y-4">
          <h2 className="text-[18px] font-bold text-[#151813]">
            {isAr ? 'الخطوة ١ — قبل أن تبدأ' : 'Step 1 — Before you start'}
          </h2>
          <p className="text-[14px] leading-relaxed text-[#151813]">
            {isAr
              ? 'يعطيك هذا الفحص فكرة أولية فقط، ولا يغني عن التحليل المخبري. نعرض نطاقات عامة لا أرقاماً دقيقة. وإذا ظهر أي مؤشر مقلق سنرشدك لمراجعة طبيب.'
              : 'This test gives you an early idea. It does not replace a lab test. We show bands (Low / Typical / Unclear), not exact numbers. If anything looks wrong, we will tell you to see a clinician.'}
          </p>
          <button
            type="button"
            onClick={() => setGuideStep(2)}
            className="px-5 py-3 rounded-2xl bg-[#1A4D3E] text-white text-[13px] font-semibold inline-flex items-center gap-2 cursor-pointer"
          >
            <span>{isAr ? 'فهمت، متابعة' : 'Done — Next Step'}</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* STEP 2 — What you need & Setup Choice (D3, D4) */}
      {guideStep === 2 && (
        <div className="rounded-3xl bg-white border border-[#E2E6E0] p-6 space-y-4">
          <h2 className="text-[18px] font-bold text-[#151813]">
            {isAr ? 'الخطوة ٢ — ماذا تحتاج؟' : 'Step 2 — What you need & Choose Setup'}
          </h2>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[12px] text-[#646A63]">
            <li>• Supported clip-on lens or microscope adapter</li>
            <li>• Disposable fixed-depth chamber slide (10–20 µm)</li>
            <li>• Clean sterile collection container</li>
            <li>• Gloves, timer, bright steady light, tissue & bin bag</li>
          </ul>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => {
                setSetupChoice('clip_on');
                setSelectedKit(SEMEN_KITS[0]);
                setSemenSetup('clip_on', SEMEN_KITS[0]);
                setGuideStep(3);
              }}
              className={`p-4 rounded-2xl border text-start cursor-pointer ${
                setupChoice === 'clip_on'
                  ? 'bg-[#E9F7EF] border-[#1A4D3E]'
                  : 'bg-[#F6F7F5] border-[#E2E6E0]'
              }`}
            >
              <p className="text-[14px] font-bold text-[#151813]">
                {isAr ? 'لدي عدسة هاتف (S-A)' : 'I have a lens (S-A)'}
              </p>
              <p className="text-[11px] text-[#646A63] mt-1">300x clip-on + fixed chamber</p>
            </button>

            <button
              type="button"
              onClick={() => {
                setSetupChoice('microscope_adapter');
                setSelectedKit(SEMEN_KITS[2]);
                setSemenSetup('microscope_adapter', SEMEN_KITS[2]);
                setGuideStep(3);
              }}
              className={`p-4 rounded-2xl border text-start cursor-pointer ${
                setupChoice === 'microscope_adapter'
                  ? 'bg-[#E9F7EF] border-[#1A4D3E]'
                  : 'bg-[#F6F7F5] border-[#E2E6E0]'
              }`}
            >
              <p className="text-[14px] font-bold text-[#151813]">
                {isAr ? 'لدي مجهر (S-B)' : 'I have a microscope (S-B)'}
              </p>
              <p className="text-[11px] text-[#646A63] mt-1">Eyepiece adapter + calibration</p>
            </button>

            <button
              type="button"
              onClick={() => {
                setSetupChoice('neither');
                setSemenSetup('neither');
              }}
              className={`p-4 rounded-2xl border text-start cursor-pointer ${
                setupChoice === 'neither'
                  ? 'bg-[#FEF3F2] border-[#B42318]'
                  : 'bg-[#F6F7F5] border-[#E2E6E0]'
              }`}
            >
              <p className="text-[14px] font-bold text-[#151813]">
                {isAr ? 'ليس لدي أي منهما' : 'I have neither'}
              </p>
              <p className="text-[11px] text-[#646A63] mt-1">Disable capture safely</p>
            </button>
          </div>

          {/* D4 No Device Graceful Screen */}
          {setupChoice === 'neither' && (
            <div className="rounded-2xl bg-[#FFF8E1] border border-[#F5DFA0] p-4 space-y-3">
              <p className="text-[13px] font-semibold text-[#614300]">
                {isAr
                  ? 'للتسجيل تحتاج إلى عدسة مجهر للهاتف أو مجهر مع محول هاتف. بدون ذلك لا يمكننا فحص العينة.'
                  : 'To record, you need a clip-on microscope lens or a microscope with a phone adapter. Without it we cannot look at a sample.'}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setShowSupportedKits((v) => !v)}
                  className="px-3.5 py-2 rounded-xl bg-white border border-[#E2E6E0] text-[12px] font-semibold cursor-pointer"
                >
                  See supported kits
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('care')}
                  className="px-3.5 py-2 rounded-xl bg-[#1A4D3E] text-white text-[12px] font-semibold cursor-pointer"
                >
                  Book a laboratory test
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('questionnaire')}
                  className="px-3.5 py-2 rounded-xl bg-[#151813] text-white text-[12px] font-semibold cursor-pointer"
                >
                  Continue with questions and my reports
                </button>
              </div>
              {showSupportedKits && (
                <div className="rounded-xl bg-white p-3 text-[12px] space-y-1 border border-[#E2E6E0]">
                  {SEMEN_KITS.map((k) => (
                    <p key={k.kitId}>• {k.kitName}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* STEP 3 — Prepare Sample & 1-Hour Freshness Timer */}
      {guideStep === 3 && (
        <div className="rounded-3xl bg-white border border-[#E2E6E0] p-6 space-y-4">
          <h2 className="text-[18px] font-bold text-[#151813]">
            {isAr ? 'الخطوة ٣ — تحضير العينة' : 'Step 3 — Prepare the sample'}
          </h2>
          <ul className="space-y-1.5 text-[13px] text-[#646A63]">
            <li>• Abstain from ejaculation for 2 to 7 days before collection.</li>
            <li>• Collect in a clean sterile container (no lubricant or saliva).</li>
            <li>• Keep near body temperature; wait 30 minutes to liquefy; test within 1 hour.</li>
          </ul>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-2xl bg-[#F6F7F5] p-3">
              <label className="block text-[11px] font-bold text-[#646A63] mb-1">
                Abstinence days (2–7)
              </label>
              <input
                type="number"
                min={1}
                max={14}
                value={abstinenceDays}
                onChange={(e) => setAbstinenceDays(parseInt(e.target.value, 10) || 2)}
                className="w-full px-3 py-2 rounded-xl bg-white border border-[#E2E6E0] text-[14px] font-bold tabular-nums"
              />
            </div>

            <div className="rounded-2xl bg-[#F6F7F5] p-3">
              <label className="block text-[11px] font-bold text-[#646A63] mb-1">
                Minutes since collection
              </label>
              <input
                type="number"
                min={0}
                max={180}
                value={sampleElapsedMins}
                onChange={(e) => setSampleElapsedMins(parseInt(e.target.value, 10) || 0)}
                className="w-full px-3 py-2 rounded-xl bg-white border border-[#E2E6E0] text-[14px] font-bold tabular-nums"
              />
            </div>

            <div className="rounded-2xl bg-[#F6F7F5] p-3">
              <label className="block text-[11px] font-bold text-[#646A63] mb-1">
                Stage Temperature Note
              </label>
              <select
                value={temperatureNote}
                onChange={(e) => setTemperatureNote(e.target.value as 'room' | '37c_stage')}
                className="w-full px-3 py-2 rounded-xl bg-white border border-[#E2E6E0] text-[13px] font-semibold"
              >
                <option value="room">Room temperature</option>
                <option value="37c_stage">37 °C warmed stage</option>
              </select>
            </div>
          </div>

          {sampleElapsedMins > 60 && (
            <div className="rounded-2xl bg-[#FFF8E1] border border-[#F5DFA0] p-3 flex items-center gap-2 text-[12px] font-semibold text-[#614300]">
              <Clock className="w-4 h-4 shrink-0" />
              <span>Sample is over 1 hour old — motility estimation may be widened or Unclear.</span>
            </div>
          )}

          <button
            type="button"
            onClick={() => setGuideStep(4)}
            className="px-5 py-3 rounded-2xl bg-[#1A4D3E] text-white text-[13px] font-semibold cursor-pointer"
          >
            Continue to Device Setup
          </button>
        </div>
      )}

      {/* STEP 4 — Set up Device & Chamber Depth */}
      {guideStep === 4 && (
        <div className="rounded-3xl bg-white border border-[#E2E6E0] p-6 space-y-4">
          <h2 className="text-[18px] font-bold text-[#151813]">
            Step 4 — Set up {setupChoice === 'microscope_adapter' ? 'Microscope (S-B)' : 'Clip-On Lens (S-A)'}
          </h2>
          <div className="space-y-2">
            {SEMEN_KITS.map((k) => (
              <button
                key={k.kitId}
                type="button"
                onClick={() => {
                  setSelectedKit(k);
                  setCustomDepthUnknown(false);
                  setSetupChoice(k.type);
                  updateKitProfile(k);
                }}
                className={`w-full p-3.5 rounded-2xl border text-start cursor-pointer ${
                  selectedKit.kitId === k.kitId && !customDepthUnknown
                    ? 'bg-[#E9F7EF] border-[#1A4D3E]'
                    : 'bg-[#F6F7F5] border-[#E2E6E0]'
                }`}
              >
                <p className="text-[13px] font-bold text-[#151813]">{k.kitName}</p>
                <p className="text-[11px] text-[#646A63]">
                  Magnification: {k.magnification}{k.chamberDepthUm != null ? ` · Chamber depth: ${k.chamberDepthUm} µm` : ''}
                </p>
              </button>
            ))}

            <button
              type="button"
              onClick={() => setCustomDepthUnknown(true)}
              className={`w-full p-3.5 rounded-2xl border text-start cursor-pointer ${
                customDepthUnknown
                  ? 'bg-[#FFF8E1] border-[#9A6B00]'
                  : 'bg-[#F6F7F5] border-[#E2E6E0]'
              }`}
            >
              <p className="text-[13px] font-bold text-[#151813]">
                My chamber is not listed
              </p>
              <p className="text-[11px] text-[#646A63]">
                Concentration band will automatically be marked Unclear; motility still runs.
              </p>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setGuideStep(5)}
            className="px-5 py-3 rounded-2xl bg-[#1A4D3E] text-white text-[13px] font-semibold cursor-pointer"
          >
            Continue to Calibration (Step 5)
          </button>
        </div>
      )}

      {/* STEP 5 — Micrometer Calibration (6.5) */}
      {guideStep === 5 && (
        <div className="rounded-3xl bg-white border border-[#E2E6E0] p-6 space-y-4">
          <h2 className="text-[18px] font-bold text-[#151813]">
            Step 5 — Stage Micrometer Calibration
          </h2>
          <p className="text-[13px] text-[#646A63]">
            Verify pixel-to-micrometre scale using a 10 µm stage ruler or printed chamber grid (requires &ge; 8 consistent lines within 3%).
          </p>

          {/* Visual 10µm Ruler Preview */}
          <div className="rounded-2xl bg-[#151813] p-5 text-center space-y-2">
            <div className="flex justify-center gap-3">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="w-0.5 h-10 bg-[#FFF45A]" />
              ))}
            </div>
            <p className="text-[11px] text-[#FFF45A] font-mono">
              Stage Micrometer Grid · 10 µm divisions
            </p>
          </div>

          {calibrationMsg && (
            <div
              className={`rounded-2xl p-3 text-[12px] font-semibold ${
                calibrationStatus === 'ok'
                  ? 'bg-[#E9F7EF] text-[#124D30]'
                  : 'bg-[#FFF8E1] text-[#614300]'
              }`}
            >
              {calibrationMsg}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => handleRunCalibration(false)}
              className="px-4 py-2.5 rounded-2xl bg-[#1A4D3E] text-white text-[12px] font-semibold cursor-pointer"
            >
              Verify & Calibrate Ruler
            </button>
            <button
              type="button"
              onClick={() => handleRunCalibration(true)}
              className="px-4 py-2.5 rounded-2xl bg-[#ECEEEB] text-[#151813] text-[12px] font-semibold cursor-pointer"
            >
              Simulate Blurry Ruler (&gt;3% error)
            </button>
            <button
              type="button"
              onClick={() => {
                setCalibrationStatus('skipped');
                setGuideStep(6);
              }}
              className="px-4 py-2.5 rounded-2xl bg-white border border-[#E2E6E0] text-[#646A63] text-[12px] font-semibold cursor-pointer"
            >
              Skip (Motility ratio only)
            </button>
            <button
              type="button"
              onClick={() => setGuideStep(6)}
              className="px-4 py-2.5 rounded-2xl bg-[#151813] text-white text-[12px] font-semibold cursor-pointer ms-auto"
            >
              Next: Load Chamber
            </button>
          </div>
        </div>
      )}

      {/* STEP 6 — Load Chamber */}
      {guideStep === 6 && (
        <div className="rounded-3xl bg-white border border-[#E2E6E0] p-6 space-y-4">
          <h2 className="text-[18px] font-bold text-[#151813]">Step 6 — Load the Chamber</h2>
          <p className="text-[13px] text-[#646A63]">
            Mix sample gently. Place one small drop in the fixed-depth chamber without pressing. Let it settle for 30 seconds before finding fields.
          </p>
          <button
            type="button"
            onClick={() => setGuideStep(7)}
            className="px-5 py-3 rounded-2xl bg-[#1A4D3E] text-white text-[13px] font-semibold cursor-pointer"
          >
            Open Live Field Finder & Quality Gate
          </button>
        </div>
      )}

      {/* STEP 7 — Live Field Finder & Quality Gate + 5–10 Field Recording */}
      {guideStep === 7 && (
        <div className="rounded-3xl bg-white border border-[#E2E6E0] p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-[17px] font-bold text-[#151813]">
                Step 7 — Live Quality Gate & Field Capture ({recordedClips.length}/10 fields)
              </h2>
              <p className="text-[12px] text-[#646A63]">
                Minimum 5 distinct fields (10s each). Capture turns green only when all gate checks pass.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setUseRealWebcam((v) => !v)}
              className="px-3 py-1.5 rounded-xl bg-[#ECEEEB] text-[11px] font-semibold cursor-pointer"
            >
              {useRealWebcam ? 'Switch to Optical Simulator' : 'Use Real Camera Feed'}
            </button>
          </div>

          {moveSlidePrompt && (
            <div className="rounded-2xl bg-[#FFF45A] px-4 py-2.5 text-[12px] font-bold text-[#151813]">
              Field saved! Move to a new area — the slide must not be the same spot.
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Optical Viewfinder + Controls */}
            <div className="lg:col-span-6 space-y-3">
              <div className="relative rounded-2xl overflow-hidden bg-[#151813] border border-[#E2E6E0]">
                {useRealWebcam ? (
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-56 object-cover"
                  />
                ) : (
                  <canvas ref={canvasRef} width={360} height={220} className="w-full h-56 block" />
                )}
                {recordingSec !== null && (
                  <div className="absolute top-3 left-3 px-3 py-1 rounded-full bg-[#B42318] text-white text-[11px] font-bold">
                    REC · {recordingSec}s
                  </div>
                )}
              </div>

              {/* Optical Tuning Sliders (to test live quality gate failures/passes) */}
              <div className="rounded-2xl bg-[#F6F7F5] p-3 grid grid-cols-2 gap-3 text-[11px]">
                <label className="space-y-1">
                  <span className="font-semibold">Focus ({focusScore})</span>
                  <input
                    type="range"
                    min={40}
                    max={150}
                    value={focusScore}
                    onChange={(e) => setFocusScore(Number(e.target.value))}
                    className="w-full"
                  />
                </label>
                <label className="space-y-1">
                  <span className="font-semibold">Light ({brightness}%)</span>
                  <input
                    type="range"
                    min={10}
                    max={95}
                    value={brightness}
                    onChange={(e) => setBrightness(Number(e.target.value))}
                    className="w-full"
                  />
                </label>
                <label className="space-y-1">
                  <span className="font-semibold">Stage Drift ({driftPx} px/s)</span>
                  <input
                    type="range"
                    min={0}
                    max={4}
                    step={0.1}
                    value={driftPx}
                    onChange={(e) => setDriftPx(Number(e.target.value))}
                    className="w-full"
                  />
                </label>
                <label className="space-y-1">
                  <span className="font-semibold">Cells in Field ({blobCount})</span>
                  <input
                    type="range"
                    min={0}
                    max={210}
                    value={blobCount}
                    onChange={(e) => setBlobCount(Number(e.target.value))}
                    className="w-full"
                  />
                </label>
              </div>
            </div>

            {/* Gate Checklist + Capture Buttons */}
            <div className="lg:col-span-6 space-y-3">
              <div className="rounded-2xl bg-[#F6F7F5] p-3.5 space-y-2">
                {gateChecks.map((g) => (
                  <div key={g.label} className="flex items-center justify-between text-[12px]">
                    <span className={g.ok ? 'text-[#124D30] font-medium' : 'text-[#B42318] font-bold'}>
                      {g.label}
                    </span>
                    <span className="text-[11px] font-bold">{g.ok ? 'PASS' : 'FIX'}</span>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setAeAfLocked((v) => !v)}
                  className={`px-3.5 py-2 rounded-xl text-[12px] font-semibold cursor-pointer ${
                    aeAfLocked
                      ? 'bg-[#1D7A4C] text-white'
                      : 'bg-[#FFF45A] text-[#151813]'
                  }`}
                >
                  {aeAfLocked ? 'AE/AF/WB Locked' : '1. Lock Exposure & Focus'}
                </button>
                <button
                  type="button"
                  onClick={() => setTorchOff((v) => !v)}
                  className="px-3.5 py-2 rounded-xl bg-[#ECEEEB] text-[12px] font-semibold cursor-pointer"
                >
                  Torch: {torchOff ? 'OFF' : 'ON'}
                </button>
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  disabled={!qualityGatePasses || recordingSec !== null || recordedClips.length >= 10}
                  onClick={() => handleRecordField(false)}
                  className={`flex-1 py-3 px-4 rounded-2xl text-[13px] font-bold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                    qualityGatePasses
                      ? 'bg-[#1D7A4C] text-white hover:bg-[#165E3A]'
                      : 'bg-[#ECEEEB] text-[#646A63] cursor-not-allowed'
                  }`}
                >
                  <Camera className="w-4 h-4" />
                  <span>
                    {recordingSec !== null
                      ? `Recording Field ${recordedClips.length + 1}...`
                      : `Capture Field ${recordedClips.length + 1} (10s)`}
                  </span>
                </button>

                {recordedClips.length < 5 && (
                  <button
                    type="button"
                    onClick={() => {
                      setAeAfLocked(true);
                      setTorchOff(true);
                      const batch: SemenClipRecord[] = Array.from({ length: 5 }, (_, idx) => ({
                        clipId: `clip_${Date.now()}_${idx}`,
                        fieldIndex: idx + 1,
                        durationS: 10,
                        fps: 30,
                        width: 1920,
                        height: 1080,
                        focusVariance: 130,
                        clippedDarkPct: 0.4,
                        clippedBrightPct: 0.5,
                        driftPxPerSec: 0.6,
                        blobCountPerFrame: blobCount,
                        uploadProgress: 0,
                        uploaded: false,
                        sha256: `sha256_${Date.now()}_${idx}`,
                        qualityPass: true,
                        syntheticSeed: {
                          concCategory: blobCount < 20 ? 'Low' : 'Typical',
                          motilityCategory: 'Typical',
                        },
                      }));
                      setRecordedClips(batch);
                      setGuideStep(8);
                    }}
                    className="px-4 py-3 rounded-2xl bg-[#151813] text-white text-[12px] font-semibold cursor-pointer"
                  >
                    Quick-Capture 5 Passing Fields
                  </button>
                )}
              </div>

              {recordedClips.length >= 5 && (
                <button
                  type="button"
                  onClick={() => setGuideStep(8)}
                  className="w-full py-3 rounded-2xl bg-[#1A4D3E] text-white text-[13px] font-bold cursor-pointer"
                >
                  Continue to Upload & S0–S13 Analysis ({recordedClips.length} fields ready)
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* STEP 8 — Resumable Upload & Pipeline S0–S13 */}
      {guideStep === 8 && (
        <div className="rounded-3xl bg-white border border-[#E2E6E0] p-6 space-y-4">
          <h2 className="text-[18px] font-bold text-[#151813]">
            Step 8 — Resumable Upload & 14-Stage Server Pipeline
          </h2>
          <p className="text-[13px] text-[#646A63]">
            {recordedClips.length} fields queued locally with SHA-256 verification. Upload resumes cleanly if signal drops.
          </p>

          <div className="h-3 rounded-full bg-[#ECEEEB] overflow-hidden">
            <div
              className="h-full bg-[#1A4D3E] transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>

          <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              disabled={pipelineRunning || recordedClips.length < 5}
              onClick={() => {
                setUploadPaused(false);
                setIsDemoRun(false);
                runServerAnalysis(recordedClips, false);
              }}
              className="px-5 py-3 rounded-2xl bg-[#1A4D3E] text-white text-[13px] font-semibold inline-flex items-center gap-2 disabled:opacity-40 cursor-pointer"
            >
              <UploadCloud className="w-4 h-4" />
              <span>{pipelineRunning ? 'Running S0 → S13...' : 'Upload & Run Analysis'}</span>
            </button>

            <button
              type="button"
              onClick={() => setUploadPaused((p) => !p)}
              className="px-4 py-3 rounded-2xl bg-[#ECEEEB] text-[#151813] text-[12px] font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              {uploadPaused ? <Play className="w-4 h-4" /> : <PauseCircle className="w-4 h-4" />}
              <span>{uploadPaused ? 'Resume Upload' : 'Simulate Signal Pause'}</span>
            </button>
          </div>
        </div>
      )}

      {/* STEP 9 — Result Screen (R1–R4 compliant, zero raw counts!) */}
      {guideStep === 9 && latestRun && (
        <div className="space-y-4">
          {latestRun.isDemo && (
            <div className="rounded-2xl bg-[#FFF45A] border border-[#151813] px-4 py-3 text-[13px] font-bold text-[#151813]">
              Demo data. Not your sample. ({latestRun.demoAttribution})
            </div>
          )}

          <div className="rounded-3xl bg-white border border-[#E2E6E0] p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="px-3 py-1 rounded-full bg-[#ECEEEB] text-[#151813] text-[11px] font-bold">
                {latestRun.validationMode === 'prototype'
                  ? isAr
                    ? 'نسخة أولية تجريبية'
                    : 'Prototype pre-screen (not clinically validated)'
                  : 'Pre-screen · Validated mode'}
              </span>
              <span className="text-[11px] text-[#646A63]">
                {latestRun.modelVersion} · {latestRun.pipelineVersion}
              </span>
            </div>

            {/* Two Band Chips ONLY (R1: NEVER exact count) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {renderBandChip(
                isAr ? 'نطاق التركيز' : 'Concentration Band',
                latestRun.bandConc,
                isAr ? latestRun.concReasonAr : latestRun.concReasonEn
              )}
              {renderBandChip(
                isAr ? 'نطاق الحركة' : 'Motility Band',
                latestRun.bandMotility,
                isAr ? latestRun.motilityReasonAr : latestRun.motilityReasonEn
              )}
            </div>

            {/* 3-Colour Bar */}
            <div
              className={`rounded-2xl p-4 border space-y-2 ${
                latestRun.overallColour === 'green'
                  ? 'bg-[#E9F7EF] border-[#B8E3C9] text-[#124D30]'
                  : latestRun.overallColour === 'yellow'
                    ? 'bg-[#FFF8E1] border-[#F5DFA0] text-[#614300]'
                    : 'bg-[#FEF3F2] border-[#F9C6C2] text-[#7A1810]'
              }`}
            >
              <p className="text-[13px] font-extrabold uppercase">
                {latestRun.overallColour} Result
              </p>
              <p className="text-[13px] font-medium">
                {isAr ? latestRun.explanationAr : latestRun.explanationEn}
              </p>
            </div>

            <p className="text-[12px] font-semibold text-[#151813]">
              {isAr
                ? 'هذا فحص أولي ولا يغني عن التحليل المخبري.'
                : 'This is a pre-screen. It does not replace a laboratory test.'}
            </p>

            {/* What we used / could not use */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[12px]">
              <div className="rounded-2xl bg-[#F6F7F5] p-3.5">
                <p className="font-bold text-[#151813] mb-1">What we used</p>
                {latestRun.usedItems.map((u) => (
                  <p key={u} className="text-[#646A63]">• {u}</p>
                ))}
              </div>
              <div className="rounded-2xl bg-[#F6F7F5] p-3.5">
                <p className="font-bold text-[#151813] mb-1">What we could not use</p>
                {latestRun.couldNotUseItems.length > 0 ? (
                  latestRun.couldNotUseItems.map((c) => (
                    <p key={c} className="text-[#646A63]">• {c}</p>
                  ))
                ) : (
                  <p className="text-[#1D7A4C]">All pipeline stages completed cleanly.</p>
                )}
              </div>
            </div>

            {/* 14-Stage S0–S13 Audit Trail */}
            <details className="rounded-2xl bg-[#F6F7F5] p-3.5 text-[12px]">
              <summary className="font-bold text-[#151813] cursor-pointer">
                View 14-Stage Pipeline Trace (S0 → S13 · zero numeric leaks)
              </summary>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mt-3">
                {latestRun.stageLogs.map((log) => (
                  <div
                    key={log.stage}
                    className="rounded-xl bg-white px-3 py-1.5 flex items-center justify-between border border-[#E2E6E0]"
                  >
                    <span className="font-semibold">
                      {log.stage} {log.name}
                    </span>
                    <span
                      className={`text-[10px] font-bold uppercase ${
                        log.outcome === 'passed'
                          ? 'text-[#1D7A4C]'
                          : log.outcome === 'fallback'
                            ? 'text-[#9A6B00]'
                            : 'text-[#B42318]'
                      }`}
                    >
                      {log.outcome}
                    </span>
                  </div>
                ))}
              </div>
            </details>

            {/* Next Step Actions */}
            <div className="flex flex-wrap gap-2.5">
              {latestRun.overallColour === 'red' && (
                <button
                  type="button"
                  onClick={() => setActiveTab('care')}
                  className="px-4 py-2.5 rounded-2xl bg-[#B42318] text-white text-[12px] font-semibold cursor-pointer"
                >
                  Book a Laboratory Test (Care Directory)
                </button>
              )}
              <button
                type="button"
                onClick={() => setGuideStep(10)}
                className="px-4 py-2.5 rounded-2xl bg-[#1A4D3E] text-white text-[12px] font-semibold cursor-pointer"
              >
                Continue to Clean-up & Retest Reminder
              </button>
              <button
                type="button"
                onClick={() => {
                  setRecordedClips([]);
                  setGuideStep(7);
                }}
                className="px-4 py-2.5 rounded-2xl bg-[#ECEEEB] text-[#151813] text-[12px] font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Retake Pre-Screen</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 10 — Clean-up & Retest Reminder (F14) */}
      {guideStep === 10 && (
        <div className="rounded-3xl bg-white border border-[#E2E6E0] p-6 space-y-4">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-[#1A4D3E]" />
            <h2 className="text-[18px] font-bold text-[#151813]">
              Step 10 & 11 — Safe Clean-up & Retest Reminder
            </h2>
          </div>
          <p className="text-[13px] text-[#646A63] leading-relaxed">
            Treat the sample as biological material: wear gloves, seal the disposable chamber and tissues inside a closed bin bag, and wipe the lens and table surface thoroughly.
          </p>

          {reminderSavedMsg && (
            <div className="rounded-2xl bg-[#E9F7EF] border border-[#B8E3C9] p-3 text-[12px] font-semibold text-[#124D30]">
              {reminderSavedMsg}
            </div>
          )}

          <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={() => {
                const d = new Date();
                d.setDate(d.getDate() + 10);
                addRetestReminder({
                  reminderId: `rem_${Date.now()}`,
                  labelNeutral: 'Your check-in is ready',
                  dueDate: d.toISOString().slice(0, 10),
                  reasonType: 'home_repeat_1_2w',
                  createdAt: new Date().toISOString(),
                });
                setReminderSavedMsg('Neutral reminder scheduled in 10 days ("Your check-in is ready").');
              }}
              className="px-4 py-2.5 rounded-2xl bg-[#1A4D3E] text-white text-[12px] font-semibold cursor-pointer"
            >
              Remind me in 1–2 weeks (Home Repeat)
            </button>
            <button
              type="button"
              onClick={() => {
                const d = new Date();
                d.setDate(d.getDate() + 84);
                addRetestReminder({
                  reminderId: `rem_${Date.now()}`,
                  labelNeutral: 'Your check-in is ready',
                  dueDate: d.toISOString().slice(0, 10),
                  reasonType: 'routine_3m',
                  createdAt: new Date().toISOString(),
                });
                setReminderSavedMsg('Neutral reminder scheduled in 12 weeks ("Your check-in is ready").');
              }}
              className="px-4 py-2.5 rounded-2xl bg-[#ECEEEB] text-[#151813] text-[12px] font-semibold cursor-pointer"
            >
              Remind me in ~3 months (84 days)
            </button>
          </div>
        </div>
      )}

      {/* Past Pre-Screen Runs List */}
      {state.semenRuns.length > 0 && (
        <div className="rounded-3xl bg-white border border-[#E2E6E0] p-5 space-y-3">
          <h3 className="text-[14px] font-bold text-[#151813]">
            Saved Pre-Screen Runs ({state.semenRuns.length})
          </h3>
          <div className="space-y-2">
            {state.semenRuns.map((run) => (
              <div
                key={run.runId}
                onClick={() => {
                  setLatestRun(run);
                  setGuideStep(9);
                }}
                className="rounded-2xl bg-[#F6F7F5] p-3 flex items-center justify-between gap-3 cursor-pointer hover:border hover:border-[#1A4D3E]"
              >
                <div>
                  <p className="text-[13px] font-bold text-[#151813]">
                    {run.isDemo ? '[DEMO] ' : ''}Conc: {run.bandConc} · Motility: {run.bandMotility} ·{' '}
                    {run.overallColour.toUpperCase()}
                  </p>
                  <p className="text-[11px] text-[#646A63]">
                    {run.createdAt.slice(0, 16).replace('T', ' ')} · {run.setupType}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteSemenRun(run.runId);
                  }}
                  aria-label="Delete semen run"
                  className="p-1.5 rounded-xl text-[#B42318] hover:bg-[#FEF3F2] cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
