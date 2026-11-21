import crypto from 'node:crypto';
import { DUBAI_PARTNER_SITES } from '../data/panaceaCatalogs.ts';
import { calculateDistanceKm } from '../engine/panaceaScreening.ts';
import type {
  ConsentPack,
  FollowUpTask,
  LabOrder,
  PartnerApplication,
  PartnerLabSite,
  SpecimenOrderState,
  VaultReport,
} from '../types/panacea.ts';
import { appendAuditAndOutbox, type PanaceaStoreData, type SlotHoldRecord } from './persistenceStore.ts';

export interface PartnerEligibilityQuote {
  partner: PartnerLabSite;
  distanceKm: number;
  within5KmBoundary: boolean;
  homeCollectionEligible: boolean;
  ineligibilityReasonEn: string | null;
  ineligibilityReasonAr: string | null;
  centreSlots: string[];
  homeSlots: string[];
  totalCentreAed: number;
  totalHomeAed: number;
}

const VALID_STATE_RANK: Record<SpecimenOrderState, number> = {
  Draft: 1,
  NeedsAuthorization: 2,
  QuoteReady: 3,
  SlotHeld: 4,
  PaymentPending: 5,
  PartnerPending: 6,
  Booked: 7,
  CollectorAssigned: 8,
  CentreCheckIn: 8,
  Collected: 9,
  InTransit: 10,
  Received: 11,
  Accepted: 12,
  Processing: 13,
  ReportReady: 14,
  FollowUpPending: 15,
  Complete: 16,
  ReportCorrected: 16,
  // Exceptions (terminal or side-branches)
  HoldExpired: 90,
  PaymentFailed: 91,
  PartnerRejected: 92,
  CollectionMissed: 93,
  SpecimenRejected: 94,
  RecollectionRequested: 95,
  Cancelled: 96,
  RefundPending: 97,
  Refunded: 98,
};

export function evaluatePartnerEligibility(params: {
  userLat: number;
  userLng: number;
  locationDenied?: boolean;
  forceCapacityZero?: boolean;
  forceWindowInvalid?: boolean;
}): PartnerEligibilityQuote[] {
  return DUBAI_PARTNER_SITES.map((partner) => {
    const rawDistanceKm = calculateDistanceKm(
      params.userLat,
      params.userLng,
      partner.lat,
      partner.lng
    );
    const distanceKm = Number(rawDistanceKm.toFixed(4));
    const effectiveHomeSlots = params.forceCapacityZero ? 0 : partner.homeSlotsAvailable;
    const effectiveWindowValid = !params.forceWindowInvalid && partner.homeWindowMinutes >= 30;
    const within5KmBoundary = !params.locationDenied && rawDistanceKm <= partner.maxHomeRadiusKm;

    let homeCollectionEligible = false;
    let ineligibilityReasonEn: string | null = null;
    let ineligibilityReasonAr: string | null = null;

    if (params.locationDenied) {
      ineligibilityReasonEn = 'Precise location denied — showing confirmed centre appointments only.';
      ineligibilityReasonAr = 'تم رفض الموقع الدقيق — يتم عرض مواعيد المركز المؤكدة فقط.';
    } else if (!partner.acceptsHomeSemenPickup) {
      ineligibilityReasonEn = 'This site supports centre collection appointments only.';
      ineligibilityReasonAr = 'يدعم هذا المختبر الحضور للمركز فقط.';
    } else if (rawDistanceKm > partner.maxHomeRadiusKm) {
      ineligibilityReasonEn = `Distance is ${distanceKm.toFixed(3)} km (> 5.000 km boundary) — centre appointment only.`;
      ineligibilityReasonAr = `المسافة ${distanceKm.toFixed(3)} كم (تتجاوز حد ٥٫٠٠٠ كم) — موعد بالمركز فقط.`;
    } else if (effectiveHomeSlots <= 0) {
      ineligibilityReasonEn = 'Within 5.000 km, but verified home-collector capacity is currently 0 — centre slot available.';
      ineligibilityReasonAr = 'ضمن نطاق ٥ كم ولكن سعة الاستلام المنزلي ممتلئة حالياً — تتوفر مواعيد بالمركز.';
    } else if (!effectiveWindowValid) {
      ineligibilityReasonEn = 'Sample handling window cannot be met right now — centre appointment offered.';
      ineligibilityReasonAr = 'تعذر استيفاء نافذة مناولة العينة حالياً — يتوفر موعد بالمركز.';
    } else {
      homeCollectionEligible = true;
    }

    const centreSlots =
      partner.centreSlotsAvailable > 0
        ? ['Tomorrow 08:30 AM (Centre)', 'Tomorrow 10:15 AM (Centre)', 'Thu 09:00 AM (Centre)']
        : [];
    const homeSlots = homeCollectionEligible
      ? ['Tomorrow 08:00–08:45 AM (Home Pickup)', 'Tomorrow 09:30–10:15 AM (Home Pickup)']
      : [];

    return {
      partner: {
        ...partner,
        homeSlotsAvailable: effectiveHomeSlots,
      },
      distanceKm,
      within5KmBoundary,
      homeCollectionEligible,
      ineligibilityReasonEn,
      ineligibilityReasonAr,
      centreSlots,
      homeSlots,
      totalCentreAed: partner.baseTestFeeAed,
      totalHomeAed: partner.baseTestFeeAed + partner.homeCollectionFeeAed,
    };
  });
}

