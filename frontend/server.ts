import crypto from 'node:crypto';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { DEMO_MODE } from './src/config.js';
import {
  CONSENT_DEFINITIONS,
  DUBAI_PARTNER_SITES,
  PANACEA_TEST_CATALOG,
} from './src/data/panaceaCatalogs.ts';
import {
  calculatePlanConsistency,
  evaluatePanaceaPathways,
} from './src/engine/panaceaScreening.ts';
import { handlePanaceaAskAgent, PANACEA_FEATURES_CATALOGUE } from './src/server/askRouter.ts';
import {
  acknowledgeFollowUpTask,
  createOrderWithConsentPack,
  createSlotHold,
  evaluatePartnerEligibility,
  resolveFollowUpTaskByHuman,
  submitPartnerApplication,
  transitionOrderState,
} from './src/server/partnerEngine.ts';
import {
  appendAuditAndOutbox,
  getTodayISO,
  hashRequestPayload,
  loadStore,
  resetStore,
  saveStore,
} from './src/server/persistenceStore.ts';
import {
  assertNoPipelineNumericLeakage,
  extractReportOnServer,
  runSemenPipelineS0ToS13,
  SEMEN_GATE_CONFIG,
} from './src/server/pipelineEngine.ts';
import { recordImageDerivedSemenSession } from './src/server/semenSessionStore.ts';
import { requireAuthentication } from './src/server/auth.ts';
import type { ConsentKey, PlanActionStatus, QuestionnaireResponseRow, SemenSessionRun, VaultReport } from './src/types/panacea.ts';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);

