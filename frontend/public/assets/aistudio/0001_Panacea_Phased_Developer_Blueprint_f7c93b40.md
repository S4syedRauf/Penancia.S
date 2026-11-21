# Panacea — PHASED DEVELOPER BLUEPRINT
## Product requirements, architecture, Spec Kit workflow, phased implementation plan and release gates

**Version:** 2.0 — 19 November 2026  
**Status:** Revised planning blueprint; not an implementation approval. Clinical, partner, regulatory, privacy, residency, framework and service-region gates remain open.  
**Product:** Panacea — Developed with love by Syed. Dubai-first private men’s reproductive-health support, with an optional home research pathway and a diagnostic-laboratory handoff. The mobile framework and live service area remain unconfirmed.

> **Important status statement.** This blueprint defines how to build a complete, testable product. It does not certify a medical device, clinical algorithm, partner service, Azure residency, laboratory result, or legal compliance. Prototype/demo behavior must be labeled. A clinical result can only be released as a signed lab report by an authorized laboratory professional. A model-generated output is not a diagnostic report.

## Executive summary

Panacea helps someone who has not yet visited a clinic decide on an appropriate next step and complete a real handoff to a lab or clinician. The user may answer a short, adaptive, clinician-reviewed intake; see why a test is suggested; choose either a home pre-screen or a lab route; explicitly approve a minimum information pack for a named partner; book an eligible service; track confirmed collection and lab events; receive the original signed report; understand its lines with source citations; and optionally follow an effort-based habit plan and retest reminder.

**Path A — home semen pre-screen:** Supported optics and a fixed-depth chamber are prerequisites. The app guides preparation and capture, performs a real quality gate, uploads clips resumably, and runs a versioned computer-vision pipeline. During prototype/research mode it must be conspicuously labeled and must not be presented as a validated diagnosis or used to reassure someone away from care. Until device-specific clinical validation and the applicable UAE regulatory/clinical approvals are complete, model interpretations and derived bands stay out of the patient-facing result surface; a research pipeline may run only in a controlled, access-restricted environment. The user may receive capture-quality feedback and a lab option, not a clinical interpretation. A failure is reported as a failed/unclear research run, never as normal.

**Path B — diagnostic lab:** One test (semen analysis), a synthetic Dubai-area demo fixture, and one simulated partner adapter are the initial demonstration scope. There is no live partner or production integration assumed: booking, prices, payments, staff events, and reports stay clearly simulated until a written partner agreement, verified service capability, clinical workflow and privacy/regulatory gates exist. In a later pilot, home collection may be offered only when a named partner confirms service coverage, capacity and the sample handling window; outside verified eligibility, show only a confirmed alternative. A ticket can simplify check-in but cannot promise no wait, eliminate identity/safety checks, or authorize an unattended drop-off. Do not promise “no doctor conversation”; state that the app reduces repeated history and scheduling friction while required clinical review remains available.

**Flexible-duration plan:** Offer 30, 40, 60, 74, 90 days, or custom; preselect 74 days with a “Recommended” label. A plan supports habits and does not predict semen recovery. Any 0–100% display is plan consistency only (eligible actions completed / eligible actions scheduled), never fertility, health, recovery or readiness. Day 74 is a planning checkpoint, not a biological deadline or automatic retest date. A continuation never delays a clinician-recommended retest, referral or consultation.

**AI boundary:** Use deterministic, versioned clinical rules for urgency, pathways, test suggestions, booking eligibility, report confirmation and follow-up. AI may explain approved content, navigate, or structure draft OCR data with validation. It cannot diagnose, prescribe, decide a colour, infer missing values, generate a signed report, determine payment/sharing consent, or close a critical alert. The CASA pipeline is a set of auditable computer-vision stages, not an ensemble of chat models voting on clinical truth.

---

# PART 0 — HOW TO USE THIS DOCUMENT

## 0.1 Source-of-truth and precedence

This document consolidates the supplied Final Developer Blueprint, the clarified two-path journey, the newly supplied feature catalogue and user-confirmed product decisions. Where the old engineering reference conflicts with the newer delivery contract, use this precedence:

1. Patient safety, clinical owner approval, privacy and applicable regulation.
2. The latest owner-confirmed decisions in this request: Panacea branding, Dubai-first planning, selectable 30/40/60/74/90/custom plans with 74 recommended, and an unconfirmed cross-platform framework.
3. The corrected technical architecture, where consistent with the latest decisions.
4. The DOCX feature catalogue and older blueprint, only where consistent; all proposed commercial, clinical, research, performance and partner claims remain unapproved unless expressly gated and later evidenced.
5. Assumptions in this document, which must be recorded and resolved by a named owner.

The supplied inputs reviewed here are the two architecture/blueprint Markdown files, the application-flow Markdown, the DOCX feature catalogue, and the repeated UI request in the pasted text files. The pasted UI says an inspiration screenshot exists, but no UI screenshot file was present in the supplied attachments, so this blueprint applies the textual visual direction only. No decision sheet (D1–D17) or canonical Drive link was supplied; any gates said to live there remain unverified and must be reconciled before implementation.

## 0.2 Terms and labels

- **Prototype/demo:** Simulated lab, payment, clinician and partner events; synthetic/demo accounts/data; visible labels.
- **Research-mode pipeline:** Real execution of capture/QC/CV stages for evaluation, not a clinically validated patient result.
- **Pilot:** Real users only after named owners sign clinical, partner, regulatory, privacy, security, support and residency gates.
- **Diagnostic report:** Original report signed/authorized by the partner laboratory; never an AI-authored document.
- **Pre-screen:** Limited, non-diagnostic signal; not a lab replacement.
- **Confirmed report value:** User or authorized lab staff checked the extracted value against the source report. OCR/AI output alone is unconfirmed.
- **Unknown:** Not collected or not established. Never silently treat as “no,” normal, zero, or false.

## 0.3 Confirmed product decisions and unresolved choices

| Topic | Status | Blueprint treatment |
|---|---|---|
| Product name and attribution | Confirmed | User-facing brand is **Panacea**; use “Developed with love by Syed” in appropriate About/brand surfaces. Do not retain the former working name in product UI, app copy, or new technical identifiers unless migration compatibility requires it. |
| Product geography | Confirmed direction | Dubai-first product planning. Actual service coverage, named provider, operational radius and legal scope are not confirmed. Any Abu Dhabi data retained for demos is synthetic and clearly labelled. |
| Plan duration | Confirmed | Offer 30, 40, 60, 74, 90 days or custom; select 74 days by default with “Recommended.” Do not imply a biological cycle, expected clinical change, or retest date. |
| Mobile framework | Open | Android and iOS are required. React Native + TypeScript is a candidate, not a confirmed decision; compare against the team's skills and prove camera, identity, RTL, accessibility and native-permission needs before commitment. |
| UI direction | Textual direction confirmed; screenshot unavailable | Modern, clean, mobile-first, accessible, responsive layouts; platform-adapted interactions; polished processing/loading/error states; no copying of inspiration content. No screenshot was available to inspect. |
| Subscription/free split | Not approved | Do not assign features to paid tiers, promise prices, or make access decisions based on the DOCX's proposed split. Entitlement and commercial model require a separate owner decision. |
| Performance/accuracy figures | Not approved | Do not publish or commit to the catalogue’s 85–90% accuracy, <5% false-Typical, 10–20% unclear, 99.5% uptime, 3-minute p90, sample-size, or similar targets until measured and approved. |
| Partner, payments, clinical, regulatory, residency | Open hard gates | Treat lab listings, availability, pricing, payment, report delivery, clinical content, intended use, regulator classification, data location and support coverage as unverified until evidence and named approvals exist. |

The catalogue’s assertion that the 74-day plan corresponds to “one sperm cycle” is not adopted. A 74-day default is only a configurable habit-planning duration. The catalogue’s performance thresholds and subscription labels are proposals, not commitments. The referenced D1–D17 decision sheet was not supplied, so it cannot be treated as an approved decision record.

## 0.4 Non-negotiable product and safety rules

1. No exact sperm count or numeric motility output from a home-video pre-screen to the user; any patient-facing interpretation stays disabled until separately validated and authorized. Numerical values copied from a signed lab report may be shown with “from your lab report,” units, date, method/range, and provenance.
2. No overall fertility/recovery/health score. The only 0–100% metric is explicitly named **plan consistency** and measures behavior completion only.
3. No model or LLM diagnoses, prescribes, changes care pathways, or decides urgency. Deterministic clinically approved rules do that.
4. A pipeline error, out-of-distribution input, unknown calibration/depth, model disagreement or failed quality gate must never yield a reassuring/green result.
5. Sudden severe testicular pain, injury, or other clinician-approved emergency trigger bypasses intake, commerce and AI availability; show approved urgent guidance immediately, including offline.
6. A lab, price, pickup, slot, ETA, turnaround or test capability is shown only when verified by that partner. Simulation labels are always visible.
7. No claim of no queue, zero wait, unattended sample drop, no clinician involvement, guaranteed turnaround, accuracy or recovery unless supported and approved.
8. The user's booking choice is not a prescription or clinical authorization. Orders requiring authorization wait for it.
9. The user previews exactly what is shared, with whom, why, which fields and until when. Decline prevents dispatch; private app use remains possible.
10. No health information in push lock-screen text, telemetry, analytics events, model prompts, URL query parameters or staff views unless specifically authorized and strictly required.

---

# PART 1 — PRODUCT PURPOSE, USERS AND COMPLETE JOURNEY

## 1.1 Purpose

Panacea is a private front door to reproductive-health action. Its distinctive job is not to guess fertility; it is to connect an informed user to an appropriate test, a real or transparently simulated lab handoff, a source-backed report and an owned follow-up.

## 1.2 Target user and intended setting

A man who has not visited a clinic, may feel embarrassed or uncertain, and wants a private first step. Dubai-first is the confirmed planning direction, but no live Dubai service coverage is confirmed. Arabic and English are initial language candidates. Any retained Abu Dhabi example is synthetic only. Production geography and local legal classification require explicit verification.

## 1.3 Two choices, equal access

### Path A: at-home pre-screen

- Semen only in the first release.
- Requires a supported clip-on lens or microscope/phone adapter, a supported fixed-depth chamber and a compatible device profile. Similar magnification does not prove equivalent calibration.
- The user can skip it and book a lab directly. No kit purchase is required to access Path B.
- A user's own video/CASA model output remains research/prototype until the intended use, performance, device profile, comparator and regulatory status are established.

### Path B: diagnostic laboratory test

- Semen analysis is the only initially bookable test. Later blood tests appear only when a reviewed pathway indicates them and a clinician/partner authorizes them; an RBC count is not a general fertility screen.
- For an eligible location within 5 km, show home collection only when the partner accepts that specimen type, has capacity and can meet its handling window. Distance alone never establishes sample viability.
- Beyond 5 km, show centre appointment slots. The user gets a ticket and a pre-arrival checklist, not a promise of queue-free attendance. Staff still confirm identity, safety and specimen acceptance. Sample drop-off is available only if the lab explicitly supports it.
- Low-interaction means “avoid repeating the whole story and reduce avoidable waiting,” not “no doctor,” “no identity checks,” or “leave a sample unattended.”

## 1.4 Real-life example: Omar

Omar opens Panacea in Arabic. He reads a short privacy note, creates a private account and chooses to answer health questions. He selects “I want to understand my reproductive health.” The app asks relevant base questions and only the follow-ups triggered by his answers. A sudden severe-pain answer interrupts the flow and shows the clinician-approved urgent instruction; it does not show tests, shopping or a routine booking.

Omar has no supported lens. He can continue to Reports and Care without buying a kit. The reviewed rules explain why semen analysis is suggested, what it can and cannot answer, prerequisites and whether clinician authorization is needed. Omar can mark a recent test as already done and upload it for review. He keeps or removes each test from his basket; the app does not manufacture a sale.

He chooses “Book a lab test.” He enters or confirms a collection address. The verified partner site is 3 km away, but home collection appears only if the partner's capability record says semen collection is accepted, a slot is available and the handling window is feasible. Omar sees complete price, collection fee, slot, estimated report time, cancellation terms and the exact summary fields being shared. He approves that named recipient and purpose. Checkout revalidates quote and slot. In the demonstration build, the transaction is labeled simulated.

The partner confirms the booking. Omar receives an opaque ticket with no health detail and the partner's signed, versioned instructions. At the centre, a staff member scans the ticket and performs required checks. Panacea shows only confirmed partner events; it does not advance the sample by timer. If the sample is rejected, the lab supplies the reason and decides whether a new specimen is required; the new specimen is linked to the original booking.