export function createSlotHold(
  store: PanaceaStoreData,
  params: {
    partnerId: string;
    mode: 'home_collection' | 'centre_appointment';
    slotLabel: string;
    userLat: number;
    userLng: number;
    forceCapacityZero?: boolean;
  }
): { ok: true; hold: SlotHoldRecord } | { ok: false; code: string; messageEn: string; messageAr: string } {
  const quotes = evaluatePartnerEligibility({
    userLat: params.userLat,
    userLng: params.userLng,
    forceCapacityZero: params.forceCapacityZero,
  });
  const quote = quotes.find((q) => q.partner.partnerId === params.partnerId);
  if (!quote) {
    return {
      ok: false,
      code: 'PARTNER_NOT_FOUND',
      messageEn: 'Verified partner fixture not found.',
      messageAr: 'تعذر العثور على المختبر الشريك.',
    };
  }
  if (params.mode === 'home_collection' && !quote.homeCollectionEligible) {
    return {
      ok: false,
      code: 'HOME_COLLECTION_INELIGIBLE',
      messageEn: quote.ineligibilityReasonEn || 'Home collection is not eligible.',
      messageAr: quote.ineligibilityReasonAr || 'الاستلام المنزلي غير متاح.',
    };
  }

  const hold: SlotHoldRecord = {
    holdId: `hold_${Date.now()}_${crypto.randomUUID().slice(0, 6)}`,
    partnerId: quote.partner.partnerId,
    siteId: quote.partner.siteId,
    mode: params.mode,
    slotLabel: params.slotLabel,
    distanceKm: quote.distanceKm,
    totalPriceAed: params.mode === 'home_collection' ? quote.totalHomeAed : quote.totalCentreAed,
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  };

  store.slotHolds.unshift(hold);
  if (store.slotHolds.length > 20) store.slotHolds.length = 20;
  appendAuditAndOutbox(store, {
    actorType: 'user',
    action: 'SLOT_HOLD_CREATED',
    target: `${hold.partnerId}:${hold.mode}`,
  });

  return { ok: true, hold };
}

