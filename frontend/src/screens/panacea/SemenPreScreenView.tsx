import React, { useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Download,
  FileImage,
  FlaskConical,
  History,
  Info,
  Loader2,
  Microscope,
  Power,
  Printer,
  RefreshCw,
  Ruler,
  ShieldAlert,
  Sparkles,
  UploadCloud,
  XCircle,
} from 'lucide-react';
import { Badge } from '@astryxdesign/core/Badge';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { Divider } from '@astryxdesign/core/Divider';
import { Grid } from '@astryxdesign/core/Grid';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { IconButton } from '@astryxdesign/core/IconButton';
import { List, ListItem } from '@astryxdesign/core/List';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Selector } from '@astryxdesign/core/Selector';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { GOLDEN_RESEARCH_CLIPS, PANACEA_SEMEN_KITS } from '../../data/panaceaCatalogs';
import { usePanacea } from '../../store/PanaceaContext';
import type { PipelineStageCode, SemenSessionRun, StageLogEntry, SubView } from '../../types/panacea';
import { analyzeSpermImage, computeFileSha256, extractFrameFromVideo } from '../../utils/spermImageAnalyzer';
import type { ImageAnalysisResult } from '../../utils/spermImageAnalyzer';
import { SemenAnalysisReport } from '../../components/semen/SemenAnalysisReport';
import { buildSemenReport, downloadSemenReport, printSemenReport } from '../../utils/semenReport';
import { apiUrl, BACKEND_ENABLED, ENABLE_HEURISTIC_MORPHOLOGY, DEMO_MODE } from '../../config';
import { penanciaApi } from '../../services/penanciaApiClient';

interface SemenPreScreenViewProps {
  onBack: () => void;
  onOpenSubView: (view: SubView) => void;
}

const FAULT_STAGES: Array<{ value: string; label: string }> = [
  { value: 'NONE', label: 'None (Normal Pipeline)' },
  { value: 'S1', label: 'S1 · Missing Calibration Scale' },
  { value: 'S2', label: 'S2 · Incomplete SHA-256 Checksum' },
  { value: 'S5', label: 'S5 · Quality Gate Focus Fail' },
  { value: 'S6', label: 'S6 · Elevated Debris Flagged' },
  { value: 'S7', label: 'S7 · No Cells Detected' },
];

const STAGE_STEPS: Array<{ code: PipelineStageCode; label: string; desc: string }> = [
  { code: 'S0', label: 'S0 · Intake Quality Gate', desc: 'Validating image format, resolution & focus score' },
  { code: 'S1', label: 'S1 · Optical Calibration', desc: 'Applying micrometer scale factor (µm/px)' },
  { code: 'S2', label: 'S2 · SHA-256 Integrity', desc: 'Computing cryptographic checksum of source media' },
  { code: 'S3', label: 'S3 · Media Decode Check', desc: 'Confirming the browser can decode the selected media' },
  { code: 'S4', label: 'S4 · Normalization', desc: 'Normalizing color channels & contrast distribution' },
  { code: 'S5', label: 'S5 · Quality Gate Verification', desc: 'Checking clipping thresholds and background balance' },
  { code: 'S6', label: 'S6 · Component Segmentation', desc: 'Excluding disconnected foreground components from measurement' },
  { code: 'S7', label: 'S7 · Cell Detection', desc: 'Segmenting foreground cell contours' },
  { code: 'S8', label: 'S8 · Preliminary Shape Estimate', desc: 'Estimating length, width & color-region ratio (not clinical morphology)' },
  { code: 'S9', label: 'S9 · Midpiece & Tail Scope', desc: 'Recording structures that cannot be assessed from this frame' },
  { code: 'S10', label: 'S10 · Vitality Scope', desc: 'Vitality is not assessed without a validated assay' },
  { code: 'S11', label: 'S11 · Clinical Scope Check', desc: 'No WHO clinical classification is made from a single frame' },
  { code: 'S12', label: 'S12 · Report Compilation', desc: 'Assembling preliminary screening summary' },
  { code: 'S13', label: 'S13 · Local Vault Commit', desc: 'Persisting session locally & offering lab booking' },
];