When the lab delivers a signed report, Omar sees a neutral notification, opens the original PDF, checks any extracted rows, and can ask about a confirmed line. The answer cites the exact report date, value, unit, reference range and page/row. A critical lab finding creates a human-owned contact task; an app message alone cannot close it. Omar may follow clinician-reviewed general habits. At the plan checkpoint, the consistency percentage describes actions completed, not health. It never cancels a retest or clinician follow-up.

## 1.5 Stay Alert: pending action ownership

Every unresolved action displays: what is known, what remains unknown, the last confirmed event and timestamp, the person/team responsible next, the expected next contact window if verified, and an accessible way to ask for help. A viewed message or acknowledged referral is not proof of care. Referral receipt and completed evaluation are separate states. A critical task cannot be closed by an AI, push delivery, patient read receipt or elapsed time alone.

---

# PART 2 — FEATURE CATALOGUE, ADDITIONS AND RELEASE STATUS

The new DOCX expands the prior product outline. This blueprint incorporates useful capabilities into the architecture and backlog, but inclusion is not approval to expose them as live clinical services, charge for them, or promise performance. See Appendix C for the feature-by-feature mapping of Core, A1–A21, B1–B16 and C1–C13.

| Capability group | Planned phase | Baseline behavior | Release gate / boundary |
|---|---:|---|---|
| Panacea identity, random alias, consent centre, privacy, discreet mode, neutral notifications, Help/About and data-rights controls | 1 | Private account; alias where feasible; purpose-specific consent; neutral lock-screen copy; user can request export/deletion | Identity/recovery, consent wording, accessibility, deletion lifecycle and privacy review. Do not promise instantaneous erasure from backups or partner copies. |
| Health Check, adaptive questions, Your Decision, Screening & Referral, Risk Flags and Risk-Factor Bridge | 1 | Versioned intake with unknown/prefer-not-to-say, pause/resume/edit; no score; results are only approved rules with reason and next action | Clinical owner approves questions, translation, urgency rules, colors/wording, scope and escalation. Do not activate unapproved green/yellow/red rules. |
| Flexible plan, Today, Plan Priorities, Re-Check, adherence and reminders | 1 | Select 30/40/60/74/90/custom; 74 is recommended; user-confirmed routine; effort-only consistency; care task remains separate | Clinician-approved content where needed; device permission; no health prediction or retest inference from adherence/wearables. |
| Wearable Connectors and Sleep/Activity Trends | 1–2, optional | Read-only HealthKit/Health Connect categories that the user grants; show source/date and “no data” distinctly | Verify platform APIs, per-category consent and data mapping. No hormone, sperm, fertility, stress or unsupported sleep-stage/recovery claims; wearable data cannot change care priority or retest without a separately approved rule. |
| Report Vault, OCR draft, confirmation, Report Explainer, Direction View and Hormone Reports | 2 | Secure report upload; extracted data stays draft until user/authorized reviewer confirms; explanations cite source and method | Region/language/retention/security review; clinical content approval; never infer missing values or compare non-comparable reports. Hormone values come only from a report. |
| Clinician Summary, Care Navigation, Lab Booking & Referral, Stay Alert and outcome tracking | 2 | User-generated selective summary; simulated partner workflow for demo; pending actions retain owner and last confirmed event | Named partner, signed terms, current capability/quote/slot/SOP, privacy and data-sharing approval, qualified human follow-up and operational support. No booking or referral is implied by a mock screen. |
| Lab Partner Self-Registration | 2, restricted submission only | Candidate lab submits identity, licence/evidence, contact, location and services into an unlisted review queue | Human verification of licence, site, capability, price/availability, quality, contracts, security and scope before listing. Uploading a form never auto-publishes a lab or enables booking. |
| Symptom Tracker, Health Library, Know Your Normal, Life Stages | 2 | User-reported timeline and reviewed educational content; clearly separate facts, estimates and unknowns | Clinician/editor review, language review, source/version/expiry metadata, privacy review; self-awareness is not screening or diagnosis. |
| Erection Check and Mood Check-In | 2, gated | Only reviewed instruments and score interpretation, with an appropriate human-support route | Confirm instrument licence, intended use, translation/validation, scoring, safety follow-up and local support owner before release. No diagnosis or therapy claims. |
| Food Photo & Barcode, Nutrition and optional retailer links | 3/4, deferred | Manual logging first; later photo/barcode estimates are editable and user-confirmed | Data-source/license, nutrition accuracy, allergens, portion uncertainty, consent and safety review. No food-as-treatment claims, no inferred medical diet, and no assumed retailer ordering API. |
| Home Test, purpose-built kit, banded concentration, morphology/DFI/vitality ideas, On-Device First Pass | 3, research-only | Capture/QC and research trace on approved fixtures; patient-facing technical quality only | Device-specific analytical/clinical validation, comparator, ethics, regulatory/clinical authorization, privacy, data retention and safety owner. No patient band, exact number or diagnosis until a separate release gate is met. |
| Learning Decision Engine, The Flywheel, Federated Learning, DFI Deferral Check, Safety Scorecard | 4, research governance | No self-learning clinical decisions in the baseline. Safety reporting only from measured, reviewable evidence. | Separate ethics, consent, dataset rights, external validation, bias/failure analysis, model governance and kill switch. No arbitrary journey-count threshold or unmeasured performance promise. |
| Lab Connect, Clinician Dashboard, Watch Companion/Voice, inherited-disease content, India-first adaptation, preconception/couple features | 4+, individually gated | Not needed for the first coherent journey. Couple View remains parked unless the owner changes that decision. | Each needs its own intended use, partner/clinician, privacy/security, localization, validation and operational approval. India expansion is a separate market decision; Dubai-first remains baseline. |

**Commercial note:** The suggested Free/Subscription split is deliberately omitted from the implementation baseline. No feature entitlement, purchase, renewal, price, or payment flow is authorized by the supplied catalogue.

**UI note:** Build a Panacea design system with responsive typography, spacing and touch targets; light/dark and discreet surfaces only if reviewed; Arabic RTL support; Android/iOS-native navigation, permissions and haptics where appropriate; and explicit loading, empty, success, offline, pending, retry and error states. Animations should clarify state and remain reduced-motion accessible. No inspirational screenshot was present in the attachments, so no screenshot-specific visual decisions are asserted.

---

# PART 3 — MICROSOFT-CENTRIC TECHNICAL ARCHITECTURE

## 3.1 Recommended stack

| Layer | Recommended choice | Rationale / guardrail |
|---|---|---|
| Native mobile | Cross-platform app required; React Native + TypeScript is a candidate pending proof; native development builds if selected | Framework is unconfirmed. Prove camera, identity, native health permissions, Arabic RTL, accessibility and Android/iOS lifecycle behavior before selection. Share domain contracts, not camera internals. |
| Web demo/partner desk | React + TypeScript, accessible responsive web app; separate patient and restricted partner routes | Browser demo improves judge reliability; partner portal uses same contracts, tenant/role restrictions. Never treat web camera assumptions as native parity. |
| Identity | Microsoft Entra External ID, OIDC authorization-code + PKCE; system browser; secure token storage | No client secret in app. Verify tenant, recovery, local obligations and user experience before real enrollment. |
| API | ASP.NET Core on current supported .NET LTS, modular monolith | One deployable core; modules own data and communicate through interfaces. Avoid premature microservices. |
| Gateway | Azure API Management before pilot | Token enforcement, quotas, versioning, routing and partner-facing policy. |
| Hosting | Azure App Service for API; Azure Functions or Container Apps jobs for workers | Keep online request handling separate from long video/OCR processing. Choose after region, runtime and load checks. |
| Structured data | Azure SQL Database | Source of truth, transactions, outbox/idempotency, row-level security as defense-in-depth. |
| Files | Private Azure Blob Storage; quarantine and separate originals, artifacts and exports | Anonymous access off, short-lived scoped uploads, encryption, version/lifecycle controls and deletion evidence. |
| Messaging | Azure Service Bus + transactional outbox | At-least-once delivery, deduplication, retry/dead-letter and replay-safe workers. |
| CASA inference | Containerized Python inference on Azure Container Apps Jobs/worker or equivalent verified compute; ONNX Runtime where compatible | CPU-first benchmark; GPU only if measured need and region/cost/security support. No model receives identity. |
| Report extraction | Azure AI Document Intelligence only after region/language/data checks; rule-based parser and mandatory confirmation | OCR is an extraction aid, not clinical interpretation. Manual-entry fallback always present. |
| LLM | Azure OpenAI only for constrained explanation/navigation if model+region+data handling approved; otherwise templates-only | No clinical decisions. No identifiers/raw report/video. Prompt inputs are minimized and server-built. |
| Search | Azure AI Search over clinician-reviewed educational content only; no personal health records in shared index | Static local approved content is fallback. |
| Secrets/keys | Key Vault + managed identity | No secrets in code/config committed to git. |
| Monitoring | Azure Monitor + Application Insights with telemetry redaction; alerts on operational metrics | No health values, symptoms, report text, prompts, tokens, SAS URLs or patient identifiers in logs. |
| Infrastructure | Bicep; GitHub Actions OIDC federation to Azure; separate environments/subscriptions as feasible | Reproducible, least privilege, no long-lived cloud secrets. |
| Mobile distribution | EAS builds / internal testing, TestFlight for iOS, Android internal track/AAB for pilot | Store review and health-app requirements need separate review; do not claim sideloading is a public release path. |

## 3.2 Residency decision rule

The blueprint's prior statement “all personal data in UAE North where service exists; nearest region otherwise” is not proof of residency or compliance and conflicts with a strict no-foreign-identifiers rule. Apply this safer rule:

1. Inventory location for identity, SQL, Blob, queues, inference, AI/OCR, backups, telemetry, support access and disaster recovery separately.
2. Verify current Azure product/region availability from official Microsoft sources and record date, SKU, feature, data flow, evidence and owner in `docs/verification-log.md`.
3. Do not send identifiers or health data to a non-approved location. If a necessary service cannot be verified in an approved location, use a local/template/manual fallback or keep the feature disabled. No automatic cross-region fallback with personal records.
4. Document any permitted de-identified exception only after privacy/legal approval, data minimization and user disclosure. De-identification is not assumed just because names were removed.
5. Confirm backup replication, support access and abuse-monitoring flows, not just the primary resource region.

## 3.3 Logical architecture

```text
Cross-platform patient app (framework pending) / browser demo / restricted partner portal
      | OIDC PKCE, HTTPS; client uses relative API routes
      v
Azure API Management (pilot gate) -> ASP.NET Core modular monolith
      |-- Identity & consent
      |-- Questionnaire, deterministic clinical rules, basket
      |-- Partner adapter / quote / slot / booking / order state
      |-- Reports / provenance / user confirmation
      |-- Plan, Stay Alert, reminders and data rights
      |-- Ask tool router (read-only, policy-enforced)
      |-- Admin/content/versioning (no user-record browsing)
      +--> Azure SQL (transactional source of truth + outbox)
      +--> Private Blob: quarantine / reports / media / artifacts / exports
      +--> Service Bus --> isolated workers
                              |-- upload scan / report OCR & extraction
                              |-- CASA quality + inference stages
                              |-- partner event and report ingestion
                              |-- notification dispatcher
      +--> Azure OpenAI / Document Intelligence only when approved
      +--> Azure Monitor with strict redaction
```

## 3.4 Backend modules and boundaries

`Identity`, `Consent`, `Questionnaire`, `ClinicalRules`, `TestCatalog`, `PartnerIntegration`, `Orders`, `Specimens`, `Reports`, `SemenResearch`, `Plan`, `StayAlert`, `Ask`, `Notifications`, `DataRights`, `Admin`, `Audit`, and `Shared`. Each module owns tables and exposes application interfaces. The monolith is not a permission bypass: every repository query and worker applies user/assigned-partner scope.

Keep two separate result domains:
- `PreScreenRun`: research/prototype capture outputs, model/pipeline provenance and uncertainty; cannot masquerade as a lab report.
- `LabReportVersion`: original signed artifact, partner identity, signature/status, report date, confirmed extracted values and correction lineage.

---

# PART 4 — ACCOUNTS, ROLES AND CONSENT

## 4.1 Account and recovery

User selects language, receives a server-generated random handle, and may use optional email/phone for account recovery. No real name is required for app account creation. Lab identity requirements are separate and collected only when the partner needs them, with explanation and consent. If no recovery method is set, warn that losing the device may mean losing account access. App stores tokens only in iOS Keychain/Android Keystore through a maintained secure-storage module. Server maps validated `(issuer, subject)` to internal random `UserId`; never accept a client-supplied UserId as authorization.