export function createOrderWithConsentPack(
  store: PanaceaStoreData,
  params: {
    partnerId: string;
    mode: 'home_collection' | 'centre_appointment';
    slotLabel: string;
    selectedFields: string[];
    optionalFieldsIncluded: string[];
    consentApproved: boolean;
    recollectionParentOrderId?: string | null;
  }
):
  | { ok: true; order: LabOrder }
  | { ok: false; status: number; code: string; messageEn: string; messageAr: string } {
  if (!store.consents.share_clinic?.state || !params.consentApproved) {
    appendAuditAndOutbox(store, {
      actorType: 'user',
      action: 'ORDER_DISPATCH_BLOCKED_NO_CONSENT',
      target: params.partnerId,
    });
    return {
      ok: false,
      status: 403,
      code: 'CONSENT_PACK_DECLINED',
      messageEn:
        'Sharing declined or Partner Share consent is OFF. Dispatch was blocked — private Panacea features remain available.',
      messageAr:
        'تم رفض المشاركة أو إذن مشاركة المختبر متوقف. تم منع الإرسال وتبقى جميع المزايا الخاصة متاحة.',
    };
  }

  const quotes = evaluatePartnerEligibility({
    userLat: store.user.userLat,
    userLng: store.user.userLng,
  });
  const quote = quotes.find((q) => q.partner.partnerId === params.partnerId);
  if (!quote) {
    return {
      ok: false,
      status: 404,
      code: 'PARTNER_NOT_FOUND',
      messageEn: 'Partner site not found.',
      messageAr: 'المختبر الشريك غير موجود.',
    };
  }

  // Revalidate 5.000 km boundary at checkout (Blueprint Part 7.5)
  if (params.mode === 'home_collection' && !quote.homeCollectionEligible) {
    return {
      ok: false,
      status: 409,
      code: 'QUOTE_REVALIDATION_CHANGED',
      messageEn: quote.ineligibilityReasonEn || 'Home collection boundary/capacity changed.',
      messageAr: quote.ineligibilityReasonAr || 'تغيرت أهلية الاستلام المنزلي.',
    };
  }

  const now = new Date().toISOString();
  const orderId = `ord_${Date.now().toString().slice(-6)}_${crypto.randomUUID().slice(0, 4)}`;
  const ticketCode = `PNC-${Math.floor(100000 + Math.random() * 900000)}`;

  const consentPack: ConsentPack = {
    grantId: `cpack_${crypto.randomUUID().slice(0, 8)}`,
    recipientPartnerId: quote.partner.partnerId,
    recipientName: quote.partner.nameEn,
    purpose: 'Diagnostic Semen Analysis Fulfillment (Minimal Handoff)',
    selectedFields: params.selectedFields,
    optionalFieldsIncluded: params.optionalFieldsIncluded,
    consentVersion: 'v2.0',
    expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
    grantedAt: now,
    revoked: false,
  };

  const totalPriceAed =
    params.mode === 'home_collection' ? quote.totalHomeAed : quote.totalCentreAed;

  const order: LabOrder = {
    orderId,
    userId: store.user.userId,
    ticketCode,
    partnerId: quote.partner.partnerId,
    partnerNameEn: quote.partner.nameEn,
    partnerNameAr: quote.partner.nameAr,
    siteId: quote.partner.siteId,
    testCode: 'SEMEN_ANALYSIS',
    testNameEn: 'Laboratory Semen Analysis (WHO 6th-Ed)',
    mode: params.mode,
    distanceKm: quote.distanceKm,
    slotLabel: params.slotLabel,
    totalPriceAed,
    isSimulated: true,
    state: 'Booked',
    stateVersion: 1,
    consentPack,
    recollectionParentOrderId: params.recollectionParentOrderId || null,
    linkedReportId: null,
    events: [
      {
        eventId: `evt_${crypto.randomUUID().slice(0, 8)}`,
        orderId,
        state: 'Booked',
        actorRole: 'system',
        actorName: 'Simulated Partner Adapter',
        note: `Simulated booking confirmed (${params.mode === 'home_collection' ? 'Home Pickup <= 5 km' : 'Centre Appointment'}). Ticket ${ticketCode} issued with minimal ConsentPack.`,
        timestamp: now,
      },
    ],
    createdAt: now,
    updatedAt: now,
  };

  store.orders.unshift(order);
  appendAuditAndOutbox(store, {
    actorType: 'user',
    action: 'LAB_ORDER_BOOKED_SIMULATED',
    target: order.orderId,
    outboxAggregateType: 'LabOrder',
    outboxAggregateId: order.orderId,
    outboxEventType: 'ORDER_BOOKED_WITH_CONSENT_PACK',
  });

  return { ok: true, order };
}