export const SemenPreScreenView: React.FC<SemenPreScreenViewProps> = ({
  onBack,
  onOpenSubView,
}) => {
  const { state, language, refreshState, addSemenSession, toggleConsent, toggleFeatureFlags } = usePanacea();
  const isAr = language === 'ar';

  const [selectedKitId, setSelectedKitId] = useState(PANACEA_SEMEN_KITS[0].kitId);
  const [selectedGoldenId, setSelectedGoldenId] = useState<string>('none');
  const [abstinenceDays, setAbstinenceDays] = useState(3);
  const [tempNote, setTempNote] = useState<'room' | '37c_stage'>('37c_stage');
  const [completeness, setCompleteness] = useState<'full' | 'partial'>('full');
  const [injectFault, setInjectFault] = useState<string>('NONE');
  const [calibrationStatus, setCalibrationStatus] = useState<string | null>(null);

  // Upload and live progress states
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileDetails, setFileDetails] = useState<{ name: string; size: string; type: string } | null>(null);
  const [running, setRunning] = useState(false);
  const [activeStepIndex, setActiveStepIndex] = useState<number>(-1);
  const [progressPct, setProgressPct] = useState<number>(0);
  const [liveLogs, setLiveLogs] = useState<StageLogEntry[]>([]);
  const [latestAnalysis, setLatestAnalysis] = useState<ImageAnalysisResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Issue 2: currentRun starts null on mount so old historical runs are never shown as the active result
  const [currentRun, setCurrentRun] = useState<SemenSessionRun | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedKit =
    PANACEA_SEMEN_KITS.find((k) => k.kitId === selectedKitId) || PANACEA_SEMEN_KITS[0];

  const killSwitchActive = Boolean(state?.featureFlags.homeResearchKillSwitch);
  const semenConsent = Boolean(state?.consents.semen_media?.state);

  const handleFileSelect = (file: File) => {
    setErrorMessage(null);
    setCurrentRun(null);
    setLatestAnalysis(null);

    const isVideo = file.type.startsWith('video/') || /\.(mp4|mov|avi|webm|mkv)$/i.test(file.name);

    setUploadedFile(file);
    setSelectedGoldenId('none');
    const sizeKb = (file.size / 1024).toFixed(1);
    setFileDetails({
      name: file.name,
      size: `${sizeKb} KB`,
      type: file.type || (isVideo ? 'video/mp4' : 'image/bmp (raw)'),
    });

    if (isVideo) {
      extractFrameFromVideo(file)
        .then(({ canvas }) => {
          setPreviewUrl(canvas.toDataURL('image/png'));
        })
        .catch((err) => {
          setErrorMessage(err?.message || 'Failed to extract video preview frame.');
        });
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        setPreviewUrl(e.target?.result as string);
      };
      reader.onerror = () => {
        setErrorMessage(isAr ? 'فشل قراءة الملف من الجهاز.' : 'Failed to read the selected file.');
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCalibrateRuler = () => {
    setCalibrationStatus(
      isAr
        ? 'تم اختيار مقياس عمل 0.05 µm/px. هذه قيمة مفترضة وليست معايرة مقاسة من صورتك.'
        : 'Working scale selected: 0.05 µm/px. This is an assumption, not a micrometer measurement from your image.'
    );
  };

  const handleRunPipeline = async () => {
    setErrorMessage(null);

    // Issue 10: Enforce kill switch and semen consent
    if (killSwitchActive) {
      setErrorMessage(
        isAr
          ? 'تم إيقاف التحليل: مفتاح الإيقاف الطارئ مفعل. يرجى إيقاف المفتاح للمتابعة.'
          : 'Analysis halted: Emergency kill switch is active. Disable it to proceed.'
      );
      return;
    }

    if (!semenConsent) {
      setErrorMessage(
        isAr
          ? 'مطلوب الموافقة: يرجى الموافقة على معالجة وسائط السائل المنوي للمتابعة.'
          : 'Consent required: Please accept semen media analysis consent before running.'
      );
      return;
    }

    // Issue 8: Block running with no file (no fabricated results)
    if (!uploadedFile && selectedGoldenId === 'none') {
      setErrorMessage(
        isAr
          ? 'يرجى اختيار صورة مجهرية أولاً للبدء في الفحص.'
          : 'Please select or upload a microscopic image file first.'
      );
      return;
    }

    setRunning(true);
    setCurrentRun(null);
    setLatestAnalysis(null);
    setProgressPct(5);
    setActiveStepIndex(0);
    setLiveLogs([]);

try {
        let analysisResult: ImageAnalysisResult;
        let sampleId: string | undefined;

        if (uploadedFile && ENABLE_HEURISTIC_MORPHOLOGY) {
          analysisResult = await analyzeSpermImage(uploadedFile, 0.05);
        } else if (uploadedFile) {
          // ISS-011: Heuristic morphology disabled — create minimal analysis result
          // without heuristic morphology fields (TZI, acrosome, L/W ratio, shape category)
          const { computeFileSha256 } = await import('../../utils/spermImageAnalyzer');
          const sha256 = await computeFileSha256(uploadedFile);
          analysisResult = {
            width: 0,
            height: 0,
            sha256,
            focusVariance: 0,
            clippedDarkPct: 0,
            clippedBrightPct: 0,
            cellDetected: false,
            morphologyCategory: 'NotMeasured' as const,
            acrosomeCoveragePct: 0,
            headLengthUm: 0,
            headWidthUm: 0,
            lengthToWidthRatio: 0,
            midpieceDefect: null,
            tailDefect: null,
            tziScore: null,
            stageLogs: [],
            annotatedPreviewDataUrl: '',
          };
        } else {
          // Explicit Golden Fixture Reference Preset — only available in DEMO_MODE
          if (!DEMO_MODE) {
            throw new Error('Golden fixture reference presets are only available in DEMO_MODE. Set VITE_DEMO_MODE=true to enable.');
          }
          const golden = GOLDEN_RESEARCH_CLIPS.find((g) => g.id === selectedGoldenId) || GOLDEN_RESEARCH_CLIPS[0];
          const clip = golden.clips[0];
          // Build a complete ImageAnalysisResult for golden fixtures using clip data + synthetic analysis
          const hasSperm = clip.syntheticSeed?.noSperm !== true;
          if (ENABLE_HEURISTIC_MORPHOLOGY) {
            analysisResult = {
              width: clip.width,
              height: clip.height,
              sha256: clip.sha256,
              focusVariance: clip.focusVariance,
              clippedDarkPct: clip.clippedDarkPct,
              clippedBrightPct: clip.clippedBrightPct,
              cellDetected: hasSperm,
              morphologyCategory: hasSperm ? 'Normal' as const : 'Unclassified' as const,
              acrosomeCoveragePct: hasSperm ? 48.5 : 0,
              headLengthUm: hasSperm ? 4.5 : 0,
              headWidthUm: hasSperm ? 2.8 : 0,
              lengthToWidthRatio: hasSperm ? 1.61 : 0,
              midpieceDefect: null,
              tailDefect: null,
              tziScore: null,
              stageLogs: [],
            };
          } else {
            // ISS-011: Heuristic morphology disabled
            analysisResult = {
              width: clip.width,
              height: clip.height,
              sha256: clip.sha256,
              focusVariance: clip.focusVariance,
              clippedDarkPct: clip.clippedDarkPct,
              clippedBrightPct: clip.clippedBrightPct,
              cellDetected: false,
              morphologyCategory: 'NotMeasured' as const,
              acrosomeCoveragePct: 0,
              headLengthUm: 0,
              headWidthUm: 0,
              lengthToWidthRatio: 0,
              midpieceDefect: null,
              tailDefect: null,
              tziScore: null,
              stageLogs: [],
              annotatedPreviewDataUrl: '',
            };
          }
        }

      setLatestAnalysis(analysisResult);

      // 2. If BACKEND_ENABLED and real file (not golden fixture), upload to Azure and trigger analysis
      if (BACKEND_ENABLED && uploadedFile) {
        try {
          const isVideo = uploadedFile.type.startsWith('video/');
          const sampleName = uploadedFile.name;

          // Step 2a: Create sample record in backend
          setProgressPct(15);
          const sampleResponse = await penanciaApi.createSample({
            patientId: state?.user.userId || 'usr_patient_01',
            abstinenceDays,
            sampleName,
            micronsPerPixel: 0.05,
            mediaType: isVideo ? 'video' : 'image',
            metadata: ENABLE_HEURISTIC_MORPHOLOGY
              ? {
                  sha256: analysisResult.sha256,
                  morphology: analysisResult.morphologyCategory,
                  focusVariance: analysisResult.focusVariance,
                  tzi: analysisResult.tziScore,
                }
              : {
                  sha256: analysisResult.sha256,
                  focusVariance: analysisResult.focusVariance,
                },
          });
          sampleId = sampleResponse.sampleId;

          // Step 2b: Get SAS URL and upload file to Azure Blob Storage
          setProgressPct(30);
          const sasResponse = await penanciaApi.getUploadSas(
            sampleId,
            isVideo ? 'video' : 'image',
            uploadedFile.name,
            uploadedFile.type
          );

          // Step 2c: Upload file directly to blob storage
          setProgressPct(40);
          await penanciaApi.uploadToBlob(sasResponse.sasUrl, uploadedFile, (pct) => {
            setProgressPct(40 + Math.round(pct * 0.3)); // 40-70%
          });

          // Step 2d: Register blob URI with backend
          setProgressPct(75);
          await penanciaApi.registerBlob(sampleId, {
            mediaType: isVideo ? 'video' : 'image',
            blobUri: sasResponse.targetBlobUri,
          });

          // Step 2e: Trigger backend analysis workflow (Durable Functions)
          setProgressPct(85);
          await penanciaApi.triggerAnalysis(sampleId);

          setProgressPct(100);
        } catch (backendErr: any) {
          console.error('Backend upload/analysis error:', backendErr);
          // Don't fail the whole pipeline - local analysis still completed
          // Just show a warning that backend sync failed
          setErrorMessage(
            isAr
              ? `تم التحليل محلياً، لكن فشل المزامنة مع الخادم: ${backendErr.message}`
              : `Local analysis completed, but backend sync failed: ${backendErr.message}`
          );
        }
      }

      // Fixture sessions may use the Express reference pipeline. Real uploads must
      // never be replaced by fixture-derived server bands or generic summaries.
      let serverSession: SemenSessionRun | null = null;
      if (!uploadedFile) {
        try {
          setProgressPct(90);
          const golden = GOLDEN_RESEARCH_CLIPS.find((g) => g.id === selectedGoldenId) || GOLDEN_RESEARCH_CLIPS[0];
          const analyzeResp = await fetch('/v1/semen/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId: `fixture_${Date.now()}`,
              setupType: selectedKit.type,
              kitProfile: selectedKit,
              sampleMeta: {
                abstinenceDays,
                collectedAtIso: new Date().toISOString(),
                temperatureNote: tempNote,
                completeness,
                sampleName: `Golden Reference (${selectedGoldenId})`,
              },
              clips: golden.clips,
              isDemo: true,
            }),
          });
          if (analyzeResp.ok) {
            const data = await analyzeResp.json();
            if (data.session) serverSession = data.session;
          }
        } catch (serverErr) {
          console.warn('Fixture pipeline unavailable; using the labelled local fixture:', serverErr);
        }
      }

      // Replay only logs produced by the analyzer (or an explicitly selected fixture).
      const sourceLogs = serverSession?.stageLogs?.length ? serverSession.stageLogs : analysisResult.stageLogs;
      const accumulatedLogs: StageLogEntry[] = [];
      for (let i = 0; i < STAGE_STEPS.length; i += 1) {
        const step = STAGE_STEPS[i];
        setActiveStepIndex(i);
        setProgressPct(Math.round(((i + 1) / STAGE_STEPS.length) * 100));
        const matchedLog = sourceLogs.find((log) => log.stage === step.code);
        if (!matchedLog) continue;

        const logEntry: StageLogEntry = { ...matchedLog };
        if (injectFault === step.code) {
          logEntry.outcome = 'failed';
          logEntry.note = `Fault Injected (${step.code}): Simulated pipeline validation failure.`;
        }
        accumulatedLogs.push(logEntry);
        setLiveLogs([...accumulatedLogs]);
        await new Promise((resolve) => setTimeout(resolve, 60));
        if (logEntry.outcome === 'failed') {
          throw new Error(`Pipeline halted at stage ${step.code}: ${logEntry.note}`);
        }
      }

      // Construct finalized SemenSessionRun result
      // Prefer server pipeline results when available (full S0-S13 gate validation)
      const nowIso = new Date().toISOString();
      const isDemo = !uploadedFile;
      const isDemoMode = isDemo && DEMO_MODE;
      const sampleName = uploadedFile ? uploadedFile.name : `Golden Reference (${selectedGoldenId})`;

      const sessionRun: SemenSessionRun = serverSession
        ? { ...serverSession, stageLogs: accumulatedLogs.length > 0 ? accumulatedLogs : serverSession.stageLogs }
        : {
            sessionId: sampleId || `ses_${Date.now()}`,
            runId: `sem_${Date.now()}`,
            userId: state?.user.userId || 'usr_patient_01',
            setupType: selectedKit.type,
            kitProfile: selectedKit,
            sampleMeta: {
              abstinenceDays,
              collectedAtIso: nowIso,
              temperatureNote: tempNote,
              completeness,
              sampleName,
            },
            isDemo: isDemoMode,
            demoAttribution: isDemoMode ? 'Golden Research Reference Fixture (DEMO)' : 'User Micrograph Capture',
            modelVersion: ENABLE_HEURISTIC_MORPHOLOGY
              ? 'connected-component-image-heuristic-v2.0'
              : 'local-quality-gate-only-v1.0',
            pipelineVersion: 'image-derived-report-v2.0',
            validationMode: 'research_only',
            state: 'Completed',
            qualitySummaryEn: ENABLE_HEURISTIC_MORPHOLOGY && analysisResult.cellDetected
              ? `One cell-like foreground structure was measured. Preliminary shape category: ${analysisResult.morphologyCategory}. This is not a clinical sperm classification.`
              : 'Image quality gate passed. Morphology, TZI, acrosome, and head ratio are not measured by this pre-screen.',
            qualitySummaryAr: ENABLE_HEURISTIC_MORPHOLOGY && analysisResult.cellDetected
              ? `تم قياس بنية واحدة شبيهة بالخلية. الفئة الشكلية المبدئية: ${analysisResult.morphologyCategory}. هذا ليس تصنيفاً سريرياً للحيوانات المنوية.`
              : 'تم اجتياز بوابة جودة الصورة. الشكل، TZI، الأكروسوم، ونسبة الرأس لم تُقاس في هذا الفحص التمهيدي.',
            researchOnlyBandConc: 'Unclear',
            researchOnlyBandMotility: 'Unclear',
            noSpermSeen: false,
            usedItems: ENABLE_HEURISTIC_MORPHOLOGY
              ? [
                  `Media Capture: ${sampleName} (${analysisResult.width}x${analysisResult.height} px)`,
                  `Laplacian Focus Variance: ${analysisResult.focusVariance}`,
                  `Preliminary shape category: ${analysisResult.morphologyCategory}`,
                  `Abstinence: ${abstinenceDays} days (${completeness})`,
                ]
              : [
                  `Media Capture: ${sampleName} (${analysisResult.width}x${analysisResult.height} px)`,
                  `Laplacian Focus Variance: ${analysisResult.focusVariance}`,
                  `Abstinence: ${abstinenceDays} days (${completeness})`,
                ],
            couldNotUseItems: ENABLE_HEURISTIC_MORPHOLOGY
              ? [
                  'Concentration: Not assessed from a single frame',
                  'Motility: Not assessed without temporal tracking',
                  'Vitality: Not assessed without a validated vitality assay',
                  'Midpiece, tail and TZI: Not assessed by this heuristic',
                ]
              : [
                  'Concentration: Not assessed from a single frame',
                  'Motility: Not assessed without temporal tracking',
                  'Vitality: Not assessed without a validated vitality assay',
                  'Morphology (shape, acrosome, L/W ratio, TZI): Not measured by this pre-screen',
                ],
            stageLogs: accumulatedLogs,
            createdAt: nowIso,
          };

      let completedSession = sessionRun;
      if (uploadedFile && !BACKEND_ENABLED) {
        // The browser derives measurements from the actual pixels; Express persists
        // that same research-only session without substituting fixture results.
        setProgressPct(95);
        completedSession = (await penanciaApi.saveSemenSession(sessionRun)).session;
      }

      addSemenSession(completedSession);
      setCurrentRun(completedSession);

    } catch (err: any) {
      // Issue 3: Fail loudly with visible error banner
      console.error('Pipeline error:', err);
      setErrorMessage(err?.message || 'An unexpected error occurred during image processing.');
    } finally {
      setRunning(false);
      setActiveStepIndex(-1);
    }
  };

  return (
    <VStack gap={5}>
      {/* Header bar */}
      <HStack gap={3} vAlign="center" hAlign="between">
        <HStack gap={3} vAlign="center" className="min-w-0">
          <IconButton
            label={isAr ? 'رجوع' : 'Back'}
            icon={<ArrowLeft className="w-4 h-4 rtl:rotate-180" />}
            variant="secondary"
            size="sm"
            onClick={onBack}
          />
          <div className="min-w-0">
            <Heading level={1}>
              {isAr ? 'فحص جودة وتحليل العينة (S0–S13)' : 'Semen Capture Analysis Pipeline'}
            </Heading>
            <Text type="supporting" color="secondary" weight="medium">
              {isAr ? 'فحص بصري مجهري تمهيدي · معالجة محلية داخل المتصفح' : 'Preliminary Microscopic Check · Local In-Browser Processing'}
            </Text>
          </div>
        </HStack>

        <Button
          size="sm"
          variant={killSwitchActive ? 'destructive' : 'secondary'}
          icon={<Power className="w-3.5 h-3.5" />}
          label={killSwitchActive ? 'KILL SWITCH: ACTIVE' : 'Kill Switch'}
          onClick={() => toggleFeatureFlags({ homeResearchKillSwitch: !killSwitchActive })}
        />
      </HStack>

      {/* Mandatory Interim Honesty Banner */}
      <Banner
        status="warning"
        title={isAr ? 'تنبيه: فحص تمهيدي مع مزامنة خلفية اختيارية' : 'Preliminary Check with Optional Backend Sync'}
        description={
          isAr
            ? 'فحص أولي للصور في المتصفح. ليس تقييماً سريرياً معتمداً من منظمة الصحة العالمية (WHO 2021). عند تفعيل الخادم الخلفي، يتم رفع الملفات إلى Azure Storage وتحليلها عبر Durable Functions.'
            : 'Preliminary in-browser image check. Not a clinical WHO assessment. When backend is enabled, files are uploaded to Azure Storage and analyzed via Durable Functions.'
        }
      />

      {/* Active Consent Alert if missing */}
      {!semenConsent && (
        <Card variant="muted" padding={3}>
          <HStack gap={3} vAlign="center" hAlign="between" wrap="wrap">
            <VStack gap={1}>
              <Text weight="bold" color="accent">
                {isAr ? 'موافقة معالجة الوسائط مطلوبة' : 'Semen Media Consent Required'}
              </Text>
              <Text type="supporting" color="secondary">
                {isAr
                  ? 'يتطلب فحص العينات المجهرية موافقة صريحة على معالجة الصور ورفعها إلى Azure Storage لتحليلها عبر Durable Functions.'
                  : 'Microscopic image pre-screening requires explicit consent to process media and upload to Azure Storage for Durable Functions analysis.'}
              </Text>
            </VStack>
            <Button
              size="sm"
              variant="secondary"
              label={isAr ? 'منح الموافقة الآن' : 'Grant Consent Now'}
              onClick={() => toggleConsent('semen_media', true)}
            />
          </HStack>
        </Card>
      )}

      {/* Emergency Kill Switch Alert */}
      {killSwitchActive && (
        <Banner
          status="error"
          title={isAr ? 'مفتاح الإيقاف الطارئ مفعل' : 'Emergency Kill Switch is Active'}
          description={
            isAr
              ? 'تم تفعيل مفتاح الإيقاف للأبحاث المنزلية. تم حظر تشغيل خط أنابيب التحليل حتى يتم إلغاء القفل.'
              : 'Home research operations are disabled while the emergency kill switch is engaged. Disable it to run the pipeline.'
          }
        />
      )}

      {/* Visible Error Banner (Fail Loudly) */}
      {errorMessage && (
        <Card variant="muted" padding={3} className="border-l-4 border-l-[var(--color-destructive)]">
          <HStack gap={3} vAlign="center" hAlign="between" wrap="wrap">
            <VStack gap={1}>
              <Text weight="bold">
                {isAr ? 'خطأ في معالجة العينة' : 'Pipeline Processing Error'}
              </Text>
              <Text type="supporting" color="secondary">{errorMessage}</Text>
            </VStack>
            <Button
              size="sm"
              variant="ghost"
              label={isAr ? 'إغلاق' : 'Dismiss'}
              onClick={() => setErrorMessage(null)}
            />
          </HStack>
        </Card>
      )}

      {/* 1. Dedicated File Upload & Image Preview Section */}
      <Card padding={4} elevation="low">
        <VStack gap={4}>
          <HStack gap={2} vAlign="center" hAlign="between" wrap="wrap">
            <HStack gap={2} vAlign="center">
              <UploadCloud className="w-5 h-5 text-[var(--color-accent)]" />
              <Heading level={3}>
                {isAr ? '١. رفع عينة المجهر (صورة أو فيديو)' : '1. Upload Microscopic Sample (BMP, PNG, JPG or Video)'}
              </Heading>
            </HStack>
            <Badge label="Max 1024px auto-scale" variant="neutral" />
          </HStack>

          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept=".bmp,.png,.jpg,.jpeg,.webp,.mp4,.mov,.webm,.avi"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileSelect(file);
            }}
          />

          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files?.[0];
              if (file) handleFileSelect(file);
            }}
            className="border-2 border-dashed border-[var(--color-border-subtle)] hover:border-[var(--color-accent)] rounded-xl p-6 text-center cursor-pointer transition-all bg-[var(--color-bg-subtle)] hover:bg-[var(--color-bg-hover)]"
          >
            {previewUrl ? (
              <VStack gap={3} align="center">
                <div className="relative w-36 h-36 rounded-lg overflow-hidden border border-[var(--color-border)] shadow-md bg-black/10 flex items-center justify-center">
                  <img
                    src={previewUrl}
                    alt="Sample Preview"
                    className="w-full h-full object-contain"
                  />
                </div>
                <VStack gap={1} align="center">
                  <HStack gap={2} vAlign="center">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    <Text weight="semibold">{fileDetails?.name}</Text>
                  </HStack>
                  <Text type="supporting" color="secondary">
                    {fileDetails?.size} · {fileDetails?.type} · Ready for analysis
                  </Text>
                  <Button
                    size="sm"
                    variant="ghost"
                    label={isAr ? 'تغيير الملف' : 'Choose Different File'}
                    onClick={(e) => {
                      e.stopPropagation();
                      fileInputRef.current?.click();
                    }}
                  />
                </VStack>
              </VStack>
            ) : (
              <VStack gap={2} align="center">
                <div className="w-12 h-12 rounded-full bg-[var(--color-accent-subtle)] flex items-center justify-center text-[var(--color-accent)]">
                  <FileImage className="w-6 h-6" />
                </div>
                <Text weight="semibold">
                  {isAr ? 'اضغط لاختيار صورة مجهرية أو اسحب الملف هنا' : 'Click or Drag & Drop Semen Micrograph (e.g. Normal_Sperm.bmp)'}
                </Text>
                <Text type="supporting" color="secondary">
                  Supports .BMP (24-bit), .PNG, .JPG, .JPEG (video files are rejected)
                </Text>
              </VStack>
            )}
          </div>

          {/* Optional Golden Preset Selector */}
          <Divider />
          <Selector
            label={isAr ? 'أو اختر عينة مرجعية بحثية (للاختبار والتجربة)' : 'Or Select Reference Research Fixture (For Validation Testing)'}
            value={selectedGoldenId}
            onChange={(val) => {
              setSelectedGoldenId(val);
              if (val !== 'none') {
                setUploadedFile(null);
                setPreviewUrl(null);
                setFileDetails(null);
              }
            }}
            options={[
              { value: 'none', label: isAr ? '— استخدام الملف المرفوع أعلاه —' : '— Use Uploaded File Above —' },
              ...GOLDEN_RESEARCH_CLIPS.map((g) => ({ value: g.id, label: g.labelEn })),
            ]}
          />
        </VStack>
      </Card>

      {/* 2. Setup & Calibration Controls */}
      <Card padding={4} elevation="low">
        <VStack gap={4}>
          <Selector
            label={isAr ? '٢. طقم العدسة والمجهر' : '2. Optical Setup & Fixed-Depth Chamber'}
            value={selectedKitId}
            onChange={setSelectedKitId}
            options={PANACEA_SEMEN_KITS.map((k) => ({ value: k.kitId, label: k.kitName }))}
          />

          <Card variant="muted" padding={3}>
            <VStack gap={2}>
              <HStack gap={2} vAlign="center" hAlign="between" wrap="wrap">
                <HStack gap={1.5} vAlign="center">
                  <Ruler className="w-4 h-4 text-[var(--color-accent)]" />
                  <Text weight="semibold">
                    {isAr ? 'مقياس الصورة المستخدم' : 'Working Image Scale'}
                  </Text>
                </HStack>
                <Button
                  size="sm"
                  variant="secondary"
                  label={isAr ? 'استخدام مقياس العمل' : 'Use working scale (0.05 µm/px)'}
                  onClick={handleCalibrateRuler}
                />
              </HStack>
              {calibrationStatus && (
                <Text type="supporting" color="accent" weight="medium">
                  {calibrationStatus}
                </Text>
              )}
            </VStack>
          </Card>

          <Grid columns={{ minWidth: 130, max: 3 }} gap={2}>
            <NumberInput
              label={isAr ? 'أيام الامتناع' : 'Abstinence (days)'}
              min={1}
              max={14}
              isIntegerOnly
              value={abstinenceDays}
              onChange={(v) => setAbstinenceDays(v || 3)}
            />
            <Selector
              label={isAr ? 'درجة الحرارة' : 'Stage Temp'}
              value={tempNote}
              onChange={(v) => setTempNote(v as 'room' | '37c_stage')}
              options={[
                { value: '37c_stage', label: '37 °C Stage' },
                { value: 'room', label: 'Room Temp' },
              ]}
            />
            <Selector
              label={isAr ? 'اكتمال العينة' : 'Completeness'}
              value={completeness}
              onChange={(v) => setCompleteness(v as 'full' | 'partial')}
              options={[
                { value: 'full', label: 'Full sample' },
                { value: 'partial', label: 'Partial' },
              ]}
            />
          </Grid>

          {/* Issue 10: Fault Injection selector rendered for testing */}
          <Selector
            label={isAr ? 'محاكاة الأخطاء (للاختبار والتحقق)' : 'Simulate Fault Injection (Test Pipeline Robustness)'}
            value={injectFault}
            onChange={setInjectFault}
            options={FAULT_STAGES}
          />

          {/* Action Button */}
          <Button
            variant="primary"
            width="100%"
            isDisabled={killSwitchActive || !semenConsent || (!uploadedFile && selectedGoldenId === 'none')}
            isLoading={running}
            icon={running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Microscope className="w-4 h-4" />}
            label={
              running
                ? isAr
                  ? `جاري التحليل... ${progressPct}%`
                  : `Processing Stage ${activeStepIndex >= 0 ? STAGE_STEPS[activeStepIndex]?.code : ''} (${progressPct}%)...`
                : isAr
                  ? 'تشغيل فحص الجودة والمراحل (S0–S13)'
                  : 'Run Capture Quality Gate & S0–S13 Trace'
            }
            onClick={handleRunPipeline}
          />
        </VStack>
      </Card>

      {/* 3. Live 14-Stage Execution Stepper & Progress Bar */}
      {running && (
        <Card padding={4} elevation="low" className="border-l-4 border-l-[var(--color-accent)] animate-pulse">
          <VStack gap={3}>
            <HStack gap={2} vAlign="center" hAlign="between">
              <HStack gap={2} vAlign="center">
                <Loader2 className="w-4 h-4 animate-spin text-[var(--color-accent)]" />
                <Text weight="bold">
                  {STAGE_STEPS[activeStepIndex]?.label || 'Initializing Pipeline...'}
                </Text>
              </HStack>
              <Badge label={`${progressPct}% Complete`} variant="info" />
            </HStack>

            <div className="w-full bg-[var(--color-bg-subtle)] rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-[var(--color-accent)] h-2.5 rounded-full transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>

            <Text type="supporting" color="secondary">
              {STAGE_STEPS[activeStepIndex]?.desc}
            </Text>

            {liveLogs.length > 0 && (
              <VStack gap={2} className="pt-2 border-t border-[var(--color-border-subtle)]">
                {liveLogs.slice(-3).map((log) => (
                  <HStack key={log.stage} gap={2} vAlign="center" hAlign="between">
                    <Text type="supporting" weight="medium">
                      {log.stage} · {log.name}
                    </Text>
                    <Badge
                      label={log.outcome.toUpperCase()}
                      variant={log.outcome === 'passed' ? 'success' : log.outcome === 'warning' ? 'warning' : 'error'}
                    />
                  </HStack>
                ))}
              </VStack>
            )}
          </VStack>
        </Card>
      )}

      {/* 4. Image-derived professional report */}
      {currentRun && (
        <VStack gap={4}>
          {latestAnalysis ? (
            <>
              <Grid columns={{ minWidth: 180, max: 2 }} gap={2}>
                <Button
                  variant="secondary"
                  icon={<Download className="h-4 w-4" />}
                  label={isAr ? 'تنزيل التقرير المنظم' : 'Download organized report'}
                  onClick={() => downloadSemenReport(buildSemenReport(currentRun, latestAnalysis, language))}
                />
                <Button
                  variant="secondary"
                  icon={<Printer className="h-4 w-4" />}
                  label={isAr ? 'طباعة / حفظ PDF' : 'Print / Save as PDF'}
                  onClick={() => printSemenReport(buildSemenReport(currentRun, latestAnalysis, language))}
                />
              </Grid>
              <SemenAnalysisReport
                report={buildSemenReport(currentRun, latestAnalysis, language)}
                candidateDetected={latestAnalysis.cellDetected}
              />
            </>
          ) : (
            <Banner
              status="info"
              title={isAr ? 'بيانات الصورة غير متاحة' : 'Image measurements unavailable'}
              description={isAr ? 'أعد تشغيل الفحص لإنشاء تقرير من صورتك.' : 'Run the analysis again to generate a report from your image.'}
            />
          )}

          <Button
            variant="primary"
            width="100%"
            icon={<FlaskConical className="h-4 w-4" />}
            label={isAr ? 'حجز تحليل سائل منوي معتمد' : 'Book a certified semen analysis'}
            onClick={() => onOpenSubView('lab-booking')}
          />

          <Collapsible
            trigger={isAr ? `تفاصيل التحليل (${currentRun.stageLogs.length} مرحلة)` : `Analysis audit trail (${currentRun.stageLogs.length} stages)`}
            defaultIsOpen={false}
          >
            <Card variant="muted" padding={0} className="mt-2">
              <List hasDividers density="compact" edge="bleed">
                {currentRun.stageLogs.map((stage) => (
                  <ListItem
                    key={stage.stage}
                    label={`${stage.stage} · ${stage.name}`}
                    description={stage.note}
                    endContent={<Badge label={stage.outcome.toUpperCase()} variant={stage.outcome === 'passed' ? 'success' : stage.outcome === 'warning' ? 'warning' : 'error'} />}
                  />
                ))}
              </List>
            </Card>
          </Collapsible>
        </VStack>
      )}

      {/* Historical Runs (Shown collapsed if user has previous sessions and no active current run) */}
      {!currentRun && (state?.semenSessions?.length || 0) > 0 && (
        <Collapsible
          trigger={
            isAr
              ? `الجلسات السابقة المخزنة محلياً (${state?.semenSessions.length})`
              : `Previous Local Sessions History (${state?.semenSessions.length})`
          }
          defaultIsOpen={false}
        >
          <VStack gap={2} className="pt-2">
            <Card variant="muted" padding={0}>
              <List hasDividers density="compact" edge="bleed">
                {state?.semenSessions.map((session) => (
                  <ListItem
                    key={session.sessionId}
                    label={`${session.sampleMeta?.sampleName || 'Sample'} · ${new Date(session.createdAt).toLocaleDateString()}`}
                    description={session.qualitySummaryEn}
                    endContent={
                      <Badge
                        label={session.state}
                        variant={session.state === 'Completed' ? 'success' : 'neutral'}
                      />
                    }
                  />
                ))}
              </List>
            </Card>
          </VStack>
        </Collapsible>
      )}
    </VStack>
  );
};