## 4.2 Roles

- Patient: own records and grants only.
- Collector: assigned booking and minimum handover details only; no questionnaire/history.
- Lab technician: assigned specimen, processing data and report tasks for the partner/site.
- Clinician/lab director: authorized review/sign-off and critical escalation tasks.
- Partner administrator: partner configuration and assigned operations, not global patient search.
- Panacea support: no record browsing by default; user-granted, time-limited, reason-coded access with audit.
- Panacea platform admin: feature/content/configuration but no clinical record access.
- Service worker: narrow managed identity and resource-specific permissions.

## 4.3 Consent keys and enforcement

Each consent is independent, versioned, timestamped and purpose-bound. A new text/version requires renewed consent where appropriate. Server checks consent on each request and again when queued work begins.

| Key | Purpose | Withdrawal effect |
|---|---|---|
| `app_data` | Store answers and plan | Stop new storage-dependent actions; explain account limits |
| `reports_store` | Store reports | Stop new report storage; start documented deletion/retention process |
| `reports_ai` | Let assistant use confirmed report values | Disable report tools immediately; keep report accessible to user |
| `semen_media` | Store/process video for research/pre-screen | Stop queued processing; purge media/derived artifacts per approved lifecycle |
| `share_clinic` | Share chosen fields with named clinic | Stop future dispatch/access; cannot recall data already delivered |
| `wearable_read` | Read authorized health summaries | Stop reads/sync; retain/delete prior data per user's choice and policy |
| `research` | Optional de-identified service research | Off by default; stop future use after withdrawal |
| `noon_assist` | Build item links/list if enabled | No diagnosis/user ID in links; disabled feature does nothing |
| `notifications` | Neutral operational reminders | Disable delivery; in-app state remains authoritative |

**Summary-pack grant** is distinct from general consent: recipient, purpose, exact field list, expiry, created/revoked times, consent version and delivery receipt. Revocation blocks future retrieval but does not pretend to erase a copy already received by the lab.

---

# PART 5 — DATA MODEL, EVENTS AND STORAGE

## 5.1 Data principles

- SQL is source of truth for structured state; Blob is private artifact storage. No spreadsheet is a production store.
- Every health fact has `source`, `status` (confirmed/unconfirmed/unknown/outdated), observed time, local date/time zone, unit and source record.
- Unknown is NULL/status, not zero or a negative answer. Never overwrite history; append versions/events.
- API derives `user_id` from validated token. Partner queries additionally filter by tenant, assigned site and assigned order. SQL RLS is a second layer, not the sole authorization.
- Store explicit provenance: original report, OCR engine/version, manual correction, reviewer, model/pipeline version and timestamp.

## 5.2 Core entities

`User`, `ExternalIdentity`, `ConsentRecord`, `QuestionnaireDefinition`, `QuestionnaireResponse`, `ScreeningRun`, `TestDefinition`, `Partner`, `PartnerSite`, `PartnerCapability`, `Quote`, `SlotHold`, `Order`, `ConsentPack`, `PaymentAttempt`, `Specimen`, `PartnerEvent`, `ReportDocument`, `ReportVersion`, `ReportExtraction`, `ReportValue`, `ReportSummary`, `FollowUpTask`, `CareReferral`, `Plan`, `PlanAction`, `PreScreenSetup`, `Calibration`, `PreScreenSession`, `MediaUpload`, `PipelineRun`, `PipelineStage`, `ModelRegistryEntry`, `Notification`, `IdempotencyRecord`, `OutboxMessage`, `AuditEvent`, and `FeatureConfig`.

Key fields include immutable IDs, tenant/partner scope, status/version, created/updated UTC timestamps, local timezone where relevant, external partner reference (encrypted where necessary), idempotency key, consent/grant reference and audit provenance. Sensitive free text and identifiers are minimized and segregated from AI/search data.

## 5.3 Specimen order state machine

`Draft -> NeedsAuthorization (when required) -> QuoteReady -> SlotHeld -> PaymentPending (if used) -> PartnerPending -> Booked -> CollectorAssigned OR CentreCheckIn -> Collected -> InTransit (only if applicable) -> Received -> Accepted -> Processing -> ReportReady -> FollowUpPending/Complete`.

Exceptions: `HoldExpired`, `PaymentFailed`, `PartnerRejected`, `CollectionMissed`, `SpecimenRejected`, `RecollectionRequested`, `Cancelled`, `RefundPending`, `Refunded`, `ReportCorrected`. State transitions require a valid event and actor. Duplicate events are idempotent; older/out-of-order events are recorded but cannot regress state. Staff cannot mark accepted/released without required evidence. A rejected specimen cannot produce a report. Replacement specimens link to original specimen/order with reason.

## 5.4 Outbox and idempotency

Every transaction that changes state and requires a message writes an outbox row in the same SQL transaction. Dispatcher publishes IDs only; worker loads scoped records. Consumers deduplicate by `(partner_event_id)` or `(aggregate_id, event_type, version)`. Retry with backoff; dead-letter after configured attempts; alert an operator. Mutating API calls require `Idempotency-Key`; reuse with same request returns same outcome, conflicting body is rejected. Never double-book or double-charge on retry.

## 5.5 Blob layout and lifecycle

Private containers: `quarantine`, `report-originals`, `report-json`, `semen-media`, `semen-artifacts`, `exports`. Paths use opaque IDs and tenant scope, not username or test names. Upload quarantine first. Validate signature/MIME/size/pages, scan for malware, then promote only clean artifacts. Anonymous access off, TLS, managed identity, short-lived narrowly scoped upload capability, no SAS URL in logs. Define retention, soft-delete expiry, versioning, backup and legal holds with counsel; user health files must not receive indefinite WORM retention by default. Deletion job covers original, versions, extraction, derived records, caches, exports and eligible backup expiry; retain only minimum non-health deletion audit as permitted.

---

# PART 6 — ADAPTIVE INTAKE, URGENCY AND TEST RECOMMENDATION

## 6.1 Questionnaire design

Use the existing five blocks and 26-question reviewed bank as the base, not as a claim that every possible clinical question is asked. Add conditional follow-ups only when answers materially affect safe routing or test choice. The owner-confirmed product instruction is: cover common, clinically relevant questions to understand the user's health and suggest appropriate tests; do not attempt an exhaustive physician consultation. Questions may include reason, symptoms/timing, relevant history, medicines, prior testing, and selected lifestyle factors when they alter the next step. Exact question text and rule content require clinical owner approval; do not invent missing clinician-approved content.

Each question supports `Prefer not to say`, `Not sure`, unanswered and edit; save after each answer; show why sensitive information is requested. Definitions are versioned English/Arabic. Unknown does not mean no. Use adaptive branching with traceable trigger rules. Collect only what changes routing or safe fulfillment.

## 6.2 Emergency bypass

Urgent detection must not depend on a remote LLM. Implement an on-device, conservative clinician-approved trigger table plus server re-evaluation. Sudden severe testicular pain and clinician-approved emergency signs immediately interrupt the flow and show approved local-language guidance and the locally appropriate urgent-care action. Keep this content available offline and before sign-in. Do not show routine booking, habit advice or commerce ahead of the urgent instruction. Human safety owner maintains approved versions and reviews false positives/negatives. This is not an emergency diagnosis service.

## 6.3 Four pathways

Deterministic clinical rules map approved inputs to: self-care/education, primary care, andrology/urology, or urgent assessment. Show plain language: what information was used, missing information, why this path, what to do next and who owns it. Colour is never the only cue. Rules are versioned, clinically approved, unit-tested and rollbackable. User edits create a new run; prior runs remain immutable.

## 6.4 Test recommender and basket

For each suggested test, display purpose, limits, prerequisites, whether a clinician order is required, expected cost only if verified, and what happens if the user already has a recent result. The user can select/deselect, mark already done, attach a report, or ask why. A prior result is considered but is not automatically declared equivalent: check date, test method, units, lab and clinician-approved recency. If no test is indicated, do not invent a sale. The user selecting a test is not a prescription. Authorization-required tests cannot proceed to confirmation until authorization is recorded.

First bookable test: semen analysis. The 26-question source may mention future blood tests only if clinically indicated, but they are not in the prototype test catalog. Additional blood testing requires separate partner capability, qualified collection, order requirements, service economics and release approval.

---

# PART 7 — LAB COMPARISON, 5 KM RULE, BOOKING AND LOW-INTERACTION COLLECTION

## 7.1 Location and 5 km rule

Store a user-supplied/confirmed collection location only as needed for eligibility; provide manual address/centre fallback if precise location permission is denied. Calculate the configured straight-line rule on the server from a user-confirmed address/pin and verified partner-site coordinate; retain the unrounded calculation for deterministic tests. Do not imply the phone's GPS or map pin is physically accurate to a millimetre. At or below 5 km, a home-collection option may be displayed only if location confidence is adequate and partner capability, sample handling window, operating hours, route capacity and slot are all confirmed. Near the boundary, where location uncertainty could change eligibility, ask the user to confirm an address or conservatively offer the centre option. Beyond 5 km, show a centre appointment. A partner can configure a smaller radius or disable home collection. Distance is not a viability guarantee. Do not infer road-time feasibility from straight-line distance.

Required boundary acceptance scenarios: exactly 5.000 km with capacity -> eligible pickup option; 5.010 km -> centre slot; 3 km but handling window/capacity invalid -> centre slot; denied location -> manual selection/centre route; no valid slot -> no fabricated availability.

## 7.2 Lab comparison screen

Show only a verified partner and its current quote. Fields: selected test(s), total charge including collection/booking fees, what is included, slot, centre vs pickup, report-time estimate with partner source/date, required visit(s), collection method, cancellation/refund terms, and any clinical authorization requirement. Revalidate quote and capacity before checkout. If price or terms change, require new confirmation. Do not simulate competition or imply multiple labs when only one exists.

## 7.3 Low-interaction centre visit

Offer scheduled appointments and a discreet ticket. Before arrival, show the partner's signed guide, required identifiers, eligibility/authorization and what to bring. At arrival the ticket retrieves the booking and only the consented minimal pack. Staff still do identity, safety, clinical authorization and sample acceptance. The app may support QR/opaque ticket check-in and queue status only if the partner provides actual status. Never promise “skip the queue” or “no conversation.” Suggested copy: “Your appointment is scheduled. The centre may still need to complete identity and safety checks; waiting time can vary.”

Sample drop-off is allowed only when a named partner's SOP explicitly accepts home-collected semen and defines container, labeling, time, temperature, transport and acceptance window. Otherwise show collection at centre or partner pickup. No unattended drop box by default. Blood collection is by qualified staff; user self-collection only for a sample the partner explicitly supports.

## 7.4 Consent pack and dispatch

Before sending, preview named recipient and exact fields: identifiers required by partner, selected tests, relevant answers strictly needed for fulfillment, optional user note, purpose, expiry, and revocation limit. Collector gets dispatch/handover details only, not medical history. User can deselect optional fields. Declining sharing blocks dispatch but does not block private features. Record grant version, field list, recipient, purpose, expiry, consent time, revocation and delivery receipt. Never send personal history to a lab simply because it exists in Panacea.

## 7.5 Checkout, payment and partner confirmation

Hold slot; verify authorization; obtain explicit price/terms confirmation; create one idempotent payment attempt if enabled; submit partner confirmation. If payment succeeds but partner confirmation is unknown, show `Pending`, reconcile through status/API/operations, then confirm or reverse/refund. Never tell user booking is confirmed solely because payment succeeded. Prototype uses a visible simulated checkout banner and no real charge. Pilot requires a UAE-appropriate payment provider, refund/dispute ownership, reconciliation, security and legal review.

## 7.6 Instructions and sample state

Display versioned, partner-approved collection instructions only after feasibility is confirmed. Missing/expired guide pauses collection; offer lab contact. Render factual timestamped events: booked, assigned, collected, received, accepted/rejected, processing, report signed/released. Status must come from partner or named staff, not timer. For missed pickup offer a new slot/centre appointment. For late/rejected sample show partner's reason and owner, arrange recollection only after lab decision. Keep original/replacement linked and never create a result from rejected material.

## 7.7 Partner adapter contract

Adapter operations: `GetCapabilities`, `GetQuote`, `HoldSlot`, `ConfirmBooking`, `CancelBooking`, `GetOrderStatus`, `Create/UpdateSpecimenEvent`, `DeliverSignedReport`, `Refund/Reconcile` where supported. Use a versioned canonical contract and partner-specific mapping. Simulated adapter and restricted portal implement the same interface as future API integration. A lab without API may use a restricted portal/manual signed report upload, with dual verification and audit. Never imply real-time integration if events are manual.