async function startServer() {
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
    next();
  });

  // Public operational health only; no patient state or feature configuration.
  app.get('/v1/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'panacea-web',
      versions: {
        questionnaire: 'panacea-v2.0-26q-adaptive',
        screeningRules: 'panacea-rules-v2.0',
        semenPipeline: 'panacea-pipe-v2.0',
        summarySchema: 1,
      },
    });
  });

  // Container Apps Easy Auth overwrites these headers at the trusted ingress.
  // Every frontend and /v1 data route below requires a verified Entra identity.
  app.use(requireAuthentication);
  app.use(express.json({ limit: '15mb' }));

  // Full App State Sync
  app.get('/v1/state', (_req, res) => {
    const store = loadStore();
    res.json(store);
  });

  // Feature flags & Kill Switch toggle (Blueprint Part 9.1 & 17.1)
  app.get('/v1/features', (_req, res) => {
    const store = loadStore();
    res.json({
      features: PANACEA_FEATURES_CATALOGUE,
      flags: store.featureFlags,
    });
  });

  app.put('/v1/features', (req, res) => {
    const store = loadStore();
    const { askLlmMode, homeResearchKillSwitch, homeResearchEnabled } = req.body || {};
    if (askLlmMode === 'Full' || askLlmMode === 'TemplatesOnly' || askLlmMode === 'Off') {
      store.featureFlags.askLlmMode = askLlmMode;
    }
    if (typeof homeResearchKillSwitch === 'boolean') {
      store.featureFlags.homeResearchKillSwitch = homeResearchKillSwitch;
    }
    if (typeof homeResearchEnabled === 'boolean') {
      store.featureFlags.homeResearchEnabled = homeResearchEnabled;
    }
    appendAuditAndOutbox(store, {
      actorType: 'system',
      action: 'FEATURE_FLAGS_UPDATED',
      target: `killSwitch=${store.featureFlags.homeResearchKillSwitch}`,
    });
    saveStore(store);
    res.json({ flags: store.featureFlags });
  });

  // Profile updates (Language EN/AR, Dubai area/coords, Discreet mode, Plan duration, Allergies, Alias)
  app.put('/v1/profile', (req, res) => {
    const store = loadStore();
    const patch = req.body || {};
    const allowedKeys = [
      'alias',
      'language',
      'discreetMode',
      'recoveryEmail',
      'recoveryPhone',
      'dubaiDistrict',
      'userLat',
      'userLng',
      'allergies',
      'planDuration',
      'customPlanDays',
      'extended15Days',
    ] as const;

    for (const key of allowedKeys) {
      if (patch[key] !== undefined) {
        (store.user as unknown as Record<string, unknown>)[key] = patch[key];
      }
    }
    appendAuditAndOutbox(store, {
      actorType: 'user',
      action: 'PROFILE_PREFERENCES_UPDATED',
      target: 'user-profile',
    });
    saveStore(store);
    res.json({ user: store.user });
  });

  // 9 Granular Consents
  app.get('/v1/consents', (_req, res) => {
    const store = loadStore();
    res.json({ consents: store.consents, definitions: CONSENT_DEFINITIONS });
  });

  app.put('/v1/consents', (req, res) => {
    const store = loadStore();
    const { key, state } = req.body as { key?: ConsentKey; state?: boolean };
    if (!key || typeof state !== 'boolean' || !store.consents[key]) {
      return res.status(400).json({
        code: 'INVALID_CONSENT',
        message_en: 'Valid consent key and boolean state are required.',
        message_ar: 'مطلوب مفتاح إذن وحالة صحيحة.',
        retry: false,
      });
    }
    store.consents[key] = {
      ...store.consents[key],
      state,
      changedAt: new Date().toISOString(),
    };
    appendAuditAndOutbox(store, {
      actorType: 'user',
      action: state ? 'CONSENT_GRANTED' : 'CONSENT_WITHDRAWN',
      target: key,
    });
    saveStore(store);
    res.json({ consents: store.consents });
  });

  // Adaptive 26-Q Questionnaire + Append-Only Responses + Deterministic 4-Pathway Screening
  app.put('/v1/questionnaire/answers', (req, res) => {
    const store = loadStore();
    const { answers } = req.body as { answers?: QuestionnaireResponseRow[] };
    if (!Array.isArray(answers)) {
      return res.status(400).json({
        code: 'INVALID_ANSWERS',
        message_en: 'Answers array is required.',
        message_ar: 'قائمة الإجابات مطلوبة.',
        retry: false,
      });
    }
    store.questionnaireResponses = answers;
    const confirmedReports = store.reports.filter((r) => r.state === 'Summarised');
    const newRun = evaluatePanaceaPathways({
      responses: store.questionnaireResponses,
      confirmedReports,
    });
    store.screeningRuns.unshift(newRun);
    if (store.screeningRuns.length > 20) store.screeningRuns.length = 20;

    appendAuditAndOutbox(store, {
      actorType: 'user',
      action: `SCREENING_${newRun.pathway.toUpperCase()}`,
      target: newRun.runId,
    });
    saveStore(store);
    res.json({
      questionnaireResponses: store.questionnaireResponses,
      latestScreening: newRun,
      screeningRuns: store.screeningRuns,
    });
  });

  app.post('/v1/screening/runs', (_req, res) => {
    const store = loadStore();
    const confirmedReports = store.reports.filter((r) => r.state === 'Summarised');
    const newRun = evaluatePanaceaPathways({
      responses: store.questionnaireResponses,
      confirmedReports,
    });
    store.screeningRuns.unshift(newRun);
    appendAuditAndOutbox(store, {
      actorType: 'system',
      action: `SCREENING_RECALCULATED_${newRun.pathway.toUpperCase()}`,
      target: newRun.runId,
    });
    saveStore(store);
    res.json({ latestScreening: newRun, screeningRuns: store.screeningRuns });
  });

  // Test Basket & Recommendation Updates
  app.put('/v1/basket', (req, res) => {
    const store = loadStore();
    const { testId, selected, alreadyDone, attachedReportId } = req.body || {};
    const testDef = PANACEA_TEST_CATALOG.find((t) => t.id === testId);
    if (!testDef) {
      return res.status(404).json({
        code: 'TEST_NOT_FOUND',
        message_en: 'Test definition not found.',
        message_ar: 'الفحص غير موجود.',
        retry: false,
      });
    }
    const existing = store.testBasket.find((b) => b.testId === testId);
    if (existing) {
      if (typeof selected === 'boolean') {
        existing.selected = testDef.bookableInPrototype ? selected : false;
      }
      if (typeof alreadyDone === 'boolean') existing.alreadyDone = alreadyDone;
      if (attachedReportId !== undefined) existing.attachedReportId = attachedReportId;
    }
    appendAuditAndOutbox(store, {
      actorType: 'user',
      action: 'TEST_BASKET_UPDATED',
      target: testDef.code,
    });
    saveStore(store);
    res.json({ testBasket: store.testBasket });
  });

  // Partners, 5.000 km Boundary Quotes, Slot Holds & Idempotent Orders
  app.get('/v1/partners/capabilities', (_req, res) => {
    res.json({ partners: DUBAI_PARTNER_SITES });
  });

  app.post('/v1/quotes', (req, res) => {
    const store = loadStore();
    const {
      userLat = store.user.userLat,
      userLng = store.user.userLng,
      locationDenied = false,
      forceCapacityZero = false,
      forceWindowInvalid = false,
    } = req.body || {};
    const quotes = evaluatePartnerEligibility({
      userLat: Number(userLat),
      userLng: Number(userLng),
      locationDenied: Boolean(locationDenied),
      forceCapacityZero: Boolean(forceCapacityZero),
      forceWindowInvalid: Boolean(forceWindowInvalid),
    });
    res.json({ quotes });
  });

  app.post('/v1/slots/holds', (req, res) => {
    const store = loadStore();
    const { partnerId, mode, slotLabel, userLat, userLng, forceCapacityZero } = req.body || {};
    const held = createSlotHold(store, {
      partnerId: String(partnerId || 'partner-dhc-simulated'),
      mode: mode === 'home_collection' ? 'home_collection' : 'centre_appointment',
      slotLabel: String(slotLabel || 'Tomorrow 08:30 AM (Centre)'),
      userLat: Number(userLat ?? store.user.userLat),
      userLng: Number(userLng ?? store.user.userLng),
      forceCapacityZero: Boolean(forceCapacityZero),
    });
    if (!held.ok) {
      return res.status(409).json({
        code: held.code,
        message_en: held.messageEn,
        message_ar: held.messageAr,
        retry: true,
      });
    }
    saveStore(store);
    res.json({ hold: held.hold });
  });

  app.post('/v1/orders', (req, res) => {
    const store = loadStore();
    const idemKey = String(req.header('Idempotency-Key') || req.body?.idempotencyKey || '');
    const bodyHash = hashRequestPayload(req.body);

    if (idemKey && store.idempotencyKeys[idemKey]) {
      const saved = store.idempotencyKeys[idemKey];
      if (saved.bodyHash !== bodyHash) {
        return res.status(409).json({
          code: 'IDEMPOTENCY_CONFLICT',
          message_en: 'Idempotency-Key reused with a different booking payload.',
          message_ar: 'تم استخدام مفتاح التكرار مع بيانات مختلفة.',
          retry: false,
        });
      }
      return res.status(saved.responseStatus).json({
        ...(saved.responseBody as Record<string, unknown>),
        idempotentReplay: true,
      });
    }

    const {
      partnerId = 'partner-dhc-simulated',
      mode = 'centre_appointment',
      slotLabel = 'Tomorrow 08:30 AM (Centre)',
      selectedFields = ['Opaque Ticket ID', 'Selected Test: Semen Analysis', 'Collection Slot'],
      optionalFieldsIncluded = [],
      consentApproved = false,
      recollectionParentOrderId = null,
    } = req.body || {};

    const result = createOrderWithConsentPack(store, {
      partnerId,
      mode,
      slotLabel,
      selectedFields,
      optionalFieldsIncluded,
      consentApproved: Boolean(consentApproved),
      recollectionParentOrderId,
    });

    if (!result.ok) {
      const errBody = {
        code: result.code,
        message_en: result.messageEn,
        message_ar: result.messageAr,
        retry: false,
      };
      if (idemKey) {
        store.idempotencyKeys[idemKey] = {
          key: idemKey,
          bodyHash,
          responseStatus: result.status,
          responseBody: errBody,
          createdAt: new Date().toISOString(),
        };
        saveStore(store);
      }
      return res.status(result.status).json(errBody);
    }

    const okBody = { order: result.order, outboxCount: store.outboxMessages.length };
    if (idemKey) {
      store.idempotencyKeys[idemKey] = {
        key: idemKey,
        bodyHash,
        responseStatus: 200,
        responseBody: okBody,
        createdAt: new Date().toISOString(),
      };
    }
    saveStore(store);
    res.json(okBody);
  });

  // Restricted Partner Staff Portal Transitions
  app.post('/v1/partner/orders/:id/transition', (req, res) => {
    const store = loadStore();
    const orderId = req.params.id;
    const { nextState, actorRole = 'lab_tech', actorName = 'DHCC Lab Desk', note, rejectionReason, deliverCriticalSample } =
      req.body || {};

    const result = transitionOrderState(store, {
      orderId,
      nextState,
      actorRole,
      actorName,
      note,
      rejectionReason,
      deliverCriticalSample: Boolean(deliverCriticalSample),
    });

    saveStore(store);
    if (!result.ok) {
      return res.status(409).json({
        code: result.outOfOrderIgnored ? 'OUT_OF_ORDER_BLOCKED' : 'TRANSITION_BLOCKED',
        message_en: result.messageEn,
        message_ar: result.messageAr,
        order: result.order,
        retry: false,
      });
    }

    res.json({
      ok: true,
      deduped: result.deduped,
      order: result.order,
      createdReport: result.createdReport,
      createdFollowUp: result.createdFollowUp,
      followUpTasks: store.followUpTasks,
      reports: store.reports,
      message_en: result.messageEn,
      message_ar: result.messageAr,
    });
  });

  // Partner Self-Registration (Restricted Submission Queue Only)
  app.post('/v1/partner/applications', (req, res) => {
    const store = loadStore();
    const { labName, emirate, licenceNumber, contactEmail, servicesOffered } = req.body || {};
    if (!labName || !licenceNumber || !contactEmail) {
      return res.status(400).json({
        code: 'MISSING_APPLICATION_FIELDS',
        message_en: 'Lab name, healthcare licence number, and contact email are required.',
        message_ar: 'اسم المختبر ورقم الترخيص والبريد الإلكتروني مطلوبة.',
        retry: false,
      });
    }
    const appRecord = submitPartnerApplication(store, {
      labName: String(labName),
      emirate: String(emirate || 'Dubai'),
      licenceNumber: String(licenceNumber),
      contactEmail: String(contactEmail),
      servicesOffered: Array.isArray(servicesOffered) ? servicesOffered : ['Semen Analysis'],
    });
    saveStore(store);
    res.json({
      application: appRecord,
      partnerApplications: store.partnerApplications,
    });
  });

  // Stay Alert Tasks (Acknowledge != Complete for human-owned tasks)
  app.post('/v1/follow-ups/:id/acknowledge', (req, res) => {
    const store = loadStore();
    const updated = acknowledgeFollowUpTask(store, req.params.id);
    if (!updated) {
      return res.status(404).json({
        code: 'FOLLOWUP_NOT_FOUND',
        message_en: 'Follow-up task not found.',
        message_ar: 'مهمة المتابعة غير موجودة.',
        retry: false,
      });
    }
    saveStore(store);
    res.json({ task: updated, followUpTasks: store.followUpTasks });
  });

  app.post('/v1/follow-ups/:id/resolve', (req, res) => {
    const store = loadStore();
    const { clinicianName = 'Dr. Tariq Al-Mansoor', resolutionNote = 'Direct callback completed & follow-up plan documented.' } =
      req.body || {};
    const updated = resolveFollowUpTaskByHuman(
      store,
      req.params.id,
      String(clinicianName),
      String(resolutionNote)
    );
    if (!updated) {
      return res.status(404).json({
        code: 'FOLLOWUP_NOT_FOUND',
        message_en: 'Follow-up task not found.',
        message_ar: 'مهمة المتابعة غير موجودة.',
        retry: false,
      });
    }
    saveStore(store);
    res.json({ task: updated, followUpTasks: store.followUpTasks, orders: store.orders });
  });

  // Report Vault Quarantine + Extraction + Mandatory Confirmation + Deletion
  app.post('/v1/reports/extract', async (req, res) => {
    const store = loadStore();
    try {
      if (!store.consents.reports_store?.state) {
        return res.status(403).json({
          code: 'CONSENT_REQUIRED',
          message_en: 'Please enable Private Report Vault consent before uploading.',
          message_ar: 'يُرجى تفعيل إذن خزنة التقارير الخاصة قبل الرفع.',
          retry: false,
        });
      }
      const { fileName, mime, rawText, imageBase64, privacyMode = 'covered', reportTypeHint, simulateMalware } =
        req.body || {};
      const extracted = await extractReportOnServer({
        fileName: String(fileName || 'report.jpg'),
        mime: String(mime || 'image/jpeg'),
        rawText,
        imageBase64,
        reportTypeHint,
        simulateMalware: Boolean(simulateMalware),
      });

      if (!extracted.ok) {
        appendAuditAndOutbox(store, {
          actorType: 'pipeline',
          action: 'REPORT_REJECTED_QUARANTINE',
          target: 'quarantine-scan',
        });
        saveStore(store);
        return res.status(422).json({
          code: 'QUARANTINE_REJECTED',
          message_en: extracted.rejectedReason || 'Rejected in quarantine scan.',
          message_ar: 'تم رفض الملف في فحص العزل ولم يُحفظ في الخزنة.',
          retry: true,
        });
      }

      const now = new Date().toISOString();
      const docId = `rep_${Date.now().toString().slice(-6)}_${crypto.randomUUID().slice(0, 4)}`;
      const report: VaultReport = {
        docId,
        userId: store.user.userId,
        fileName: String(fileName || 'Uploaded_Lab_Report.jpg'),
        mime: String(mime || 'image/jpeg'),
        privacyMode,
        state: extracted.extractionFailed ? 'ManualEntry' : 'NeedsUserReview',
        stateMessage: extracted.extractionFailed
          ? 'Could not extract structured metrics automatically. Enter or confirm values manually.'
          : 'Draft OCR extracted — mandatory side-by-side user confirmation required before screening or Ask access.',
        originalPreviewDataUrl: imageBase64,
        extractionJson: {
          engineVersion: 'panacea-ocr-v2.0',
          headerMaskedFields: extracted.maskedFields,
          rawLines: extracted.rawLines,
        },
        values: extracted.values,
        summary: null,
        summaryVersion: 0,
        createdAt: now,
        confirmedAt: null,
      };

      store.reports.unshift(report);
      appendAuditAndOutbox(store, {
        actorType: 'pipeline',
        action: extracted.extractionFailed ? 'REPORT_MANUAL_ENTRY_FALLBACK' : 'REPORT_NEEDS_USER_REVIEW',
        target: report.docId,
      });
      saveStore(store);

      res.json({ report, reports: store.reports });
    } catch {
      res.status(500).json({
        code: 'EXTRACTION_ERROR',
        message_en: 'We could not read this report. Enter values manually instead.',
        message_ar: 'تعذرت قراءة التقرير. يمكنك إدخال القيم يدوياً.',
        retry: true,
      });
    }
  });

  app.post('/v1/reports/:id/confirm', (req, res) => {
    const store = loadStore();
    const rep = store.reports.find((r) => r.docId === req.params.id);
    if (!rep) {
      return res.status(404).json({
        code: 'REPORT_NOT_FOUND',
        message_en: 'Report not found.',
        message_ar: 'التقرير غير موجود.',
        retry: false,
      });
    }
    const { values, reportDate, labName, abstinenceDays } = req.body || {};
    const now = new Date().toISOString();
    const editedRows = Array.isArray(values) ? values : rep.values;

    rep.values = editedRows.map((v) => ({
      ...v,
      confirmed: true,
      confirmedBy: 'User verified side-by-side',
      confirmedAt: now,
    }));
    rep.state = 'Summarised';
    rep.summaryVersion += 1;
    rep.confirmedAt = now;
    rep.stateMessage = `Confirmed side-by-side by user (Summary v${rep.summaryVersion}).`;
    rep.summary = {
      schema_version: 1,
      doc_id: rep.docId,
      report_date: String(reportDate || rep.summary?.report_date || now.slice(0, 10)),
      report_type: rep.values.some((v) => v.testCode.startsWith('SEMEN_')) ? 'semen_analysis' : 'hormones',
      lab_name_as_written: labName || rep.summary?.lab_name_as_written || 'User Uploaded Lab',
      abstinence_days: typeof abstinenceDays === 'number' ? abstinenceDays : rep.summary?.abstinence_days ?? null,
      values: rep.values.map((v) => ({
        test_code: v.testCode,
        test_name_as_written: v.testNameAsWritten,
        value: v.userValue,
        unit: v.unit,
        ref_low: v.refLow,
        ref_high: v.refHigh,
        flag: v.flag,
        confirmed_by_user: true,
        source_page: v.sourcePage || 1,
      })),
      free_text_findings: rep.summary?.free_text_findings || [],
      not_found: ['DNA Fragmentation'],
      plain_text_summary: `Confirmed lab summary (${String(reportDate || now.slice(0, 10))}, v${rep.summaryVersion}): ${rep.values
        .map((v) => `${v.testNameAsWritten} ${v.userValue} ${v.unit} (${v.flag})`)
        .join(', ')}.`,
    };

    appendAuditAndOutbox(store, {
      actorType: 'user',
      action: 'REPORT_CONFIRMED_VERSIONED',
      target: `${rep.docId}:v${rep.summaryVersion}`,
    });
    saveStore(store);
    res.json({ report: rep, reports: store.reports });
  });

  app.delete('/v1/reports/:id', (req, res) => {
    const store = loadStore();
    store.reports = store.reports.filter((r) => r.docId !== req.params.id);
    appendAuditAndOutbox(store, {
      actorType: 'user',
      action: 'REPORT_DELETED_FROM_VAULT',
      target: req.params.id,
    });
    saveStore(store);
    res.json({ reports: store.reports });
  });

  // Home Semen Pre-Screen (Research Mode, Calibration & S0-S13) — DEMO_MODE only
  if (DEMO_MODE) {
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
          messageEn: 'Calibration failed: fewer than 8 even ruler lines within 3% tolerance.',
          messageAr: 'فشلت المعايرة: لم يتم رصد ٨ خطوط متساوية بنسبة تفاوت أقل من ٣٪.',
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
  }

  if (DEMO_MODE) {
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
  } else {
    app.post('/v1/semen/sessions', (_req, res) => {
      res.status(404).json({
        code: 'DEMO_MODE_DISABLED',
        message_en: 'Demo session save is disabled in production. Use the Azure backend.',
        message_ar: 'حفظ الجلسة التجريبية معطل في الإنتاج. استخدم الواجهة الخلفية في Azure.',
        retry: false,
      });
    });
  }

  if (DEMO_MODE) {
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
          message_en: 'Could not complete research pipeline safely. Fallback triggered.',
          message_ar: 'تعذر إكمال المسار البحثي بأمان. تم تفعيل المسار الاحتياطي.',
          retry: true,
          demo: true,
        });
      }
    });
  } else {
    app.post('/v1/semen/analyze', (_req, res) => {
      res.status(404).json({
        code: 'DEMO_MODE_DISABLED',
        message_en: 'Demo pipeline is disabled in production. Use the Azure backend for analysis.',
        message_ar: 'خط الأنابيب التجريبي معطل في الإنتاج. استخدم الواجهة الخلفية في Azure للتحليل.',
        retry: false,
      });
    });
  }

  // Flexible Habit Plan Action Updates
  app.post('/v1/plan/action', (req, res) => {
    const store = loadStore();
    const { date = getTodayISO(), templateCode, status } = req.body as {
      date?: string;
      templateCode?: string;
      status?: PlanActionStatus;
    };
    if (!templateCode || !status) {
      return res.status(400).json({
        code: 'INVALID_PLAN_ACTION',
        message_en: 'templateCode and status are required.',
        message_ar: 'الرمز والحالة مطلوبان.',
        retry: false,
      });
    }
    if (!store.planCompletions[date]) {
      store.planCompletions[date] = {};
    }
    store.planCompletions[date][templateCode] = status;
    appendAuditAndOutbox(store, {
      actorType: 'user',
      action: `PLAN_ACTION_${status.toUpperCase()}`,
      target: templateCode,
    });
    saveStore(store);
    res.json({ planCompletions: store.planCompletions });
  });

  // Symptoms, Gated Check-ins & Read-Only Wearables
  app.post('/v1/symptoms', (req, res) => {
    const store = loadStore();
    const { title, severity = 'mild', notes = '', date = getTodayISO(), time = '09:00' } = req.body || {};
    if (!title) {
      return res.status(400).json({
        code: 'SYMPTOM_TITLE_REQUIRED',
        message_en: 'Symptom title is required.',
        message_ar: 'وصف العرض مطلوب.',
        retry: false,
      });
    }
    store.symptoms.unshift({
      id: `sym_${Date.now().toString().slice(-6)}`,
      date,
      time,
      title: String(title),
      severity,
      notes: String(notes),
      source: 'user_reported',
    });
    appendAuditAndOutbox(store, {
      actorType: 'user',
      action: 'SYMPTOM_LOGGED',
      target: 'symptom-timeline',
    });
    saveStore(store);
    res.json({ symptoms: store.symptoms });
  });

  app.post('/v1/check-ins', (req, res) => {
    const store = loadStore();
    const { instrument, score, maxScore, noteEn, noteAr } = req.body || {};
    store.checkIns.unshift({
      id: `chk_${Date.now().toString().slice(-6)}`,
      instrument: instrument === 'PHQ-2' ? 'PHQ-2' : 'IIEF-5',
      date: getTodayISO(),
      score: Number(score || 0),
      maxScore: Number(maxScore || 25),
      noteEn: String(noteEn || 'Reviewed educational check-in recorded.'),
      noteAr: String(noteAr || 'تم حفظ نتيجة التقييم الاسترشادي.'),
    });
    appendAuditAndOutbox(store, {
      actorType: 'user',
      action: `GATED_CHECKIN_${instrument === 'PHQ-2' ? 'PHQ2' : 'IIEF5'}`,
      target: 'check-ins',
    });
    saveStore(store);
    res.json({ checkIns: store.checkIns });
  });

  app.post('/v1/wearables/sync', (req, res) => {
    const store = loadStore();
    if (!store.consents.wearable_read?.state) {
      return res.status(403).json({
        code: 'WEARABLE_CONSENT_OFF',
        message_en: 'Enable Wearable Habits Sync in Consent Centre first.',
        message_ar: 'يُرجى تفعيل إذن مزامنة الساعة في مركز الأذونات أولاً.',
        retry: false,
      });
    }
    const { source = 'Apple HealthKit' } = req.body || {};
    const metric = {
      localDate: getTodayISO(),
      sleepHours: Number((6.8 + Math.random() * 1.4).toFixed(1)),
      restingHrBpm: Math.round(58 + Math.random() * 9),
      hrvRmssdMs: Math.round(42 + Math.random() * 18),
      steps: Math.round(5200 + Math.random() * 4500),
      source: source === 'Android Health Connect' ? ('Android Health Connect' as const) : ('Apple HealthKit' as const),
    };
    store.wearables.unshift(metric);
    if (store.wearables.length > 14) store.wearables.length = 14;
    appendAuditAndOutbox(store, {
      actorType: 'user',
      action: 'WEARABLE_READ_SYNCED',
      target: metric.source,
    });
    saveStore(store);
    res.json({ wearables: store.wearables });
  });

  // Constrained Ask Assistant
  app.post('/v1/ask', async (req, res) => {
    const store = loadStore();
    try {
      const today = getTodayISO();
      const todayStatuses = Object.values(store.planCompletions[today] || {}).map((status) => ({
        status,
      }));
      const cons = calculatePlanConsistency(todayStatuses);

      const reply = await handlePanaceaAskAgent({
        question: String(req.body?.question || ''),
        language: req.body?.language || store.user.language,
        llmMode: store.featureFlags.askLlmMode,
        reportsAiConsent: Boolean(store.consents.reports_ai?.state),
        wearableReadConsent: Boolean(store.consents.wearable_read?.state),
        latestScreening: store.screeningRuns[0] || null,
        latestSemen: store.semenSessions[0] || null,
        allReports: store.reports,
        latestOrder: store.orders[0] || null,
        consistencyCompleted: cons.completed,
        consistencyEligible: cons.eligible,
        wearables: store.wearables,
      });

      appendAuditAndOutbox(store, {
        actorType: 'user',
        action: `ASK_ASSISTANT_${reply.modeUsed.toUpperCase()}`,
        target: 'ask-router',
      });
      saveStore(store);
      res.json(reply);
    } catch {
      res.status(500).json({
        code: 'ASK_ERROR',
        message_en: 'Assistant could not complete your request right now.',
        message_ar: 'تعذر إكمال الطلب الآن.',
        retry: true,
      });
    }
  });

  // Data Export & Account Deletion (Blueprint Part 2 & 16.7)
  app.get('/v1/data/export', (_req, res) => {
    const store = loadStore();
    appendAuditAndOutbox(store, {
      actorType: 'user',
      action: 'USER_DATA_EXPORTED_JSON',
      target: store.user.userId,
    });
    saveStore(store);
    res.json({
      exportedAt: new Date().toISOString(),
      product: 'Panacea',
      attribution: 'Developed with love by Syed',
      retentionNotice:
        'Backups follow scheduled expiry cycles. Copies already received by an external partner lab are governed by that partner.',
      data: store,
    });
  });

  app.delete('/v1/data', (_req, res) => {
    const fresh = resetStore();
    res.json({
      ok: true,
      messageEn:
        'Active user records, reports, and sessions have been erased and reset. Scheduled encrypted backups expire per lifecycle policy; partner-held records must be requested from the partner.',
      messageAr:
        'تم مسح جميع السجلات والتقارير والجلسات النشطة وإعادة الضبط. تنتهي النسخ الاحتياطية وفق دورة الحفظ، وأي نسخ لدى المختبر تخضع لسياسة المختبر.',
      state: fresh,
    });
  });

  // Redacted Audit Log & Outbox
  app.get('/v1/audit', (_req, res) => {
    const store = loadStore();
    res.json({ events: store.auditEvents, outbox: store.outboxMessages });
  });

  // Vite dev middleware or static dist
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get(/.*/, (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Panacea full-stack server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