export function transitionOrderState(
  store: PanaceaStoreData,
  params: {
    orderId: string;
    nextState: SpecimenOrderState;
    actorRole: 'collector' | 'lab_tech' | 'lab_director' | 'system';
    actorName: string;
    note?: string;
    rejectionReason?: string;
    deliverCriticalSample?: boolean;
  }
): {
  ok: boolean;
  deduped?: boolean;
  outOfOrderIgnored?: boolean;
  order?: LabOrder;
  createdReport?: VaultReport;
  createdFollowUp?: FollowUpTask;
  messageEn: string;
  messageAr: string;
} {
  const order = store.orders.find((o) => o.orderId === params.orderId);
  if (!order) {
    return {
      ok: false,
      messageEn: 'Order not found.',
      messageAr: 'الطلب غير موجود.',
    };
  }

  const now = new Date().toISOString();

  // Duplicate event check (idempotent)
  if (order.state === params.nextState) {
    appendAuditAndOutbox(store, {
      actorType: 'partner_staff',
      action: 'PARTNER_DUPLICATE_EVENT_IGNORED',
      target: `${order.orderId}:${params.nextState}`,
    });
    return {
      ok: true,
      deduped: true,
      order,
      messageEn: `Duplicate partner event (${params.nextState}) safely ignored (idempotent).`,
      messageAr: `تم تجاهل الحدث المكرر (${params.nextState}) بأمان دون تغيير الحالة.`,
    };
  }

  // Out-of-order regression check (Blueprint Part 5.3)
  const currentRank = VALID_STATE_RANK[order.state] ?? 0;
  const nextRank = VALID_STATE_RANK[params.nextState] ?? 0;
  if (nextRank < currentRank && currentRank < 90 && nextRank < 90) {
    appendAuditAndOutbox(store, {
      actorType: 'partner_staff',
      action: 'PARTNER_OUT_OF_ORDER_REGRESSION_BLOCKED',
      target: `${order.orderId}:${order.state}->${params.nextState}`,
    });
    return {
      ok: false,
      outOfOrderIgnored: true,
      order,
      messageEn: `Out-of-order transition blocked: state cannot regress from ${order.state} to ${params.nextState}.`,
      messageAr: `تم منع تراجع الحالة من ${order.state} إلى ${params.nextState}.`,
    };
  }

  // Rejected specimen CANNOT produce a report
  if (order.state === 'SpecimenRejected' && (params.nextState === 'ReportReady' || params.nextState === 'Processing')) {
    return {
      ok: false,
      order,
      messageEn: 'Rejected specimens cannot enter Processing or produce a Report. Create a linked recollection order instead.',
      messageAr: 'العينة المرفوضة لا يمكن معالجتها أو إصدار تقرير لها. يجب إنشاء طلب إعادة جمع مرتبط.',
    };
  }

  order.state = params.nextState;
  order.stateVersion += 1;
  order.updatedAt = now;
  if (params.rejectionReason) {
    order.rejectionReason = params.rejectionReason;
  }

  order.events.unshift({
    eventId: `evt_${crypto.randomUUID().slice(0, 8)}`,
    orderId: order.orderId,
    state: params.nextState,
    actorRole: params.actorRole,
    actorName: params.actorName,
    note:
      params.note ||
      `Partner staff confirmed ${params.nextState}${params.rejectionReason ? `: ${params.rejectionReason}` : ''}.`,
    timestamp: now,
  });

  let createdReport: VaultReport | undefined;
  let createdFollowUp: FollowUpTask | undefined;

  if (params.nextState === 'SpecimenRejected') {
    createdFollowUp = {
      taskId: `fup_rej_${Date.now().toString().slice(-6)}`,
      orderId: order.orderId,
      titleEn: 'Lab Specimen Rejected — Recollection Decision Needed',
      titleAr: 'تم رفض العينة المخبرية — يلزم تنسيق إعادة الجمع',
      whatIsKnownEn: `Lab staff (${params.actorName}) marked specimen rejected for ticket ${order.ticketCode}. Reason: ${params.rejectionReason || 'Liquefaction/temperature window variance'}.`,
      whatIsUnknownEn: 'New collection slot has not been scheduled yet.',
      lastConfirmedEvent: 'SpecimenRejected',
      lastConfirmedAt: now,
      ownerName: params.actorName,
      ownerRole: 'Partner Lab Coordinator',
      expectedContactWindow: 'Within 4 business hours',
      priority: 'timely',
      status: 'HumanContactRequired',
    };
    store.followUpTasks.unshift(createdFollowUp);
  }

  if (params.nextState === 'ReportReady') {
    const isCritical = Boolean(params.deliverCriticalSample);
    const concVal = isCritical ? 0.0 : 21.4;
    const motVal = isCritical ? 0 : 51;
    const reportId = `rep_partner_${Date.now().toString().slice(-6)}`;

    createdReport = {
      docId: reportId,
      userId: store.user.userId,
      fileName: `${order.ticketCode}_Signed_Lab_Report.pdf`,
      mime: 'application/pdf',
      privacyMode: 'full',
      state: 'Summarised',
      stateMessage: `Signed & delivered by ${params.actorName} (Simulated Partner Fixture).`,
      extractionJson: {
        engineVersion: 'partner-signed-ingestion-v2.0',
        headerMaskedFields: ['Partner Verified Identity'],
        rawLines: [
          { text: `Signed By: ${params.actorName} (${order.partnerNameEn})`, confidence: 'high' },
          { text: `Order Ticket: ${order.ticketCode}`, confidence: 'high' },
          { text: `Sperm concentration: ${concVal} million/mL (Ref >= 16)`, confidence: 'high' },
          { text: `Total motility: ${motVal} % (Ref >= 42%)`, confidence: 'high' },
        ],
      },
      values: [
        {
          valueId: `val_${crypto.randomUUID().slice(0, 6)}`,
          testCode: 'SEMEN_CONC',
          testNameAsWritten: 'Sperm concentration',
          aiValue: concVal,
          userValue: concVal,
          unit: 'million/mL',
          refLow: 16,
          refHigh: null,
          flag: concVal < 16 ? 'low' : 'normal',
          confidence: 'high',
          confirmed: true,
          sourcePage: 1,
          confirmedBy: params.actorName,
          confirmedAt: now,
        },
        {
          valueId: `val_${crypto.randomUUID().slice(0, 6)}`,
          testCode: 'SEMEN_MOT_TOTAL',
          testNameAsWritten: 'Total motility',
          aiValue: motVal,
          userValue: motVal,
          unit: '%',
          refLow: 42,
          refHigh: null,
          flag: motVal < 42 ? 'low' : 'normal',
          confidence: 'high',
          confirmed: true,
          sourcePage: 1,
          confirmedBy: params.actorName,
          confirmedAt: now,
        },
      ],
      summary: {
        schema_version: 1,
        doc_id: reportId,
        report_date: now.slice(0, 10),
        report_type: 'semen_analysis',
        lab_name_as_written: order.partnerNameEn,
        abstinence_days: 3,
        values: [
          {
            test_code: 'SEMEN_CONC',
            test_name_as_written: 'Sperm concentration',
            value: concVal,
            unit: 'million/mL',
            ref_low: 16,
            ref_high: null,
            flag: concVal < 16 ? 'low' : 'normal',
            confirmed_by_user: true,
            source_page: 1,
          },
          {
            test_code: 'SEMEN_MOT_TOTAL',
            test_name_as_written: 'Total motility',
            value: motVal,
            unit: '%',
            ref_low: 42,
            ref_high: null,
            flag: motVal < 42 ? 'low' : 'normal',
            confirmed_by_user: true,
            source_page: 1,
          },
        ],
        free_text_findings: [
          isCritical
            ? 'CRITICAL LAB ESCALATION: Zero spermatozoa observed on centrifuged pellet. Clinician direct contact required.'
            : 'Typical reference range semen profile (Simulated Signed Report Fixture).',
        ],
        not_found: ['DNA Fragmentation'],
        plain_text_summary: `Signed lab report (${now.slice(0, 10)}, ${order.partnerNameEn}): Concentration ${concVal} million/mL, Total motility ${motVal}%.`,
      },
      summaryVersion: 1,
      signedByPartner: params.actorName,
      createdAt: now,
      confirmedAt: now,
    };

    store.reports.unshift(createdReport);
    order.linkedReportId = reportId;

    if (isCritical) {
      order.state = 'FollowUpPending';
      createdFollowUp = {
        taskId: `fup_crit_${Date.now().toString().slice(-6)}`,
        orderId: order.orderId,
        titleEn: 'CRITICAL RESULT: Clinician Contact Required (Cannot Auto-Close)',
        titleAr: 'نتيجة حرجة: مطلوب تواصل مباشر من الطبيب (لا تُغلق تلقائياً)',
        whatIsKnownEn: `Signed lab report ${reportId} flagged critical zero-count parameters by ${params.actorName}.`,
        whatIsUnknownEn: 'Andrology clinician consultation and direct follow-up call still pending completion.',
        lastConfirmedEvent: 'ReportReady (Critical Escalation Triggered)',
        lastConfirmedAt: now,
        ownerName: 'Dr. Tariq Al-Mansoor (Duty Urologist Fixture)',
        ownerRole: 'Lab Director / Duty Clinician',
        expectedContactWindow: 'Within 2 hours (Human Callback Required)',
        priority: 'critical',
        status: 'HumanContactRequired',
      };
      store.followUpTasks.unshift(createdFollowUp);
    }
  }

  appendAuditAndOutbox(store, {
    actorType: 'partner_staff',
    action: `PARTNER_STATE_${order.state}`,
    target: order.orderId,
    outboxAggregateType: 'LabOrder',
    outboxAggregateId: order.orderId,
    outboxEventType: `ORDER_${order.state}`,
  });

  return {
    ok: true,
    order,
    createdReport,
    createdFollowUp,
    messageEn: `Order transitioned to ${order.state}.`,
    messageAr: `تم تحديث حالة الطلب إلى ${order.state}.`,
  };
}