---

# PART 8 — REPORT VAULT, OCR, CONFIRMATION AND EXPLANATION

## 8.1 Upload and privacy

Before upload explain that reports may contain name, ID, DOB, phone and address. Offer crop/blackout, folded/covered guidance, or full upload by choice. User selects PDF/JPG/PNG. Record privacy mode for transparency, not as proof that PII is absent. Upload goes to quarantine; validate file signature, size/page count/password, malware scan, then OCR/layout. Infected/invalid file is rejected without entering the vault. Original stays as uploaded and is never given to an LLM.

## 8.2 Extraction pipeline and states

`Created -> Receiving -> Quarantined -> Scanning -> Extracting -> NeedsUserReview -> Confirmed -> Summarised` with `Rejected`, `ExtractionFailed`, `ManualEntry`, `Cancelled` branches. Each state has a user message and next action; no silent stop. On OCR failure, permit manual entry with exact source context and user confirmation. Rule-based parser first; any optional model-produced structure is checked against OCR source text, row and page. Low-confidence or conflicting values stay unconfirmed.

## 8.3 Mandatory review and provenance

Show source image/PDF and extracted rows together. Each row includes test name as written, value, unit, reference range as written, flag, confidence, page and crop/coordinates. User or authorized lab staff must confirm/edit each value. Store `ai_value`, `user_value`, original text, confirmation actor/time and extraction version. No unconfirmed OCR value enters screening, agent response, plan or comparison. Partner-delivered signed reports may follow a lab-authorized ingestion contract, but provenance/signature and correction flow still apply.

## 8.4 Summary schema and rules

Preserve exact values, units and dates. Do not round or convert without a verified conversion, and then retain both original and converted value with method. Keep missing fields NULL; lab reference ranges remain as written. A correction creates a new report version and invalidates the old derived summary. Template-generated plain text is primary; LLM wording only if every number/date/source assertion validates against confirmed values, otherwise use template. Summary must cite source date and report ID.

## 8.5 Ask about this report

With `reports_ai` consent, a server tool returns confirmed values only, with date, unit, range, flag and source row/page. The agent can explain what the line means in general terms, state uncertainty, and recommend using the report's clinician/contact instructions. It cannot diagnose, prescribe or invent follow-up. Comparable report trends require same test, compatible units/methods and approved comparability; otherwise show reports separately and say why. Original PDF remains downloadable.

## 8.6 Critical result handling

Partner protocol defines what qualifies as critical and who contacts the patient. Create an owned `FollowUpTask` with named role/person, priority, due window, escalation path and acknowledgement/resolution evidence. Neutral notification only tells user to open Panacea/contact their care team. Notifications disabled must not silence staff escalation. The task remains open until authorized human documents contact and resolution; read receipt is not completion.

---

# PART 9 — HOME SEMEN PRE-SCREEN AND CASA RESEARCH PIPELINE

## 9.1 Product boundary and intended use

The purpose of the home pathway is a guided, quality-controlled **pre-screen** that may help the user decide whether to seek a lab test. It is not a diagnostic semen analysis and cannot establish fertility, pregnancy likelihood, morphology, DNA damage, disease or exact concentration. Fixed-depth chamber, optics, phone, lighting, temperature, preparation and collection affect results. No single model's published metric proves performance on Panacea's hardware/users. The output from a research pipeline is not a signed lab report.

For an actual patient-facing decision-support product, obtain written UAE regulatory advice, clinical owner approval, intended-use definition, study ethics route, device-specific paired validation and required registrations/authorization. Until then, keep model outputs and all derived bands out of patient decision-making and outside the patient-facing result surface. A patient-facing “Typical/Low/Green” label can influence care just as a number can. Research/demo outputs are available only in a controlled, access-restricted environment with clear research labels and no care decision use. The patient may see capture-quality feedback and the lab route, but not a clinical interpretation. A server-side kill switch must disable processing/results without an app release.

## 9.2 Supported setups

- **S-A:** verified clip-on lens + compatible phone camera + named fixed-depth disposable chamber.
- **S-B:** microscope with phone eyepiece/camera-port adapter + objective + illumination/contrast profile + stage micrometer or known grid calibration.
- **S-C:** partner analyzer reserved; not first prototype.
- **No supported optics:** capture disabled; user can use questionnaire, reports and lab route.

For each profile record manufacturer/model, phone and OS, optics, objective/magnification, chamber type/depth/area, illumination, calibration date/value/evidence, supported outputs, validation status and restrictions. Magnification equivalence is not calibration equivalence.

## 9.3 Scripted guided journey

1. Explain pre-screen limits and label.
2. Check supported kit/chamber, clean sterile container, gloves and safe work area; “I have neither” leads to lab route.
3. Show only clinically approved sample preparation text. Blueprint's proposed abstinence and timing instructions must be verified against current clinical guidance and partner SOP before activation; do not present unapproved defaults as medical instruction.
4. Record required metadata with user consent: abstinence interval, collection completeness, sample time and relevant setup. Missing values remain unknown.
5. Setup-specific instructions; S-B requires calibration. If calibration fails/missing, disable calibrated metrics and use only a separately validated restricted mode; otherwise Unclear.
6. Live image with actionable quality messages. Capture is enabled only when device/profile and quality gates pass.
7. Record required number of distinct fields/clips only after clinical/device protocol is approved. Each clip is locally encrypted, hashed and resumably uploaded.
8. Show real stage trace on demo data, not fabricated progress. Failures say exactly what to fix and offer retry/lab route.
9. Result page includes mode, limitations, bands only if mode is approved, uncertainty/usable fields, what was not assessed, and lab route. Never show numeric internal CASA estimates.
10. Cleanup/safe disposal wording comes from approved guide.

## 9.4 Quality gate

On-device fast gate and server re-check. Candidate measurements: video signature/duration/resolution/frame rate, focus metric, exposure/clipping, illumination lock, field movement/drift, density/debris, usable field area, chamber/profile match, calibration, sample age metadata and upload integrity. Numeric thresholds are configuration by validated device profile, not universal constants. The blueprint's proposed 1080p/30fps, Laplacian, exposure, drift and field-count thresholds are hypotheses only; benchmark on supported devices before use. A failed gate never uploads silently and shows an actionable reason. Server distrusts client gate results and recomputes validation.

## 9.5 Candidate pipeline and model registry

All listed repositories/models are candidates, not approved dependencies. Before adoption, verify paper status, training population, task match, dataset permissions, repository license, code quality, reproducibility, model weights, runtime, security, data protection, performance and regulatory status. Record commit hash and artifact hash. Do not use a license guess or paper headline metric as commercial clearance or clinical evidence.

### Video branch (research mode)

- **Intake/setup:** consent, session ownership, profile, metadata, supported device and output constraints.
- **Upload/integrity/safety:** chunk completion, SHA-256, codec/container, malware scan.
- **Frame preparation and QC:** decode, stabilize/crop only within approved rules, score each clip; exclude bad clip with reason.
- **Debris/artifact flagging:** ACTIVE is a candidate detector; its reported impurity performance is modest and must be validated. Treat flags as review prompts, not automatic deletion. pycasa digital washing is also experimental and may alter cells; compare against unprocessed reference and do not silently remove data.
- **Detection/tracking:** pycasa is a candidate end-to-end CASA tool. WP4/Banerjee-Prasad is a candidate independent cross-check. Do not assume statistical independence merely because architectures differ. Evaluate both on the same held-out participants and device profiles.
- **Derived measures:** calculate kinematics in one deterministic, tested module from calibrated tracks. Ensure formula naming/definitions and units are harmonized; e.g., LIN, STR, WOB denominators must match the chosen CASA/WHO convention. Never compare outputs computed with incompatible calibration/tracking settings.
- **Disagreement gate:** threshold is defined prospectively with clinical/statistical owners. Disagreement routes to Unclear/human review; it does not average two models into truth. A fallback model is not presumed safer.
- **Banding:** only after validation protocol defines intended bands, uncertainty and thresholds. Until then, research reports may contain internal evaluation metrics only in restricted staff interface; patient surface remains non-diagnostic and numeric-free.

### Stained morphology branch

Not part of first patient pre-screen. Mask R-CNN SMIDS, Cellpose, MADRNet, CBAM-ResNet, MAML and SpermMorphoClassifier are research candidates. Different datasets/stains/labels can make their accuracy incomparable. Human morphologist reviews disagreements and all uncertain cells. No morphology claim in a consumer output without clinically accepted method, adequate validation and regulatory clearance.

### Vitality branch

OpenCASA membrane-integrity candidate and manual eosin-nigrosin count require human-sample validation and trained lab staff. A discrepancy (e.g., biologically implausible cross-field relationship) is a review trigger, not automatic correction. Not a home user measurement.

### Lab-only sections

DNA fragmentation, leukocytes, antibodies, acrosome, mitochondria, oxidative stress, chromatin, biochemistry and related sections are not inferred from a home video. They require actual test methods, qualified operators/instruments and lab sign-off. Do not include these in first release or generate placeholder values.

## 9.6 CASA orchestration and trace

Use a durable state machine backed by SQL state + outbox and Service Bus. Stage inputs are IDs only; workers load authorized data from Blob/SQL. Each stage is idempotent `(session_id, stage, attempt/version)`; output is committed before next event. Retry with bounded backoff; then defined safe fallback, dead-letter and operator alert. Stage logs contain outcome code/timing/model version, no health values. Example stages: S0 consent/session, S1 setup/calibration, S2 upload, S3 file safety, S4 frame prep, S5 server quality, S6 debris/artifact flag, S7 detection, S8 tracking, S9 features, S10 uncertainty/banding (gated), S11 deterministic explanation, S12 storage/audit, S13 lab routing. Failure at any stage never produces Green.

## 9.7 Validation program before any “validated” claim

1. Define intended use, population, device/chamber profiles, outcome, comparator lab protocol, collection timing, acceptable error and failure behavior before collecting data.
2. Obtain ethics/clinic/authority route and separate informed consent for videos, paired lab results and model training. Do not repurpose care data for training by default.
3. Verify external datasets (VISEM, HSTLI, SMIDS, HuSHeM, VISEM QC) licenses, terms and task/population fit. Public availability is not permission for all commercial/clinical uses.
4. Train/validate/test split by participant, not frame. Hold out entire people and at least one external site/setup; stratify by supported phone/optics and relevant image conditions. Prevent leakage between adjacent frames.
5. Compare paired recordings with a qualified lab reference under protocol. Report sensitivity for low bands, specificity, false-Typical rate, Unclear fraction, rejected capture rate, failure rates, calibration error and confidence intervals by device/setup/site. Include missingness and underrepresented configurations.
6. Pre-register thresholds and analysis; independent statistician/clinical review; publish measured dated performance and limitations. A target sample count (e.g., 150) is a planning estimate, not statistical adequacy by itself; calculate sample size for intended endpoints.
7. Drift monitoring: device mix, quality rejection, Unclear, model disagreement, lab agreement, complaints and adverse events. Named safety owner can suspend in minutes.
8. Only after these and regulatory/clinical approvals may a separately versioned validated mode be enabled. Feature flag, rollback and audit are mandatory.

---

# PART 10 — AGENTS, MODEL ORCHESTRATION AND PERMISSIONS

## 10.1 Agent roster

| Agent | Allowed work | Data/tools | Must not do |
|---|---|---|---|
| Intake explainer | Explain approved question, help save/resume | Approved questionnaire text | Decide pathway or invent clinical content |
| Rule engine (not an LLM) | Urgency, pathway, test eligibility, next action | Confirmed answers/results, versioned rules | Learn/change rules autonomously |
| Navigation helper | Open correct feature with concise response | Feature catalog/deep links | Claim feature exists when disabled |
| Booking helper | Explain quotes, compare verified partner offers, prepare booking | Server-scoped quote/slot/order tools | Spend, book, share, change test without explicit user authorization |
| Status helper | Read authorized order timeline | Partner events | Invent ETA/status or infer event from elapsed time |
| Report explainer | Explain confirmed report rows with source | Confirmed values, approved education | Diagnose, prescribe, cite unconfirmed OCR |
| Plan helper | Select reviewed habit templates and reflect progress | Plan state, consented preferences | Change treatment, promise recovery or block retest |
| CASA pipeline | Process image/video using versioned CV models | Approved media/setup profile | Use a language model to guess cells or clinical meaning |
| Report structurer | Draft OCR-to-schema mapping | De-identified OCR text only | See original files/identity or commit unconfirmed result |

## 10.2 Agentic orchestration principle

