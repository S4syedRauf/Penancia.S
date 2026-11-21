import { DUBAI_PARTNER_SITES } from '../data/panaceaCatalogs';
import { calculateDistanceKm } from '../engine/panaceaScreening';
import { DEFAULT_PANACEA_STATE, type PanaceaAppState } from '../store/PanaceaContext';
import type { LabOrder, SemenSessionRun } from '../types/panacea';

const STORAGE_KEY = 'panacea_offline_state_v2';

function getStoredState(): PanaceaAppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PANACEA_STATE;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_PANACEA_STATE, ...parsed };
  } catch {
    return DEFAULT_PANACEA_STATE;
  }
}

function saveStoredState(state: PanaceaAppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.warn('Failed to persist Panacea state to localStorage:', err);
  }
}

function jsonResponse(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'X-Panacea-Bridge': 'In-Browser-Active',
    },
  });
}

/**
 * In-Browser Client API Bridge.
 * Intercepts /v1/* calls to make all 14 screens, lab booking quotes, orders,
 * semen sessions, check-ins, and data rights 100% functional without requiring
 * an external server.
 */
export function initClientApiBridge(): void {
  if (typeof window === 'undefined') return;

  const originalFetch = window.fetch.bind(window);

  // Paths that should ALWAYS go to the real backend (not mocked)
  // Only active when BACKEND_ENABLED is true (i.e. VITE_BACKEND_ENABLED=true)
  const backendEnabled = import.meta.env.VITE_BACKEND_ENABLED === 'true';
  const passthroughPaths = backendEnabled ? [
    '/v1/samples/',           // All sample endpoints: create, upload-sas, register-blob, analyze, report
    '/v1/reports/',           // Report vault endpoints
    '/v1/quotes',             // Lab booking quotes
    '/v1/slots/',             // Slot holds
    '/v1/orders',             // Lab orders
    '/v1/partner/',           // Partner portal
    '/v1/ask',                // AI Education
    '/v1/questionnaire',      // Questionnaire
    '/v1/screening',          // Screening runs
    '/v1/followup',           // Follow-up recovery
    '/v1/check-ins',          // Check-ins
    '/v1/wearables',          // Wearables sync
    '/v1/data',               // Data export/delete
    '/v1/audit',              // Audit logs
    '/v1/consents',           // Consents
    '/v1/profile',            // Profile
  ] : [];

  window.fetch = async function (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    const urlString = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

    // Check if this is an API call for /v1/*
    const isV1 = urlString.includes('/v1/');
    if (!isV1) {
      return originalFetch(input, init);
    }

    const method = (init?.method || 'GET').toUpperCase();
    const urlPath = urlString.split('?')[0];

    // Extract path after /v1
    const routeIndex = urlPath.indexOf('/v1');
    const path = urlPath.slice(routeIndex);

    // PASSTHROUGH: Forward real backend calls for critical paths
    const shouldPassthrough = passthroughPaths.some(p => path.startsWith(p));
    if (shouldPassthrough) {
      return originalFetch(input, init);
    }

    let bodyData: any = null;
    if (init?.body && typeof init.body === 'string') {
      try {
        bodyData = JSON.parse(init.body);
      } catch {
        bodyData = null;
      }
    }

    const state = getStoredState();

    // 1. GET /v1/state
    if (path === '/v1/state' && method === 'GET') {
      return jsonResponse(state);
    }

    // 2. PUT /v1/profile
    if (path === '/v1/profile' && method === 'PUT') {
      const updatedUser = { ...state.user, ...(bodyData || {}) };
      const nextState: PanaceaAppState = { ...state, user: updatedUser };
      saveStoredState(nextState);
      return jsonResponse({ ok: true, user: updatedUser });
    }

    // 3. POST /v1/consents
    if (path === '/v1/consents' && method === 'POST') {
      const { key, state: consentState, version } = bodyData || {};
      if (key && state.consents[key as keyof typeof state.consents]) {
        const nextConsents = {
          ...state.consents,
          [key]: {
            key,
            state: Boolean(consentState),
            version: version || '2.0',
            changedAt: new Date().toISOString(),
          },
        };
        const nextState: PanaceaAppState = { ...state, consents: nextConsents };
        saveStoredState(nextState);
        return jsonResponse({ ok: true, consents: nextConsents });
      }
      return jsonResponse({ ok: true, consents: state.consents });
    }

    // 4. POST /v1/quotes (Lab Booking & 5.000 km rule)
    if (path === '/v1/quotes' && method === 'POST') {
      const userLat = Number(bodyData?.userLat) || state.user.userLat || 25.1972;
      const userLng = Number(bodyData?.userLng) || state.user.userLng || 55.2744;
      const locationDenied = Boolean(bodyData?.locationDenied);
      const forceCapacityZero = Boolean(bodyData?.forceCapacityZero);

      const quotes = DUBAI_PARTNER_SITES.map((partner) => {
        const rawDist = calculateDistanceKm(userLat, userLng, partner.lat, partner.lng);
        const distanceKm = Number(rawDist.toFixed(3));
        const effectiveHomeSlots = forceCapacityZero ? 0 : partner.homeSlotsAvailable;
        const within5Km = !locationDenied && rawDist <= partner.maxHomeRadiusKm;

        let homeEligible = false;
        let ineligibilityReasonEn: string | null = null;
        let ineligibilityReasonAr: string | null = null;

        if (locationDenied) {
          ineligibilityReasonEn = 'Precise location denied — showing confirmed centre appointments only.';
          ineligibilityReasonAr = 'تم رفض الموقع الدقيق — يتم عرض مواعيد المركز المؤكدة فقط.';
        } else if (!partner.acceptsHomeSemenPickup) {
          ineligibilityReasonEn = 'This site supports centre collection appointments only.';
          ineligibilityReasonAr = 'يدعم هذا المختبر الحضور للمركز فقط.';
        } else if (rawDist > partner.maxHomeRadiusKm) {
          ineligibilityReasonEn = `Distance is ${distanceKm} km (> 5.000 km boundary) — centre appointment only.`;
          ineligibilityReasonAr = `المسافة ${distanceKm} كم (تتجاوز حد ٥٫٠٠٠ كم) — موعد بالمركز فقط.`;
        } else if (effectiveHomeSlots <= 0) {
          ineligibilityReasonEn = 'Within 5.000 km, but verified home-collector capacity is currently 0 — centre slot available.';
          ineligibilityReasonAr = 'ضمن نطاق ٥ كم ولكن سعة الاستلام المنزلي ممتلئة حالياً — تتوفر مواعيد بالمركز.';
        } else {
          homeEligible = true;
        }

        return {
          partner,
          distanceKm,
          within5KmBoundary: within5Km,
          homeCollectionEligible: homeEligible,
          ineligibilityReasonEn,
          ineligibilityReasonAr,
          centreSlots: [
            'Tomorrow 08:30 AM (Centre)',
            'Tomorrow 10:00 AM (Centre)',
            'Tomorrow 02:00 PM (Centre)',
            'Day After 09:00 AM (Centre)',
          ],
          homeSlots: homeEligible
            ? [
                'Tomorrow 07:30 – 08:30 AM (Home Pickup)',
                'Tomorrow 09:00 – 10:00 AM (Home Pickup)',
                'Tomorrow 11:30 AM – 12:30 PM (Home Pickup)',
              ]
            : [],
          totalCentreAed: partner.baseTestFeeAed,
          totalHomeAed: partner.baseTestFeeAed + partner.homeCollectionFeeAed,
        };
      });

      return jsonResponse({ quotes });
    }

    // 5. POST /v1/orders (Create Lab Order)
    if (path === '/v1/orders' && method === 'POST') {
      const partnerId = bodyData?.partnerId || DUBAI_PARTNER_SITES[0].partnerId;
      const mode = (bodyData?.mode || 'centre_appointment') as 'home_collection' | 'centre_appointment';
      const slotLabel = bodyData?.slotLabel || 'Tomorrow 08:30 AM';
      const partner = DUBAI_PARTNER_SITES.find((p) => p.partnerId === partnerId) || DUBAI_PARTNER_SITES[0];

      const orderNumber = Math.floor(1000 + Math.random() * 9000);
      const ticketCode = `PNC-${orderNumber}-DXB`;
      const orderId = `ord_${Date.now()}`;
      const now = new Date().toISOString();

      const newOrder: LabOrder = {
        orderId,
        userId: state.user.userId || 'usr_patient_01',
        ticketCode,
        partnerId,
        partnerNameEn: partner.nameEn,
        partnerNameAr: partner.nameAr,
        siteId: partner.siteId,
        testCode: 'TEST_SEMEN_STANDARD',
        testNameEn: 'WHO 6th Edition Semen Diagnostic Analysis',
        mode,
        distanceKm: 2.5,
        slotLabel,
        totalPriceAed: mode === 'home_collection' ? partner.baseTestFeeAed + partner.homeCollectionFeeAed : partner.baseTestFeeAed,
        isSimulated: true,
        state: 'Booked',
        stateVersion: 1,
        consentPack: null,
        events: [
          {
            eventId: `evt_${Date.now()}`,
            orderId,
            state: 'Booked',
            actorRole: 'patient',
            actorName: state.user.alias || 'Patient Self-Service',
            timestamp: now,
            note: 'Order confirmed with opaque ticket code',
          },
        ],
        createdAt: now,
        updatedAt: now,
      };

      const nextOrders = [newOrder, ...(state.orders || [])];
      const nextState: PanaceaAppState = { ...state, orders: nextOrders };
      saveStoredState(nextState);

      return jsonResponse({
        ok: true,
        orderId,
        ticketCode,
        order: newOrder,
        idempotentReplay: false,
        message_en: `Order booked successfully! Your confidential ticket code is ${ticketCode}.`,
        message_ar: `تم تأكيد حجزك بنجاح! رمز التذكرة السري الخاص بك هو ${ticketCode}.`,
      });
    }

    // 6. POST /v1/ask (Panacea Clinical Assistant)
    if (path === '/v1/ask' && method === 'POST') {
      const question = (bodyData?.question || '').toLowerCase();
      const language = bodyData?.language || 'en';
      const isAr = language === 'ar';

      // Red flags check
      const redFlags = ['emergency', 'pain', 'swelling', 'blood', 'fever', 'torsion', 'ألم', 'دم', 'تورم', 'حرارة', 'طوارئ'];
      const hasRedFlag = redFlags.some((rf) => question.includes(rf));

      if (hasRedFlag) {
        return jsonResponse({
          urgentAlert: true,
          text: isAr
            ? 'تنبيه سريري عاجل: إذا كنت تعاني من ألم حاد ومفاجئ، أو تورم غير طبيعي، أو وجود دم، يرجى طلب الرعاية الطبية الفورية أو الاتصال بالإسعاف (٩٩٨) في دولة الإمارات.'
            : 'Urgent Clinical Alert: If you are experiencing sudden severe pain, swelling, or visible blood, please seek immediate emergency medical care or call UAE Ambulance (998) without delay.',
          sourceLabels: ['UAE Emergency Protocol', 'Clinical Triage Guardrails'],
          buttons: [{ label: 'UAE Emergency 998', action: 'call_emergency' }],
          modeUsed: 'Full',
        });
      }

      // Abstinence question
      if (question.includes('abstinence') || question.includes('امتناع') || question.includes('days') || question.includes('أيام')) {
        return jsonResponse({
          urgentAlert: false,
          text: isAr
            ? 'توصي منظمة الصحة العالمية (WHO 2021) بفترة امتناع تتراوح بين ٢ إلى ٧ أيام قبل جمع عينة السائل المنوي لضمان الحصول على أدق النتائج التشخيصية لحجم العينة وتركيز الحيوانات المنوية.'
            : 'According to WHO Laboratory Manual (6th Ed, 2021), an abstinence period of 2 to 7 days is recommended prior to semen collection. Periods shorter than 2 days may lower volume and concentration, while periods longer than 7 days can reduce sperm motility.',
          sourceLabels: ['WHO 2021 6th Edition Manual', 'Panacea Diagnostic Protocol'],
          buttons: [
            { label: isAr ? 'حجز فحص مختبر' : 'Book Lab Test', action: 'open_lab_booking' },
            { label: isAr ? 'فحص منزلي تمهيدي' : 'Try Home Pre-Screen', action: 'open_prescreen' },
          ],
          modeUsed: 'Full',
        });
      }

      // Default supportive clinical response
      return jsonResponse({
        urgentAlert: false,
        text: isAr
          ? 'أهلاً بك في المساعد السريري لباناسيا. يمكنني إرشادك حول شروط فحص السائل المنوي، وإرشادات منظمة الصحة العالمية (WHO 2021)، وحجز المواعيد في المختبرات المعتمدة في دبي.'
          : 'Welcome to Panacea Clinical Assistant. I can guide you through semen analysis preparation, WHO 2021 reference intervals (concentration ≥15M/mL, motility ≥42%, normal morphology ≥4%), and booking diagnostic lab appointments across Dubai.',
        sourceLabels: ['WHO 6th Edition Reference Manual', 'Panacea Reproductive Health Care'],
        buttons: [
          { label: isAr ? 'حجز موعد مختبر' : 'Book Lab Test', action: 'open_lab_booking' },
          { label: isAr ? 'سجل التقارير' : 'Report Vault', action: 'open_reports' },
        ],
        modeUsed: 'Full',
      });
    }

    // 7. POST /v1/samples (Semen Pre-Screen Backend Sync)
    if (path === '/v1/samples' && method === 'POST') {
      return jsonResponse({
        ok: true,
        sampleId: bodyData?.sampleId || `ses_${Date.now()}`,
        status: 'IntakeReceived',
        state: 'Completed',
        createdAt: new Date().toISOString(),
      });
    }

    // 8. POST /v1/questionnaire/answers
    if (path === '/v1/questionnaire/answers' && method === 'POST') {
      const nextResponses = bodyData?.responses || [];
      const nextState: PanaceaAppState = {
        ...state,
        questionnaireResponses: nextResponses,
      };
      saveStoredState(nextState);
      return jsonResponse({ ok: true, count: nextResponses.length });
    }

    // 9. POST /v1/basket
    if (path === '/v1/basket' && method === 'POST') {
      const nextBasket = bodyData?.testBasket || [];
      const nextState: PanaceaAppState = { ...state, testBasket: nextBasket };
      saveStoredState(nextState);
      return jsonResponse({ ok: true, count: nextBasket.length });
    }

    // 10. POST /v1/plan/action
    if (path === '/v1/plan/action' && method === 'POST') {
      const { day, actionCode, status: actionStatus } = bodyData || {};
      const currentCompletions = state.planCompletions || {};
      const dayCompletions = currentCompletions[String(day)] || {};
      const nextCompletions = {
        ...currentCompletions,
        [String(day)]: { ...dayCompletions, [actionCode]: actionStatus },
      };
      const nextState: PanaceaAppState = { ...state, planCompletions: nextCompletions };
      saveStoredState(nextState);
      return jsonResponse({ ok: true, planCompletions: nextCompletions });
    }

    // 11. POST /v1/symptoms
    if (path === '/v1/symptoms' && method === 'POST') {
      const newSymptom = bodyData;
      const nextSymptoms = [newSymptom, ...(state.symptoms || [])];
      const nextState: PanaceaAppState = { ...state, symptoms: nextSymptoms };
      saveStoredState(nextState);
      return jsonResponse({ ok: true, symptom: newSymptom });
    }

    // 12. POST /v1/check-ins
    if (path === '/v1/check-ins' && method === 'POST') {
      const newCheckIn = bodyData;
      const nextCheckIns = [newCheckIn, ...(state.checkIns || [])];
      const nextState: PanaceaAppState = { ...state, checkIns: nextCheckIns };
      saveStoredState(nextState);
      return jsonResponse({ ok: true, checkIn: newCheckIn });
    }

    // 13. POST /v1/wearables/sync
    if (path === '/v1/wearables/sync' && method === 'POST') {
      const newMetrics = bodyData?.metrics || [];
      const nextState: PanaceaAppState = { ...state, wearables: newMetrics };
      saveStoredState(nextState);
      return jsonResponse({ ok: true, count: newMetrics.length });
    }

    // 14. GET /v1/data/export
    if (path === '/v1/data/export' && method === 'GET') {
      return jsonResponse(state);
    }

    // 15. DELETE /v1/data
    if (path === '/v1/data' && method === 'DELETE') {
      const resetState: PanaceaAppState = {
        ...DEFAULT_PANACEA_STATE,
        user: { ...DEFAULT_PANACEA_STATE.user, userId: `usr_${Date.now()}` },
      };
      saveStoredState(resetState);
      return jsonResponse({ ok: true, message: 'All personal data deleted securely.' });
    }

    // 16. GET /v1/audit & POST /v1/audit/record
    if (path === '/v1/audit') {
      return jsonResponse({
        auditEvents: state.auditEvents || [],
        totalCount: state.auditEvents?.length || 0,
      });
    }
    if (path === '/v1/audit/record') {
      const newEvent = {
        id: `aud_${Date.now()}`,
        actorType: 'user' as const,
        action: bodyData?.action || 'user_action',
        target: bodyData?.target || 'client',
        at: new Date().toISOString(),
      };
      const nextEvents = [newEvent, ...(state.auditEvents || [])];
      saveStoredState({ ...state, auditEvents: nextEvents });
      return jsonResponse({ ok: true, event: newEvent });
    }

    // 17. POST /v1/partner/applications
    if (path === '/v1/partner/applications' && method === 'POST') {
      const app = {
        applicationId: `app_${Date.now()}`,
        submittedAt: new Date().toISOString(),
        status: 'Submitted' as const,
        ...(bodyData || {}),
      };
      const nextApps = [app, ...(state.partnerApplications || [])];
      saveStoredState({ ...state, partnerApplications: nextApps });
      return jsonResponse({
        ok: true,
        application: app,
        message_en: 'Partner application submitted for DHA compliance review.',
        message_ar: 'تم تقديم طلب اعتماد الشريك لمراجعة هيئة الصحة بدبي.',
      });
    }

    // 18. POST /v1/partner/orders/:orderId/transition
    if (path.includes('/transition') && method === 'POST') {
      return jsonResponse({
        ok: true,
        message_en: 'Order state transitioned successfully.',
        message_ar: 'تم تحديث حالة العينة بنجاح.',
      });
    }

    // Fallback: try real fetch, or return safe empty JSON if failed
    try {
      const resp = await originalFetch(input, init);
      return resp;
    } catch {
      return jsonResponse({ ok: true, fallback: true });
    }
  };

  console.log('[Panacea Bridge] In-browser client API bridge initialized.');
}
