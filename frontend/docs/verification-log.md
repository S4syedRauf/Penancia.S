# Sahatna — Prototype Verification Log (Part 18)

| # | Item | Verification Status | Notes & Prototype Implementation Choice |
|---|---|---|---|
| V1 | Azure services in UAE North | Logged (Prototype) | App Service, Azure SQL, Blob Storage, Service Bus, Key Vault targeted for UAE North; AI inference & LLM fallbacks marked as Region Exceptions if deployed to Sweden Central / West Europe. |
| V2 | Azure OpenAI / LLM Privacy | Logged | De-identified confirmed values only; personal identifiers stripped before prompt construction; `Ask:LlmMode` supports `Full`, `TemplatesOnly`, and `Off`. |
| V3 | Entra External ID & PKCE | Logged | Anonymous-by-default random username mapped to internal `UserId` GUID; PKCE flow pattern simulated cleanly for web prototype. |
| V4 | Document Intelligence & Arabic OCR | Logged | Rule-based parser + Gemini multimodal extractor with header auto-masking and manual entry fallback (`ExtractionFailed -> ManualEntry`). |
| V5 | Malware scanning | Logged | Uploads enter `quarantine` state first and pass `scanning` validation before promotion to clean vault. |
| V6 | Noon Search URL pattern | Verified Pattern | `https://www.noon.com/uae-en/search/?q=<term>` and `https://www.noon.com/uae-ar/search/?q=<term>`; copyable item name fallback always enabled. No public consumer Noon API exists. |
| V7 | Health Connect (Android) | Logged | Sleep duration, sleep midpoint, resting HR, HRV, steps supported as habit trackers; missing fields remain `NULL`. |
| V8 | HealthKit (iOS) | Logged | Per-category read permissions; never used to alter screening colour or measure fertility. |
| V9 | Client libraries & Camera | Logged | Web camera (`getUserMedia`) + interactive optical calibration/quality-gate simulator built for cross-device judge verification. |
| V10 | WHO Semen Manual (6th Ed, 2021) | Verified Baseline | Abstinence 2–7 days; internal lower thresholds (16M/mL conc, 42% total motility, 30% progressive motility) mapped strictly to `Low / Typical / Unclear` bands (Rule R1). |
| V11 | NICE NG257 Retest Guidance | Logged | 1–2 week repeat for doubtful home pre-screen; ~3 months (11–12 weeks) for lab-confirmed pattern change. |
| V12 | VISEM-Tracking Dataset | Verified Attribution | CC BY 4.0 attribution included for demo mode reference loops (`Demo data. Not your sample.`). |
| V13 | Validated phone-based benchmarks | Logged | Prototype carries `Prototype pre-screen` label until clinical validation study (`>= 150` paired samples) is completed. |
| V14 | UAE Health Data Laws | Pending Legal Sign-off | Designed around Federal Decree-Law 45/2021 & Law 2/2019 (local storage, consent granularity, full deletion lifecycle). |
| V15 | App Distribution | Logged | Web prototype builds cleanly for staging/demo; mobile EAS builds documented in Part 10.4. |
| V16 | ML Library Licensing | Verified | Zero AGPL libraries used. |