Use **bounded workflow orchestration**, not a free-roaming autonomous agent. A deterministic API/workflow coordinator decides which typed tool can be called, supplies the authenticated user context server-side, validates input/output, checks consent/role, records audit and asks for user confirmation before consequential actions. The model never chooses its own access scope or supplies an authoritative user ID/grant. Booking/payment/share/cancel actions require an explicit UI confirmation bound to a server-generated quote/order and idempotency token.

Example: “Where is my sample?” If last partner event is `Collected`, answer “The collector marked it collected at [time]; the lab has not yet confirmed receipt.” Do not say “on its way” unless a verified transit event exists.

## 10.3 Ask workflow and safety

`Authenticated request -> consent/role checks -> emergency keyword/rule route -> intent classification -> allowlisted read-only tool -> structured source pack -> optional LLM draft -> validator (numbers/dates/claims/language) -> response with source citation and action link`.

Tool set: latest screening summary, pre-screen bands/reasons (no internal numbers), confirmed report summary, plan status/consistency definition, current order timeline, reviewed education search, feature navigation. The server adds user identity; model cannot ask for another user’s record. No shared AI search index of personal records.

If AI is down/unapproved: templates-only mode. Urgent content, report access, original PDF, actual order status and booking must still work without LLM. Validator rejects unsupported numbers/dates, diagnosis terms, guarantees, fertility claims or unsupported advice.

## 10.4 Model selection and evaluation

No universal “best model.” Benchmark currently permitted/available models on bilingual Arabic/English comprehension, source fidelity, refusal/safety, no-number leakage, latency, availability, cost and region/data handling. Use structured schemas, low-variance settings where appropriate, content filters and server validators. Do not fine-tune in prototype. Do not pass raw video/images to a conversational LLM. Version prompt, model deployment, tool schema and evaluation set; rollback by config. For CASA use task-specific computer vision, not a general vision/chat model.

---

# PART 11 — 74-DAY HABIT TRACK, STAY ALERT, CONSISTENCY AND RETEST

## 11.1 Purpose and language

Support daily habits and keep the next care action visible. The plan does not treat infertility, promise improvement, or prove biological recovery. Use “support,” “habit,” “checkpoint,” and “recheck”; avoid “cure,” “recover,” “100% health,” and “your result will improve.” Any biological timing statement and plan template needs clinician review.

## 11.2 Tiered presentation

- **Routine/maintenance:** light optional habits and the clinician-recommended retest date if one exists.
- **Follow-up recommended:** suitable clinician-reviewed habits, visible retest/referral action and Stay Alert task.
- **Critical/urgent:** human clinical action first. Optional low-risk generic habits may not obscure the urgent task; no plan screen before urgent guidance.

Plan tier is driven by deterministic approved care status, not adherence. It cannot change a clinical result or cancel referral.

## 11.3 Daily action mechanics

A plan is built from approved templates matched to preferences, allergies, accessibility and safe constraints. Avoid calorie targets, supplement doses, therapeutic exercise and food-as-treatment claims. Every action has schedule, local date/time zone, optional/skip/pause state, source/template version and explanation. User may complete, skip, pause or resume; missed days do not reset progress or streak history. “No action scheduled” is “Not started,” not 100%.

## 11.4 Consistency score (effort only)

`consistency_percent = completed_eligible_actions / eligible_scheduled_actions * 100`, rounded only for display. Show numerator/denominator and period. Exclude paused days and ineligible actions consistently; define this in product tests. Example: 15 of 20 eligible actions = 75% plan consistency. Label beside every display: **“This measures plan actions completed. It does not measure sperm, fertility, recovery, or whether you can skip a test.”**

Never call this “recovery score,” “health score,” “fertility score,” readiness prediction or test substitute. It may not be used by an agent to predict lab results.

## 11.5 Day 74 and optional 15-day continuation

Day 74 is a checkpoint, not an obligatory retest date or guarantee of a biological change. Use the clinician's recommended date when available. At checkpoint, show plan summary and both choices: “Follow the retest date” and “Continue optional habits for 15 days.” If a test/referral is due, the extension does not postpone, hide or disable it; the reminder remains visible and the user can book immediately. Do not pressure a user to wait for 100% completion. A later comparable report can show measured change but cannot attribute causation to the plan.

## 11.6 Stay Alert tasks

For every pending care action capture status (`NotStarted`, `InProgress`, `WaitingOnPartner`, `UserActionNeeded`, `HumanContactRequired`, `Acknowledged`, `Completed`, `Overdue`, `Cancelled`), owner, due window, last confirmed event, evidence and escalation. “Acknowledged” is not “completed evaluation.” If partner has not confirmed receipt, say so. Critical alert task owner and escalation route must be named before pilot.

---

# PART 12 — OPTIONAL WEARABLES AND NOON

These are not needed to complete the first patient-lab journey. Build after core safety and booking work.

- Wearables: opt-in, per-category HealthKit/Health Connect permission; read only sleep/activity/resting HR/HRV summaries supported by platform. Missing stays NULL. Explain that wearables do not measure fertility, hormones or sperm. Never change screening colour. Verify current platform data types/permissions and regional processing.
- Nutrition: only reviewed general food catalog, allergies/preferences respected, no claims that a food increases sperm and no supplement dosing. Meal-photo estimates require user correction and separate consent; defer.
- Noon: no assumed public customer API. Ask first; only item names in outbound search URL, copyable list as fallback, no health text/ID. Prices/stock belong to retailer. Automatic ordering remains disabled/Coming Soon and makes no network call.

---

# PART 13 — MOBILE, WEB, ACCESSIBILITY AND OFFLINE

## 13.1 Mobile framework decision remains open

Android and iOS are required product targets. React Native + TypeScript with maintained native camera modules is the current candidate, not an owner-approved framework. Before choosing, time-box a proof covering identity/PKCE, native camera capture and permissions, resumable encrypted upload, Health Connect/HealthKit access where applicable, Android/iOS lifecycle behavior, Arabic RTL, accessibility, app signing/distribution and dependency support. Compare with .NET MAUI if the delivery team's skills favor C#. Record the result as an ADR and obtain the owner's decision. Do not state “fully functional on both platforms” until parity tests pass on representative devices.

If React Native is selected, use native development builds rather than a preview-only runtime when native camera/health modules require it; choose one navigation, localization, server-state and local-state approach. Hide camera and platform-specific code behind interfaces. Pin supported dependencies and test native upgrades.

## 13.2 UI and interaction system

Use the name **Panacea** and the attribution **Developed with love by Syed** on appropriate brand/About surfaces. Design mobile-first for small phones and large text as well as tablets; do not shrink touch targets to fit. Establish design tokens for color, typography, spacing, elevation and motion. Use semantic color plus text/icon/status; never rely on color alone. Keep the home screen discreet and avoid sensitive health terms in notifications.

Build platform-adapted navigation and native permission prompts at the moment a user invokes a feature. Every asynchronous action needs a plain status, progress where measurable, cancel/retry/resume behavior, and an accessible announcement. Do not show invented percentage progress for server processing. Support skeleton/empty/error/offline/queued states, reduced motion, screen readers, focus order, contrast, large text and one-handed controls. Treat any later-provided UI screenshot only as visual inspiration; do not copy its content or brand.

## 13.3 Arabic RTL and localization

Arabic RTL from day one: logical start/end styles, mirrored directional icons where semantically appropriate, tested numerals/date conventions, Arabic clinical translation reviewed by a clinician and language reviewer. English/Arabic are the initial localization candidates; Hindi/Urdu and cultural adaptation are later work, not an implied launch commitment. Test every screen, error, PDF, notification and chart in RTL, including mixed Arabic/Latin units.

## 13.4 Offline and interrupted work

Urgent approved text and current plan are available offline. Questionnaire draft saves locally and syncs with conflict versioning. Upload media stays encrypted locally until resumable upload finishes; app kill resumes or offers discard. Mutations use idempotency keys. SQL/blob/queue unavailability never fabricates a result/status; show last confirmed timestamp and retry action. No offline new clinical decision except the approved emergency instruction; server re-runs deterministic rules.

## 13.5 Web demo and partner portal

Web demo is an explicit judge workflow with synthetic user and simulated lab/events. Each simulated screen/event carries a visible demo label. A second restricted staff session can acknowledge only an assigned order. No direct browser-to-localhost calls; use relative URLs/API gateway. Partner portal lacks global search; site-assigned order scope is enforced server-side. No production data in staging.

---

# PART 14 — API SURFACE (ILLUSTRATIVE V1)

All protected routes validate token, derive user server-side, enforce consent/role, validate idempotency and return one error shape: `{code, message_en, message_ar, retry, correlation_id}`. Do not include sensitive values in error telemetry.

| Method/route | Purpose |
|---|---|
| `POST /v1/users/init` | Bind validated identity to internal user; return random handle |
| `GET/PUT /v1/consents` | Read/set versioned consents |
| `GET /v1/questionnaire/current` / `PUT /v1/questionnaire/answers` | Versioned question bank and append-only responses |
| `POST /v1/screening/runs` / `GET /v1/screening/latest` | Deterministic rule run/result |
| `GET /v1/tests` / `POST /v1/test-baskets` | Definitions, suggestions and user-selected basket |
| `GET /v1/partners/capabilities` / `POST /v1/quotes` | Verified eligible providers and quote |
| `POST /v1/slots/holds` / `POST /v1/orders` | Hold/confirm with idempotency, authorization and consent pack |
| `GET /v1/orders/{id}` / `GET /v1/orders/{id}/events` | Authorized timeline, last confirmed state |
| `POST /v1/orders/{id}/consent-pack` | Explicit field-level share grant |
| `POST /v1/reports` / `GET /v1/reports` / `PATCH /v1/reports/{id}/confirm` / `DELETE` | Upload, review, confirm and delete |
| `GET /v1/reports/{id}/summary` | Confirmed source-linked values only |
| `GET /v1/semen/kits` / `PUT /v1/semen/setup` / `POST /v1/semen/calibration` | Setup and research calibration |
| `POST /v1/semen/sessions` / `POST /v1/semen/sessions/{id}/uploads` / `POST .../complete` | Session/media lifecycle |
| `GET /v1/semen/sessions/{id}` | Stage and permitted bands only; no internal numeric model output |
| `GET /v1/config/semen-gate` | Profile-specific gate config with version/expiry |
| `GET /v1/plan/today` / `POST /v1/plan/actions/{id}/complete` | Plan/actions and consistency calculation |
| `GET /v1/follow-ups` / `POST /v1/follow-ups/{id}/acknowledge` | Stay Alert status (acknowledgement not completion) |
| `POST /v1/ask` | Constrained assistant with server-scoped tools |
| `POST /v1/data/export` / `DELETE /v1/data` | Export and deletion request |
| `GET /v1/features` | Feature/region/release flags |

Partner webhooks require signature verification, replay protection, partner tenant mapping, event ID dedupe and schema version. Staff portal mutations require audit actor, assigned order and permitted transition.

---

# PART 15 — FAILURE HANDLING: NO BROKEN CHAIN

| Failure | Required behavior and user-facing next step |
|---|---|
| Network down during intake | Preserve encrypted draft, urgent guidance remains available, resume later |
| Location denied | Ask manual address/centre selection; do not block private features |
| No eligible home collection | Offer centre slot and factual reason; no viability inference |
| Quote/slot changes | Invalidate old confirmation, show new total/slot, require reconfirmation |
| Payment succeeded, partner unknown | Pending + reconciliation; confirm or refund; no duplicate payment |
| Partner event duplicated/out of order | Idempotent record; timeline does not duplicate/regress; audit discrepancy |
| Missed pickup | Show owner and offer reschedule/centre visit; no silent timer status |
| Sample late/rejected | Partner decision/reason; no report from rejected sample; recollection linked to original |
| Upload interrupted/app killed | Encrypted local queue, resume from confirmed chunk, verify hash |
| Phone storage full | Stop before capture; protect prior clips; free-space instructions |
| Consent withdrawn mid-job | Worker rechecks, stops further processing/sharing, records deletion/retention action |
| Report infected/invalid | Reject in quarantine; no extraction; clear retry instructions |
| OCR down/uncertain | Manual entry/confirmation route; no guessed value |
| OCR unconfirmed value asked about | Agent refuses to quote as verified and opens review screen |
| Azure SQL unavailable | No new booking/screening mutation; show cached non-sensitive state and retry |
| Blob unavailable | Keep encrypted local copy; show waiting; no fake success |
| Service Bus duplicate/worker crash | Idempotent handler, retry/outbox, dead-letter/alert after bounded attempts |
| CASA quality fail | Identify actionable issue, retake or choose lab; no result |
| CASA model down/disagreement/OOD | Unclear or research failure; never Green; expose trace to authorized reviewer |
| AI/model unavailable | Templates, source report and real order status continue |
| Push failure | In-app task is source of truth; critical human escalation continues through operational channel |
| Unauthorized partner/user read | Deny; log non-sensitive security event; alert on suspicious pattern |

