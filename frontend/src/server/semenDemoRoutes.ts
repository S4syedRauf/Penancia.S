import type { Express } from 'express';
import {
  assertNoPipelineNumericLeakage,
  runSemenPipelineS0ToS13,
  SEMEN_GATE_CONFIG,
} from './pipelineEngine.js';
import type { SemenSessionRun } from '../types/panacea.js';
import { recordImageDerivedSemenSession } from './semenSessionStore.js';
import type { PanaceaStoreData, appendAuditAndOutbox } from './persistenceStore.js';

export interface SemenDemoRoutesDeps {
  demoMode: boolean;
  loadStore: () => PanaceaStoreData;
  saveStore: (data: PanaceaStoreData) => void;
  appendAuditAndOutbox: typeof appendAuditAndOutbox;
}

export function registerSemenDemoRoutes(
  app: Express,
  { demoMode, loadStore, saveStore, appendAuditAndOutbox }: SemenDemoRoutesDeps,
): void {
  if (demoMode) {
    app.get('/v1/config/semen-gate', (_req, res) => {
      res.json({ ...SEMEN_GATE_CONFIG, demo: true });
    });

    app.post('/v1/semen/calibration', (req, res) => {
      const store = loadStore();
      const { detectedLinesCount = 10, spacingVariancePct = 1.4, fieldWidthUm = 420 } = req.body || {};
      if (detectedLinesCount < 8 || spacingVariancePct > 3.0) {
        appendAuditAndOutbox(store, {
          actorType: 'pipeline',
          action: 'SEMEN_CALIBRATION_FAILED',
          target: 'micrometer_ruler',
        });
        saveStore(store);
        return res.json({
          ok: false,
          messageEn: 'Calibration failed: insufficient reference lines or spacing variance too high.',
          messageAr: 'فشلت المعايرة: خطوط مرجعية غير كافية أو تباين كبير في المسافات.',
          demo: true,
        });
      }
      const umPerPx = Number((fieldWidthUm / 1920).toFixed(4));
      appendAuditAndOutbox(store, {
        actorType: 'pipeline',
        action: 'SEMEN_CALIBRATION_PASSED',
        target: 'micrometer_ruler',
      });
      saveStore(store);
      res.json({
        ok: true,
        umPerPx,
        linesDetected: detectedLinesCount,
        spacingVariancePct,
        calibratedAt: new Date().toISOString(),
        demo: true,
      });
    });

    app.post('/v1/semen/sessions', (req, res) => {
      const store = loadStore();
      try {
        const session = recordImageDerivedSemenSession(store, req.body as SemenSessionRun);
        appendAuditAndOutbox(store, {
          actorType: 'pipeline',
          action: 'SEMEN_IMAGE_SESSION_SAVED',
          target: session.sessionId,
        });
        saveStore(store);
        res.status(201).json({ session, semenSessions: store.semenSessions, demo: true });
      } catch (err) {
        const code = err instanceof Error ? err.message : 'INVALID_IMAGE_SESSION';
        const status = code === 'CONSENT_REQUIRED' ? 403 : code === 'KILL_SWITCH_ACTIVE' ? 409 : 400;
        res.status(status).json({
          code,
          message_en:
            code === 'CONSENT_REQUIRED'
              ? 'Semen media consent is required before saving this analysis.'
              : code === 'KILL_SWITCH_ACTIVE'
                ? 'The research kill switch is active. This analysis was not saved.'
                : 'The image-derived research session is invalid and was not saved.',
          message_ar:
            code === 'CONSENT_REQUIRED'
              ? 'يجب تفعيل إذن معالجة الوسائط قبل حفظ هذا التحليل.'
              : code === 'KILL_SWITCH_ACTIVE'
                ? 'مفتاح إيقاف البحث مفعّل. لم يتم حفظ هذا التحليل.'
                : 'جلسة تحليل الصورة غير صالحة ولم يتم حفظها.',
          retry: false,
          demo: true,
        });
      }
    });

    app.post('/v1/semen/analyze', (req, res) => {
      const store = loadStore();
      try {
        const result = runSemenPipelineS0ToS13({
          ...req.body,
          userId: store.user.userId,
          consentSemenMedia: Boolean(store.consents.semen_media?.state),
          killSwitchActive: Boolean(store.featureFlags.homeResearchKillSwitch),
        });
        assertNoPipelineNumericLeakage({
          qualitySummaryEn: result.qualitySummaryEn,
          qualitySummaryAr: result.qualitySummaryAr,
        });
        store.semenSessions.unshift(result);
        if (store.semenSessions.length > 20) store.semenSessions.length = 20;

        appendAuditAndOutbox(store, {
          actorType: 'pipeline',
          action: `SEMEN_RESEARCH_${result.state.toUpperCase()}`,
          target: result.sessionId,
        });
        saveStore(store);
        res.json({ session: result, semenSessions: store.semenSessions, demo: true });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'PIPELINE_ERROR';
        appendAuditAndOutbox(store, {
          actorType: 'pipeline',
          action: 'SEMEN_PIPELINE_SAFE_FALLBACK',
          target: msg,
        });
        saveStore(store);
        res.status(500).json({
          code: msg,
          message_en: 'Could not complete research analysis safely. Fallback applied.',
          message_ar: 'تعذر إكمال التحليل البحثي بأمان. تم تطبيق وضع الأمان البديل.',
          retry: true,
          demo: true,
        });
      }
    });
  } else {
    app.get('/v1/config/semen-gate', (_req, res) => {
      res.status(404).json({
        code: 'DEMO_MODE_DISABLED',
        message_en: 'Demo pipeline is disabled in production.',
        message_ar: 'خط الأنابيب التجريبي معطل في الإنتاج.',
        retry: false,
      });
    });

    app.post('/v1/semen/calibration', (_req, res) => {
      res.status(404).json({
        code: 'DEMO_MODE_DISABLED',
        message_en: 'Demo calibration is disabled in production. Use the Azure backend.',
        message_ar: 'المعايرة التجريبية معطلة في الإنتاج. استخدم الواجهة الخلفية في Azure.',
        retry: false,
      });
    });

    app.post('/v1/semen/sessions', (_req, res) => {
      res.status(404).json({
        code: 'DEMO_MODE_DISABLED',
        message_en: 'Demo session save is disabled in production. Use the Azure backend.',
        message_ar: 'حفظ الجلسة التجريبية معطل في الإنتاج. استخدم الواجهة الخلفية في Azure.',
        retry: false,
      });
    });

    app.post('/v1/semen/analyze', (_req, res) => {
      res.status(404).json({
        code: 'DEMO_MODE_DISABLED',
        message_en: 'Demo pipeline is disabled in production. Use the Azure backend for analysis.',
        message_ar: 'خط الأنابيب التجريبي معطل في الإنتاج. استخدم الواجهة الخلفية في Azure للتحليل.',
        retry: false,
      });
    });
  }
}