export function acknowledgeFollowUpTask(store: PanaceaStoreData, taskId: string): FollowUpTask | null {
  const task = store.followUpTasks.find((t) => t.taskId === taskId);
  if (!task) return null;
  const now = new Date().toISOString();
  task.userAcknowledgedAt = now;
  // Critical Rule (Blueprint Part 1.5 & 8.6): Acknowledging NEVER completes a critical task!
  if (task.priority !== 'critical' && task.status === 'UserActionNeeded') {
    task.status = 'Acknowledged';
  }
  appendAuditAndOutbox(store, {
    actorType: 'user',
    action: 'FOLLOWUP_USER_ACKNOWLEDGED_NOT_CLOSED',
    target: task.taskId,
  });
  return task;
}

export function resolveFollowUpTaskByHuman(
  store: PanaceaStoreData,
  taskId: string,
  clinicianName: string,
  resolutionNote: string
): FollowUpTask | null {
  const task = store.followUpTasks.find((t) => t.taskId === taskId);
  if (!task) return null;
  const now = new Date().toISOString();
  task.status = 'Completed';
  task.resolvedByHuman = clinicianName;
  task.humanResolutionNote = resolutionNote;
  task.resolvedAt = now;

  if (task.orderId) {
    const linkedOrder = store.orders.find((o) => o.orderId === task.orderId);
    if (linkedOrder && linkedOrder.state === 'FollowUpPending') {
      linkedOrder.state = 'Complete';
      linkedOrder.updatedAt = now;
      linkedOrder.events.unshift({
        eventId: `evt_${crypto.randomUUID().slice(0, 8)}`,
        orderId: linkedOrder.orderId,
        state: 'Complete',
        actorRole: 'lab_director',
        actorName: clinicianName,
        note: `Human clinician contact & resolution documented: ${resolutionNote}`,
        timestamp: now,
      });
    }
  }

  appendAuditAndOutbox(store, {
    actorType: 'partner_staff',
    action: 'FOLLOWUP_HUMAN_RESOLVED',
    target: task.taskId,
  });
  return task;
}

export function submitPartnerApplication(
  store: PanaceaStoreData,
  params: {
    labName: string;
    emirate: string;
    licenceNumber: string;
    contactEmail: string;
    servicesOffered: string[];
  }
): PartnerApplication {
  const app: PartnerApplication = {
    applicationId: `papp_${Date.now().toString().slice(-6)}`,
    labName: params.labName.trim(),
    emirate: params.emirate,
    licenceNumber: params.licenceNumber.trim(),
    contactEmail: params.contactEmail.trim(),
    servicesOffered: params.servicesOffered,
    status: 'PendingHumanReview', // Never auto-publishes (Blueprint Part 2)
    submittedAt: new Date().toISOString(),
  };
  store.partnerApplications.unshift(app);
  appendAuditAndOutbox(store, {
    actorType: 'user',
    action: 'PARTNER_SELF_REG_QUEUED_HUMAN_REVIEW',
    target: app.applicationId,
  });
  return app;
}