Targets such as 99.5% API availability or a 3-minute 90th percentile result are unapproved hypotheses only. Measure in the intended environment, approve with owners and publish only with evidence; they are not guarantees.

---

# PART 16 — SECURITY, PRIVACY AND UAE GOVERNANCE

1. TLS everywhere; managed identities service-to-service; least privilege; secrets in Key Vault.
2. Scope every read/write at API, repository, worker, partner adapter, portal and AI-tool layers. Security tests attempt cross-user and cross-partner access.
3. Minimize identifiers; random app handle; lab-required identifiers are segregated, encrypted and partner-limited.
4. Logs/metrics never contain report text, measurements, symptoms, prompts, answers, phone, tokens, SAS, addresses or raw model output. Apply redaction before telemetry leaves process; test automatically.
5. Staging/test use synthetic data only; separate tenant/apps/keys/storage/queues. Demo records have immutable `is_demo` and cannot affect plans, research, analytics outcomes or production reports.
6. Private Blob, public access off, private networking where supported; one-blob, upload-only, short-lived permissions if direct upload is used.
7. Retention schedule and deletion lifecycle cover soft deletes, versions, derived artifacts, caches, indexes, exports, backups and legal hold exceptions. Clearly explain backup expiry.
8. Research opt-in off by default; video training consent separate from service processing; no training use without explicit approved consent and governance.
9. Threat model: account takeover/recovery, object-level authorization, malicious file/upload, webhook spoof/replay, insider/partner overreach, queue poisoning, prompt injection in report/education text, model data leakage, device loss, token theft, denial-of-service and supply-chain/license risks.
10. UAE counsel/regulatory advisor must confirm applicable health-data, privacy, medical-device/SaMD, telehealth, lab, app, advertising and data transfer requirements for the actual Dubai-first pilot scope. The blueprint's cited Federal laws and DoH/DHA/EDE/MOHAP status are research leads, not legal conclusions. Do not infer the authority or registration route from a draft note.
11. Clinical safety file: intended use, hazards, controls, clinical owner, approved text/rules, model card, residual risks, escalation SOP, complaints/adverse event process and feature suspension owner.
12. Residency evidence lists each service/data flow, processing region, backup region, support access and date. Planned UAE region selection is not evidence.

---

# PART 17 — DEVOPS, TESTING AND RELEASE

## 17.1 CI/CD and configuration

Bicep infrastructure; GitHub Actions OIDC; build/test/scan on every change; deploy dev -> test -> staging with approvals; separate production gate. Database migrations use expand/contract. Clinical rules, question versions, Arabic content, prompts, gate thresholds and model versions are independent signed/reviewed artifacts with rollback. Feature flags: lab simulation/live adapter, home research, validated mode (off), Ask mode, report AI, wearables, Noon.

## 17.2 Mandatory test suites

- Rule boundary tests for every urgency/pathway and missing/unknown response.
- Emergency works before login and with AI/network off.
- 5.000 km, 5.010 km, invalid capacity/window, denied permission and no slot.
- Consent decline blocks outbound dispatch; precise data pack contents tested.
- Double tap/retry yields one order/payment attempt; quote change requires reconfirmation.
- Partner duplicate, delayed and out-of-order events cannot duplicate/regress.
- Rejected specimen cannot generate a report; replacement links correctly.
- Cross-user and cross-partner access tests through API, SQL, worker, portal and AI tools.
- Report malformed/oversized/password-protected/rotated/Arabic/low-light documents; PII masking; unconfirmed value cannot enter decisions/agent.
- Signed report correction creates new version and invalidates old summary.
- CASA golden clips: usable/unusable focus, exposure, drift, density, unknown depth/calibration, no cells, debris, device/OOD, corrupted video, model timeout and disagreement. Every stage fault-injected S0–S13 reaches defined state.
- Numeric leakage: no internal home count/motility/velocity/confidence metrics in API/client/log/push.
- Plan adherence math, paused days, zero scheduled, missed days and 15-day extension never suppress due retest/referral.
- Arabic RTL, screen readers, large text, neutral lock screen, interrupted upload resume.
- Malware/secret/dependency/license scanning, threat-model checks and external penetration test before pilot.
- Load/queue age/dead-letter dashboards and restore tests for SQL point-in-time recovery and Blob recovery.

## 17.3 Monitoring

Operational dashboard only: API errors/latency, queue age, dead letters, upload resume rate, worker stage outcomes, partner reconciliation backlog, payment discrepancy count, report pipeline failures, CASA quality-gate failures/Unclear rate (aggregated with privacy threshold), AI fallback rate, notification failures and spend. Alerts page named operators. No patient content in telemetry.

## 17.4 Release gates

A failed gate keeps feature in demo/research/off state. Required signoffs: clinical owner (questions, pathways, emergency, guides, plan, critical criteria); partner (test, site, capacity, fee, collection window, guide, rejection/recollection, report delivery, staff owner); privacy/legal (data map, consent, retention, regional processing, medical claims); security (threat model, pen test, restore); engineering/operations (load, cost, on-call, kill switch); regulatory advisor (classification/registration/ethics route); commercial owner (signed pilot terms and unit economics).

---

# PART 18 — PHASED DELIVERY AND SPEC KIT WORKFLOW

## 18.1 Sequencing rule

Build a coherent, testable journey with fewer real capabilities rather than many disconnected surfaces. Every phase has a bounded user outcome, explicit dependencies, a demo/pilot boundary, testable exit criteria and named human approvers. A catalogue entry is not an implementation commitment. Features that have not passed their gates stay off, simulated with a visible label, or research-restricted.

The phase sequence below is a planning baseline, not a schedule or cost estimate. No development deadline, team capacity, approved subscription model, named lab, production Azure subscription, clinical owner or regulator determination was supplied.

## 18.2 Phase 0 — Product decisions, constitution and solution proof

**Outcome:** A reviewable, non-code development contract and architecture baseline before product implementation.

**Work:** Confirm Panacea branding and appropriate attribution; Dubai-first scope; exact demonstration geography; intended first release and user journey; selectable plan durations; clinical boundary; data classification and consent; UI requirements; mobile framework evaluation; ownership of open decisions. Inventory service/data-flow/residency options; threat model; hazard/safety log; partner/self-registration boundary; design token and navigation prototype. Resolve whether any legacy Abu Dhabi demo fixture is retained as synthetic only.

**Spec Kit:** Establish the project constitution once; create separate feature specs for Foundation, Core Plan/Intake, Reports/Care, Home Research, and later expansion; clarify unresolved requirements; create plans/ADRs; requirements-quality checklists; tasks; cross-artifact analysis. No code implementation until blocking decisions and checklist items have an owner and acceptable resolution.

**Exit gate:** Owner signs decisions/ADRs; named clinical/privacy/security/regulatory/partner owners are identified or their work is explicitly deferred; framework decision is based on proof or remains a recorded hold; Spec Kit artifacts are approved; no unlabelled clinical or partner claim exists.

## 18.3 Phase 1 — Private, accessible Panacea foundation and core routine

**Outcome:** A functioning demo of private onboarding, consent, daily experience and a habit plan using synthetic/test data.

**Scope:** Brand shell; language and accessibility foundation; account/recovery proof; random app alias where supported; consent centre; privacy, discreet mode and neutral notifications; Help/About; export/delete request flow with honest retention limits; Today; versioned questionnaire and pause/resume; approved deterministic safety/routing rules only when signed off; source/date/unknown states; flexible 30/40/60/74/90/custom plan, 74 recommended; action/check-in history and effort-only plan consistency; local reminders; optional user-entered symptom and plan data. Wearable connectors/trends are optional and require per-category permission and platform proof; they do not alter clinical decisions.

**Out of scope:** Home-screen interpretation, unapproved triage, clinical prediction, medication change, paywalls, clinical retest dates inferred from a 74-day timer, smart watch direct pairing, or recovery/fertility scores.

**Exit gate:** Cross-user authorization, consent, local storage, offline emergency-content (if approved), accessibility/RTL, privacy/neutral notification, plan math, unknown-data handling, and tests pass; clinical content has an approver; prototype/demo labels are visible.

## 18.4 Phase 2 — Reports, care navigation and simulated lab loop

**Outcome:** A reliable demo from report upload or user choice through an explicitly simulated partner workflow to a source-linked report and human-owned follow-up.

**Scope:** Secure report vault, quarantine/scan, OCR draft and mandatory confirmation, source provenance, report explainer templates, comparable-report guardrails, direction view, user-selected clinician summary/PDF, symptom timeline, reviewed library/Know Your Normal, life-stage entry points, gated validated check-ins, Care route, simulated quote/slot/consent/order/state events, signed fixture report, Stay Alert and critical-follow-up drill. Lab partner self-registration is a restricted submission/review queue only: uploaded evidence is not verified automatically and never publishes a listing. Use simulated prices, availability and outcomes with clear labels.

**Exit gate:** Malformed-file, malware, OCR uncertainty/correction, data export/delete, consent withdrawal, object-level authorization, duplicate/out-of-order events, denied share, payment/partner uncertainty, and critical-task ownership tests pass. Real partner integration remains disabled until signed agreements and operational evidence exist.

## 18.5 Phase 3 — Home capture engineering and research-only pipeline

**Outcome:** A controlled technical demonstration of supported capture setup, upload, quality checks and versioned research trace.

**Scope:** Compatible device/profile design, calibration evidence, capture setup, user-visible quality feedback, encrypted resumable upload, isolated worker pipeline, stage trace, failure handling and kill switch. Optional on-device first-pass checks can only reject/accept technical capture quality; they cannot produce a patient-facing clinical result. No patient-facing Low/Typical band, numeric estimate, morphology, DFI, vitality, fertility or reassurance is enabled by this phase.

**Exit gate:** Device/profile-specific QC, consent/revocation, malware/file safety, failure/OOD/disagreement, isolation, model/license/data rights, research-only access, deletion, and no-number-leakage tests pass. Clinical/regulatory approval and device-specific validation remain separate gates for a later validated product mode.

## 18.6 Phase 4 — Pilot readiness and verified partner integration

**Outcome:** A go/no-go package for a narrowly defined real pilot, not an automatic launch.

**Work:** Name and contract a Dubai-area lab/provider; verify exact tests, site, serviceability, quote/slot, sample method/window, instructions, report authenticity, rejection/recollection, cancellation/refund, staff access, critical-result rota and support. Verify exact Azure service/SKU/region/data flows, backup and support access; legal/privacy/regulatory review; security and penetration tests; restore/replay drills; support/on-call exercise; payment reconciliation if used; build release controls and a limited, revocable feature flag.

**Exit gate:** All relevant clinical, partner, legal/privacy, regulatory, regional, security, operations, support, payment and commercial owners sign the exact pilot scope; no live feature is enabled merely because a Spec Kit workflow converged. If any gate fails, remain in demo/research mode or use a safe manual fallback.

## 18.7 Phase 5 — Research and expansion backlog

**Outcome:** Separately approved, evidence-led expansion proposals.

**Candidates:** Food photo/barcode estimates; retailer links; additional languages and cultural adaptation; clinician dashboard; lab connectivity/FHIR; measured safety scorecard; voice/watch companion; inherited-disease education; preconception plan; longitudinal outcomes; model learning/federated learning; expanded partner locations. Couple View remains parked by the supplied feature decision unless the owner explicitly reopens it. India-first is a later market proposal and does not change Dubai-first baseline. Each candidate gets its own spec, owner, consent/data-flow analysis, validation, operations and release gate.

## 18.8 Spec Kit is the required development process, not an accuracy guarantee

