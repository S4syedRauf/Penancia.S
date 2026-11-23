import express from 'express';
import dotenv from 'dotenv';
import type { Express } from 'express';

dotenv.config();

// Import config to get DEMO_MODE (evaluated at import time)
import { DEMO_MODE } from '../config.js';
import { SEMEN_GATE_CONFIG } from './pipelineEngine.js';

// Mock store for testing
const mockStore = {
  user: { userId: 'test-user', userLat: 25.2, userLng: 55.3, language: 'en', featureFlags: { homeResearchKillSwitch: false } },
  consents: { semen_media: { state: true } },
  featureFlags: { homeResearchKillSwitch: false },
  semenSessions: [],
  reports: [],
  orders: [],
  partnerApplications: [],
  followUpTasks: [],
  auditEvents: [],
  outboxMessages: [],
  idempotencyKeys: {},
  testBasket: [],
  questionnaireResponses: [],
  screeningRuns: [],
  planCompletions: {},
  symptoms: [],
  checkIns: [],
  wearables: [],
  incompleteSemenSession: null,
  activeKitProfile: { kitId: 'basic', kitName: 'Basic', type: 'clip_on', chamberDepthUm: 20, calibratedUmPerPx: 0.05, magnification: '100x', fieldWidthUmDefault: 420 },
  semenSetupType: 'clip_on',
};

const loadStore = () => mockStore;
const saveStore = () => {};
const appendAuditAndOutbox = () => {};

// Create test app
export function createTestApp(): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '15mb' }));

  // Mock authentication - skip for tests
  app.use((_req, _res, next) => next());

  // Home Semen Pre-Screen (Research Mode, Calibration & S0-S13) — DEMO_MODE only
  if (DEMO_MODE) {
    app.get('/v1/config/semen-gate', (_req, res) => {
      res.json({ ...SEMEN_GATE_CONFIG, demo: true });
    });

    app.post('/v1/semen/calibration', (req, res) => {
      const store = loadStore();
      const { detectedLinesCount = 10, spacingVariancePct = 1.4, fieldWidthUm = 420 } = req.body || {};
      if (detectedLinesCount < 8 || spacingVariancePct > 3.0) {
        appendAuditAndOutbox(store, { actorType: 'pipeline', action: 'SEMEN_CALIBRATION_FAILED', target: 'micrometer_ruler' });
        saveStore(store);
        return res.json({ ok: false, messageEn: 'Calibration failed', messageAr: 'فشلت المعايرة', demo: true });
      }
      const umPerPx = Number((fieldWidthUm / 1920).toFixed(4));
      appendAuditAndOutbox(store, { actorType: 'pipeline', action: 'SEMEN_CALIBRATION_PASSED', target: 'micrometer_ruler' });
      saveStore(store);
      res.json({ ok: true, umPerPx, linesDetected: detectedLinesCount, spacingVariancePct, calibratedAt: new Date().toISOString(), demo: true });
    });

    app.post('/v1/semen/sessions', (req, res) => {
      const store = loadStore();
      try {
        const session = req.body;
        appendAuditAndOutbox(store, { actorType: 'pipeline', action: 'SEMEN_IMAGE_SESSION_SAVED', target: session.sessionId });
        saveStore(store);
        res.status(201).json({ session, semenSessions: store.semenSessions, demo: true });
      } catch (err) {
        const code = err instanceof Error ? err.message : 'INVALID_IMAGE_SESSION';
        const status = code === 'CONSENT_REQUIRED' ? 403 : code === 'KILL_SWITCH_ACTIVE' ? 409 : 400;
        res.status(status).json({ code, message_en: 'Error', message_ar: 'خطأ', retry: false, demo: true });
      }
    });
  } else {
    app.get('/v1/config/semen-gate', (_req, res) => {
      res.status(404).json({ code: 'DEMO_MODE_DISABLED', message_en: 'Demo pipeline is disabled in production.', message_ar: 'خط الأنابيب التجريبي معطل في الإنتاج.', retry: false });
    });
    app.post('/v1/semen/calibration', (_req, res) => {
      res.status(404).json({ code: 'DEMO_MODE_DISABLED', message_en: 'Demo calibration is disabled in production. Use the Azure backend.', message_ar: 'المعايرة التجريبية معطلة في الإنتاج. استخدم الواجهة الخلفية في Azure.', retry: false });
    });
    app.post('/v1/semen/sessions', (_req, res) => {
      res.status(404).json({ code: 'DEMO_MODE_DISABLED', message_en: 'Demo session save is disabled in production. Use the Azure backend.', message_ar: 'حفظ الجلسة التجريبية معطل في الإنتاج. استخدم الواجهة الخلفية في Azure.', retry: false });
    });
  }

  if (DEMO_MODE) {
    app.post('/v1/semen/analyze', (req, res) => {
      const store = loadStore();
      try {
        const result = req.body;
        store.semenSessions.unshift(result);
        if (store.semenSessions.length > 20) store.semenSessions.length = 20;
        appendAuditAndOutbox(store, { actorType: 'pipeline', action: `SEMEN_RESEARCH_${result.state.toUpperCase()}`, target: result.sessionId });
        saveStore(store);
        res.json({ session: result, semenSessions: store.semenSessions, demo: true });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'PIPELINE_ERROR';
        appendAuditAndOutbox(store, { actorType: 'pipeline', action: 'SEMEN_PIPELINE_SAFE_FALLBACK', target: msg });
        saveStore(store);
        res.status(500).json({ code: msg, message_en: 'Could not complete', message_ar: 'تعذر الإكمال', retry: true, demo: true });
      }
    });
  } else {
    app.post('/v1/semen/analyze', (_req, res) => {
      res.status(404).json({ code: 'DEMO_MODE_DISABLED', message_en: 'Demo pipeline is disabled in production. Use the Azure backend for analysis.', message_ar: 'خط الأنابيب التجريبي معطل في الإنتاج. استخدم الواجهة الخلفية في Azure للتحليل.', retry: false });
    });
  }

  return app;
}