GitHub Spec Kit is an open-source toolkit for Spec-Driven Development. Its current documented SDD path is: project constitution once, then for each feature/phase **Specify → Clarify → Plan → Checklist → Tasks → Analyze → Implement → Converge**. The shorter path exists for small, low-ambiguity features; use the full quality-gated path for this sensitive, multi-domain product. The tool organizes artifacts and review; it does not guarantee accepted requirements, accurate code, safe clinical behavior, validated models, regulatory compliance or partner availability. Human product, clinical, privacy, security, regulatory and operational review remains mandatory. See the official [Spec Kit repository](https://github.com/github/spec-kit), [Quickstart](https://github.github.io/spec-kit/quickstart.html) and [Agentic SDD reference](https://github.github.io/spec-kit/reference/agentic-sdd.html).

Use the command form for the selected agent integration; GitHub Copilot commonly uses `/speckit-*`, while other integrations may differ. These are agent skills/chat commands, not terminal commands. Install and initialize Spec Kit using its supported instructions; do not assume the current project has already been initialized.

| Spec Kit step | Use for each feature/phase | Required artifact / human check |
|---|---|---|
| `/speckit-constitution` | Once in Phase 0; update only through reviewed change when principles change | Project principles in the repository’s Spec Kit memory/constitution artifact; owners, safety, privacy, accessibility, testing and maintainability rules. |
| `/speckit-specify` | State user problem, scope, observable behavior, user stories and acceptance criteria—what/why, not stack | Feature `spec.md`; keep separate requirements for simulated, research and live modes. The built-in requirements checklist may also be maintained. |
| `/speckit-clarify` | Resolve ambiguities before technology planning; record decisions and unknowns | Updated `spec.md`, clarification decisions and any linked ADR; unresolved hard gates remain explicit, not guessed. |
| `/speckit-plan` | Choose architecture/stack and interactions consistent with confirmed decisions; note alternatives and service-region evidence needed | Feature `plan.md`, diagrams/contracts and ADRs. Framework, region or partner uncertainty is labeled open. |
| `/speckit-checklist` | Review requirements quality before task breakdown; use for privacy, safety, accessibility, security and domain-specific criteria | Reviewer-owned checklist(s). Human reviewers mark items; checked means requirement quality reviewed, not code complete. |
| `/speckit-tasks` | Generate dependency-ordered implementation/test work for each feature; scope implementation to one phase at a time | `tasks.md` with setup/foundation/user-story/polish tasks, dependencies, tests, gate owners and parallelizable work. |
| `/speckit-analyze` | Read-only consistency check across spec, plan and tasks before implementation | Analysis report. Fix the owning source artifact and rerun until no blocking contradiction/gap remains. |
| `/speckit-implement` | Implement only the reviewed tasks for the current phase/feature; verify tests as work proceeds | Code, migrations, tests, build evidence and updated task status; never cross a hard release gate silently. |
| `/speckit-converge` | After implementation, compare actual code against approved artifacts; implement any appended gap tasks and repeat | Convergence findings and final `Converged` status; this is implementation completeness relative to artifacts, not clinical validation or sign-off. |

**Every phase folder should retain:** approved `spec.md`, `plan.md`, `tasks.md`, requirements/custom checklists, analysis findings and resolutions, ADRs, test reports, implementation/release evidence, gate approvals, and convergence result. Store clinical/regulatory/partner approvals as separately versioned evidence with named approvers and expiry/review dates. A phase is not closed when a command says “Converged” if external evidence or human approvals are missing.

## 18.9 Demo track and pilot track

**Demo track:** synthetic account; branded Panacea UI; English/Arabic shell; consent and accessible privacy surfaces; approved or fixture-labeled intake/routing; flexible plan; simulated partner, quote, slot and events; report fixture; human-owned follow-up exercise; visible prototype labels; technical home-capture QC only; explicit unavailable states for gated features.

**Pilot track:** begins only after Phase 4 signoffs and environment evidence. Start with one named site and limited test/service capability. Keep clinical home-model interpretation off unless separately validated and authorized. Never use demo accounts, fixtures, keys, blobs, queues, model flags or partner data in the real pilot.

# PART 19 — BACKLOG AND ACCEPTANCE CRITERIA

| Epic | Acceptance criteria (minimum) |
|---|---|
| E1 Identity/consent | PKCE; no name required for app; recovery warning; versioned granular consents; withdrawal blocks next request and queued work |
| E2 Intake | Base 26 questions versioned; conditional follow-ups; unknown/prefer-not-to-say; resume/edit; every change creates traceable new run |
| E3 Safety/routing | Offline emergency text; deterministic pathway reason/used/missing/next step; LLM-off test passes |
| E4 Test catalog | Only semen analysis bookable; test purpose/limits/prerequisites/order requirement; already-done report considered; no forced sale |
| E5 Two paths | Lab direct access without home kit; unsupported device disables only capture; clear research label |
| E6 Distance/partner | Exact 5km boundary cases; capability/window/capacity gates; only verified provider shown |
| E7 Consent/booking | Pack preview; denied share blocks dispatch; quote/slot revalidation; idempotent single order and payment attempt; simulated label |
| E8 Lab portal/state | Assigned-order access only; duplicate/out-of-order events; reject/recollect recovery; no timer-created status |
| E9 Report | Quarantine; malware/file validation; privacy crop; source side-by-side; unconfirmed excluded; exact values and provenance; correction versioning |
| E10 Critical follow-up | Named owner, acknowledgement separate from completion, notifications disabled drill succeeds |
| E11 CASA research | Supported profile, QC actionable failure, resumable upload, S0–S13 trace/fault tests, no number leakage, kill switch |
| E12 Ask | Navigation deep links; source-cited confirmed report answer; no diagnosis/dose; urgent route first; templates-only works |
| E13 Plan/Stay Alert | Local-date action uniqueness; adherence exact math; no health prediction; day74/15-day option cannot delay retest |
| E14 Data rights | Export package/link expiry; deletion across blobs/versions/derived data; backup expiry explained; audit minimized |
| E15 Platform security | CI, Bicep deploy, telemetry redaction test, cross-user/partner test, restore drill, staging synthetic-only |
| E16 Partner/operations | Signed capability/config, guide version, critical contact, missed pickup/rejected sample SOP and on-call owner recorded |

---

# PART 20 — COMMERCIAL MODEL AND PILOT

## 20.1 Prototype economics

No free/subscription split, price, subscription entitlement or paid feature has been approved. For judging, all prices, fees, availability, payment and partner confirmations are synthetic and visibly labeled. Do not imply revenue, partner agreement or market coverage. Avoid “no one else does this” unless a documented competitor review supports the precise claim. Safer statement: “Panacea is designed to combine a private intake, test booking, lab report and follow-up in one journey.”

## 20.2 Pilot agreement requirements

Written agreement must identify partner/site, tests, payer, price, booking fee, collection radius/method, operating hours, capacity, sample handling window, guide/SOP owner, identity/order rules, rejection/recollection/refund responsibilities, report signature/delivery, critical-result contact and escalation SLA, data fields/retention, service support, incident contacts, quality metrics and cancellation policy. Expression of interest is not a signed pilot.

## 20.3 Unit economics

Track contribution per valid report: user price + booking fee/revenue share minus lab fee, collection, payment fees, support, refunds, recollection/rejected samples, hosting/inference and partner operations. Measure completion, accepted-sample rate, turnaround, first-time valid report, referral completion, support contacts, cost per valid report and margin. Do not use habit adherence as a clinical outcome.

---

# PART 21 — RESPONSIBLE AI PACK AND MODEL GOVERNANCE

For each deployed model/tool maintain: owner, intended task/use, prohibited use, model/version/hash, source/license, training/evaluation datasets and permissions, demographic/setup coverage, performance with confidence intervals, known failure modes, input/output schema, retention/region, access control, human review threshold, monitoring, rollback/kill switch and change history.

**Model cards needed:** CASA detector/tracker and each preprocessing component; OCR/extractor; permitted explanation LLM; any risk/intent classifier. For LLM, test Arabic/English grounding, source citation, prompt injection, refusal, emergency-first behavior, unconfirmed-value refusal, hallucinated numbers and disable mode. For computer vision, participant-level splits, OOD detection, device-specific performance, false reassurance and quality rejection. Agreement between two models is not independent confirmation without evidence of error independence.

Every clinical-rule content set needs clinical approver, language approver, effective date, change reason, test suite and rollback. AI is not a safety owner; named humans are.

---

# PART 22 — JUDGING PARAMETERS: HONEST STATUS AND PROOF

These are **design-readiness statuses**, not competition scores or evidence of working software. No executable demo, partner agreement, validation study, residency check or load/restore evidence has been supplied with the planning inputs; therefore operational claims remain unproven until artifacts are produced.

| Judge parameter | Current design status | Evidence still required | Main risk |
|---|---|---|---|
| 1. Health impact / clinical relevance | **Moderate potential; not measured**. Private entry, urgent route, test handoff and signed report can reduce friction. | Baseline/problem data with sources; pilot completion and time-to-evaluation; valid report rate; referral completion; adverse-event review. | Home result or consistency score discourages needed care; unsupported clinical claims. |
| 2. Technical depth | **Strong architecture; implementation/validation unproven**. Durable workflow, eventing, QC and provenance are substantive. | Executable trace, stage-failure injection, device profile tests, measured latency/cost, model evaluation. | Broad multi-model list presented as evidence despite weak external validity and license uncertainty. |
| 3. Working solution | **Unscored/unproven until demo**. A complete Omar journey is demonstrable with labeled simulated partner. | One browser session patient, second authorized staff session, confirmed partner event, original signed fixture, return to user; recording backup. | Simulations mistaken for real integrations; overly long/fragile demo. |
| 4. Responsible AI / safety | **Strong design intent; controls must be demonstrated**. Deterministic rules, consent, human critical follow-up and model boundary. | AI-off emergency; denied cross-user access; unconfirmed OCR refusal; numeric leakage test; named escalation owner; model cards. | Recovery prediction, false reassurance, unbounded agent permissions, model agreement treated as truth. |
| 5. Deployment readiness | **Moderate design; operational proof outstanding**. Azure pattern and fallbacks are reasonable. | Region evidence, security review/pen test, restore drill, load/queue tests, cost estimate, on-call owner and incident exercise. | UAE region/residency assumptions or service availability unverified. |
| 6. Commercial viability | **Weakest until partner evidence exists**. Two-path model is coherent but not validated commercially. | Signed lab pilot terms, verified prices/capacity, payer/fee structure, unit economics per valid report. | Simulated single partner mistaken for live supply; no recollection/payment ownership. |

### Recommended judge demonstration (6–8 minutes)

1. Omar chooses Arabic, sees privacy/consent, answers a short adaptive intake.
2. Show emergency bypass in a separate test account with AI/network disabled.
3. Display semen test recommendation with purpose/limits; user chooses lab directly (no kit purchase).
4. Omar at 3 km sees pickup only in the eligible fixture; second user at 8 km sees centre slot. Show exact 5 km boundary in test evidence.
5. Preview consent pack; demonstrate denied-share blocks dispatch; then approve and simulated checkout.
6. In second authorized staff session, acknowledge ticket, mark sample received/accepted; replay duplicate event and show no regression.
7. Deliver signed report fixture; return to Omar, show neutral notice, original PDF and one confirmed source-cited explanation.
8. Simulate critical follow-up and show owner; disable push to prove operational escalation still exists.
9. Show consistency = 15/20 = 75% and explicit non-health disclaimer; show optional 15-day continuation while due retest stays available.
10. Show real quality gate on demo clips (one pass, one blurry failure), pipeline stage trace, prototype label and no numeric home output.

Always disclose which events are simulated, which are real, what is not validated, and what evidence is still open.

---

# PART 23 — VERIFICATION REGISTER (DO BEFORE BUILD / PILOT)

Create `docs/verification-log.md` with `item, official source, checked_at, result, SKU/model/version, region, data flow, owner, evidence link, decision, expiry/recheck date`. Required checks:

1. Azure region availability by exact SKU/feature: App Service, SQL, Blob, Service Bus, Functions/Container Apps, Key Vault, APIM, Monitor, Document Intelligence, AI Search, Azure OpenAI, container/GPU runtime, malware scanning.
2. Entra External ID current capabilities, tenant/region behavior, mobile PKCE/recovery samples.
3. Azure OpenAI model deployment region, data privacy/abuse monitoring, retention and permitted data handling.
4. Document Intelligence Arabic/PDF support and processing location.
5. Defender for Storage malware scanning availability/cost; approved fallback scanner if unavailable.
6. UAE privacy/health-data/medical-device authority, DoH Abu Dhabi/DHA applicability, clinical investigation/ethics, advertising and telehealth requirements with counsel.
7. Partner service facts: actual test, site, eligibility, collection radius, handling window, slot, price, report turnaround, signed guide, rejection/refund/recollection, contact ownership.
8. WHO manual/version and reference intervals; use only clinically reviewed interpretation. Verify NICE/local clinical follow-up only if relevant and current; do not blindly copy a retest interval.
9. VISEM/HSTLI/SMIDS/HuSHeM/VISEM-QC licenses, attribution, terms, data representativeness and publication facts.
10. ACTIVE, pycasa, WP4, morphology/vitality repository licenses, dependency licenses, model weights and commercial redistribution terms; scan transitive dependencies.
11. Noon API/link policy if Noon is later included; verify search URL manually and maintain copy fallback.
12. HealthKit/Health Connect data permissions and library compatibility if wearables are later built.
13. Expo/RN/VisionCamera and native module versions; Android/iOS camera format, background upload and app store rules.
14. Payment provider, refund/dispute/reconciliation and data processing terms before real charges.
15. Competitor claims: document search scope, date and sourced comparisons before making market-gap claims.

---

# PART 24 — ASSUMPTIONS AND OPEN GATES

| Item | Current planning assumption | Owner / required resolution |
|---|---|---|
| Pilot geography | Dubai demonstration setting; not a coverage claim | Product + UAE counsel confirm actual launch jurisdiction/service area |
| Partner | No live lab partner supplied; use simulated partner/portal | Commercial owner names lab and obtains written pilot terms |
| Payment | Simulated in competition build | Finance/legal/engineering select and verify provider before pilot |
| Microscope | Core technology demonstrator is included; full operational pipeline, but clinical interpretation disabled until evidence/approval | Clinical safety + regulatory lead define intended use and gate |
| Model list | User-proposed CASA candidates are inputs to evaluation, not approved final model stack | ML lead verifies code, data, license and comparative evidence |
| Questionnaire | Existing 26-question, five-block specification is the reviewed base; adaptive follow-ups needed | Clinical owner supplies source content and approvals |
| Doctor involvement | No teleconsult in initial scope; required authorization/review is never bypassed; future text/audio/video possible | Partner/clinical owner maps specific tests and oversight |
| Lab visit | Ticket and booked slot reduce repeated history; no queue-free or no-contact guarantee | Lab signs check-in, specimen acceptance and privacy SOP |
| Blood tests | Not bookable in initial release; future only if indicated and authorized | Clinical/partner/regulatory approval per test |
| Recovery plan | Consistency metric only, no health prediction; day 74 checkpoint and optional +15 days | Clinical owner approves exact templates and retest guidance |
| Time/deadline | No confirmed competition deadline or existing implementation status provided | Product owner supplies deadline/build state for schedule sizing |
| Canonical Google Doc | Pasted text is analyzed; no Doc URL/ID supplied for direct retrieval | Owner supplies link if exact Drive comparison is required |
| Hosting/residency | Microsoft-first; no region claim until exact service evidence recorded | Cloud/security/privacy owner completes verification register |

## Final go/no-go rule

Panacea may be described as **demo-ready** only when the synthetic journey executes and labels are clear. It may be described as **pilot-ready** only when the named partner, clinical, regulatory, privacy, region, security, restore, critical escalation and operational gates are signed and exercised. It may describe a home CASA mode as **validated** only after the predefined device-specific paired study, independent review, published measured performance and required authorization. No plan percentage or AI output substitutes for those gates.

---

# APPENDIX A — SERVICE STATE EXAMPLES

| Situation | Correct wording |
|---|---|
| Collected but no lab receipt event | “The sample was marked collected at 10:14. The laboratory has not confirmed receipt yet.” |
| Quote changed before payment | “The price or slot changed. Review the updated details before continuing.” |
| Sharing declined | “Nothing was sent to the centre. You can still use your private reports and continue another way.” |
| OCR uncertain | “We could not confirm this value. Please compare it with the report or enter it manually.” |
| Home video blurry | “This field is out of focus, so it has no result. Adjust focus and record again, or choose a lab test.” |
| Unsupported optics | “This setup is not supported for capture. Your other Panacea features still work; you can book a lab test.” |
| Sample rejected | “The laboratory did not accept this sample: [partner-provided reason]. The lab will decide whether a new sample is needed. Here are the next confirmed options.” |
| AI unavailable | “I can’t explain this automatically right now. Your original report and confirmed values are still available.” |
| 75% plan consistency | “You completed 15 of 20 planned actions. This reflects habit tracking only; it does not tell us whether your semen result changed.” |
| Day 74 | “This is your plan checkpoint. Follow the retest timing your clinician recommended, or continue optional habits for 15 days. You do not need to reach 100% before booking.” |

# APPENDIX B — MINIMUM PILOT HANDOFF PACKAGE

- Demo build and backup recording; credentials for synthetic Omar and restricted staff fixture.
- Device/profile compatibility list; supported and unsupported capture fixtures.
- Unvalidated-claims register and model cards; exact mode/feature flag state.
- Clinical content/rule versions, approvers and effective dates.
- Partner agreement, service capabilities, signed guides, escalation contacts and rejected-sample SOP.
- Consent/data map, retention/deletion record, regional service evidence and support access description.
- Security threat model, pen-test status, restore/load evidence and incident runbook.
- Actual costs and pilot economics assumptions; clearly separate measured from estimated.
- Open gates with named owner and due date; no item silently treated as approved.


---

# APPENDIX C — NEW FEATURE CATALOGUE CROSSWALK

The mappings below incorporate the supplied DOCX’s Core items, A1–A21, B1–B16 and C1–C13 into the revised release plan. “Phase” is sequencing guidance, not a commitment to implement or commercialize. No Free/Subscription labels are accepted. A feature marked gated remains unavailable until its listed review and evidence are complete.

| Catalogue item | Phase / disposition | Panacea treatment and gate |
|---|---|---|
| Core — Sign-Up & Random Name | 1 | Random alias and minimal identity where supported; authentication/recovery and abuse prevention remain required. |
| Core — Consent Centre | 1 | Independent, versioned, purpose-specific consent; withdrawal checked in queued jobs and partner dispatch. |
| Core — Permissions | 1 | Just-in-time per category; optional permissions cannot block unrelated private functions. |
| Core — Delete My Data | 1 | Deletion request and tracked lifecycle; no promise of instant deletion from backups, legal retention or previously delivered partner copies. |
| Core — Help & About | 1 | Clear screening-not-diagnosis boundaries, product identity and support contact route. |
| A1 — Today | 1 | Discreet dashboard; show only source-backed available data and no-data states. |
| A2 — Health Check | 1, clinical gate | 26-question/five-block baseline only after clinician and language review; unknown, pause, edit and prefer-not-to-answer supported. |
| A3 — Your Decision | 1, clinical gate | No score. Clinician-approved deterministic routing only; colors cannot imply fertility or reassurance. |
| A4 — Flexible Plan | 1 | 30/40/60/74/90/custom; 74 recommended; habit plan only, not “one sperm cycle.” |
| A5 — Re-Check | 1, clinical gate | User/clinician-guided review date; never automatically schedule retest from plan duration or watch data. |
| A6 — Home Test | 3, research only | Technical capture/QC only in prototype; no patient-facing result without separate evidence and authorization. |
| A7 — Report Vault | 2 | Private originals and versions; safe upload, provenance and user confirmation. |
| A8 — Report Explainer | 2, content gate | Template-first explanation from confirmed values with exact units, date, method and source; no diagnosis. |
| A9 — Direction View | 2 | Separate lab, habit, symptom and source trends; no causal health inference from adherence. |
| A10 — Clinician Summary | 2 | User previews/chooses fields; export does not imply sharing or diagnosis. |
| A11 — Lab Booking & Referral | 2, partner gate | Simulated adapter first; real booking only with verified service and signed terms. |
| A11 — Lab Partner Self-Registration (D-A5) | 2, gated | Restricted application queue; human verification and approval before any listing. No auto-publish or implied booking. |
| A12 — Plan Priorities | 1 | User preferences and approved low-risk habits; wearable data cannot assign clinical risk priority or shorten retest. |
| A13 — Discreet Mode | 1 | Neutral lock-screen and app surfaces; privacy/security/accessibility review; never paywalled by assumption. |
| A14 — Languages & Culture | 1–4 | English/Arabic first candidates; Hindi/Urdu/cultural adaptation later after qualified translation and review. |
| A15 — Symptom Tracker | 2 | User-entered timeline with source/date; urgent route only through approved safety rules. |
| A16 — Health Library | 2 | Versioned, cited, clinician-reviewed education with evidence level and review date. |
| A17 — Know Your Normal | 2 | Self-awareness diary, not screening, cancer detection or score. |
| A18 — Erection Check | 2, instrument gate | Any IIEF-5 use needs licence, validated translation, clinical owner, safe interpretation and support path. |
| A19 — Mood Check-In | 2, instrument gate | PHQ-2/GAD-2 or alternatives only after rights/translation/clinical review and a staffed response route. Not diagnosis or therapy. |
| A20 — Life Stages | 2 | Optional user-selected context; content is reviewed; no assumptions about marriage or family goals. |
| A21 — Food Photo & Barcode | 3+, deferred | Estimates require source, confidence/uncertainty, user correction and confirmation; no treatment claims or presumed retailer integration. |
| B1 — Banded Concentration Screen | 3+, disabled | The 85–90% claim and any band are unapproved; would require prespecified device-specific independent validation and authorization. |
| B2 — Morphology | 2 lab-only / research later | Explain only lab-reported morphology with method and provenance; no morphology from ordinary phone video. |
| B3 — DFI Risk Band | 4, research gate | No DFI inference from home video; any later risk model requires validated inputs and clinical oversight. |
| B4 — Screening & Referral | 1–2, clinical gate | Deterministic, reviewed and explainable; not a diagnosis. |
| B5 — Outcome Tracking | 4, optional | Consent-based longitudinal outcomes; no pregnancy prediction or promise. |
| B6 — Hormone Reports | 2 | Capture from confirmed blood-test reports only; a wearable cannot measure hormones. |
| B7 — Risk-Factor Bridge | 1 | General habit prioritization only; no inferred sperm/fertility state. |
| B8 — Your Decision (score replaced) | 1 | No 1–100 fertility score; any qualitative routing still requires clinical sign-off. |
| B9 — Purpose-Built Kit | 3+, gated | Hardware/chamber/calibration are not assumed available; requires device and partner validation. |
| B10 — Risk Flags | 1–2, clinical gate | User-reported history may trigger a reviewed referral prompt; no disease inference. |
| B11 — Lab Measures | 2 | Show volume/pH/etc. only from lab/user-confirmed source; never infer from video. |
| B12 — Published Performance | All phases, evidence-only | Publish measured performance only with protocol, denominator, uncertainty, subgroup/failure results, date and owner; do not adopt catalogue targets. |
| B13 — Wearable Connectors | 1–2, optional | HealthKit/Health Connect read-only scopes; verify actual data availability and consent; no credentials for watch-brand apps. |
| B14 — Sleep & Recovery Trends | 1–2 | Display source-provided sleep duration, activity, HR/HRV trends only where supported; no generic recovery/stress score or unsupported sleep stages. |
| B15 — Adherence — Watch + Check-In | 1–2 | Track only observed/confirmed behavior; missing wearable data is unknown, not failure. |
| B16 — Screen & Confirm | 2–3 | Lab confirmation path remains available; no home-screen replacement claim. |
| C1 — On-Device First Pass | 3, research gate | Technical capture QC only, with device-specific tests; no medical inference on device. |
| C2 — The Flywheel | 4, research/ethics gate | No reuse of care data for training by default; consent, rights, ethics and governance required. |
| C3 — Learning Decision Engine | 4+, not for clinical decisions | No learned system changes rules in the baseline; any future model is silent/research first and subordinate to approved safety rules. No fixed journey count guarantees readiness. |
| C4 — Couple View | Parked | Remains parked; reopen only by explicit owner decision, dual consent and privacy design. |
| C5 — Inherited-Disease Explainer | 4+, clinical/genetic gate | No claims about a specific panel until verified; requires genetic counselling pathway, source review and local approval. |
| C6 — DFI Deferral Check | 4, research only | Not used to defer care/testing without external validation and clinician approval. |
| C7 — Lab Connect | 4, partner/region gate | Structured integration only after named partner, API/data contract, residency and provenance validation. |
| C8 — Clinician Dashboard | 4+, gated | Separate staff identity, minimum necessary data, consent, partner contract, audit and support. |
| C9 — Safety Scorecard | 2+ internal evidence first | Public scorecard only after an approved test set, methods, uncertainty and clinician review; never imply a certification. |
| C10 — India-First & Cultural Adaptation | 5, market decision | Later geography proposal; separate partners, localization, legal/regulatory and pricing review. Dubai-first unchanged. |
| C11 — Federated Learning | 5, research only | Not inherently private or compliant; requires threat model, secure aggregation, consent, validation and governance. |
| C12 — Watch Companion & Voice Explainer | 5, optional | Native platform/privacy/accessibility review; voice content remains sourced, constrained and non-diagnostic. |
| C13 — Preconception Plan | 5, clinical/content gate | General, reviewed information only; no “what to stop/start” medication advice, outcome promise or couple sharing without separate consent. |
