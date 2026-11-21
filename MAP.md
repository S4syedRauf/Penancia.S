# PENANCIA.S SEMEN ANALYSIS — PROJECT MAP & ARCHITECTURAL ATLAS

This document serves as the master navigation index and system map for the entire codebase. Every folder, module, contract, and workflow path is documented here.

---

## 1. High-Level System Architecture

```
                          [ BROWSER: Staff Portal (Blazor, planned — not in repo) ]   [ MOBILE APP (Phase 2) ]
                                          │                              │
                                          └──────────────┬───────────────┘
                                                         │ Entra ID JWT Tokens
                                                         ▼
                                             [ Penancia.S.Api ]
                                        (ASP.NET Core v1 Gateway / Port)
                                         - Direct SAS Upload Tokens
                                         - Mobile rule: 'Released' only
                                         - Dual Sign-Off enforcement
                                                         │
                                    ┌────────────────────┴────────────────────┐
                                    ▼                                         ▼
                            [ Azure Storage ]                       [ Azure SQL Database ]
                     (raw-video, raw-images, quarantine)            (System of Record & Ledger)
                                    │                                         ▲
                         Submit New Sample Event                              │
                                    ▼                                         │
       ┌────────────────────────────────────────────────────────┐             │
       │     AZURE DURABLE FUNCTIONS ORCHESTRATOR (C#)          │             │
       │           Instance ID = sample_id                      ├─────────────┘
       │                                                        │
       │  Phase 1: Malware & Format Validation (Defender Scan)  │
       │  Phase 2: Parallel Fan-Out (Service Bus Queues)        │
       │  Phase 3: Wait for External Events (Manual / Review)   │
       │  Phase 4: Domain Rules Engine (WHO 2021 Limits)        │
       │  Phase 5: Narrative Generation (Template + Guarded LLM)│
       │  Phase 6: PDF Rendering via Gotenberg Container        │
       │  Phase 7: Verified Dual Sign-Off (Signer ≠ Enterer)    │
       └────────────────────────────┬───────────────────────────┘
                                    │
                 ┌──────────────────┴──────────────────┐
                 ▼                                     ▼
        [ Service Bus Queues ]                [ Azure Container Registry ]
       (One queue per model job)                 (Pinned model digests)
                 │
                 ▼
  [ Container Apps Jobs — 3 wired, 7 planned ]
  • video-qc   (wired — dispatched by the orchestrator)
  • pycasa     (wired — dispatched by the orchestrator)
  • banerjee   (wired — dispatched by the orchestrator)
  Planned, not wired: active, maskrcnn/cellpose, madrnet,
  cbam, maml, spermmorpho, opencasa. Their Service Bus queues
  exist in infra/main.bicep, but no model container is dispatched
  by the orchestrator yet.
                 │
                 ▼ Results Message
         [ model-results Queue ]
                 │
                 ▼
     [ Durable Orchestrator Event:
       model_done:{service}:{job_id} ]
```

---

## 2. Directory Map & Component Roles

```
.
├── CHANGELOG.md                   <-- Change lock: all modifications, commits, and deployments
├── MAP.md                         <-- This navigation map and architecture reference
├── README.md                      <-- Project introduction and local setup
├── Penancia.S.sln              <-- Master Visual Studio Solution File (.NET 8.0)
├── azure.yaml                     <-- Azure Developer CLI (azd) service manifest (api, workflow, infra)
├── Library/                       <-- macOS / VS Code artifact accidentally copied into the repo; not part of the solution (left in place)
├── docs/                          <-- Specifications, clinical reference, security, runbooks
│   └── CLINICAL_WHO2021.md        <-- WHO 6th edition clinical reference limits
├── infra/                         <-- Infrastructure as Code (Bicep templates)
│   ├── main.bicep                 <-- Master deployment entry point (region-neutral parameter)
│   ├── parameters.json            <-- Environment parameters (location, prefix, environment)
│   └── deploy.sh                  <-- Automated deployment script
├── models/                        <-- Model containers — only video-qc exists in the repo; the other model services are planned, not present
│   ├── shared/                    <-- Common contract, message schemas, and base worker
│   │   ├── contract.py            <-- Standardized JobRequest and JobResult schemas
│   │   └── base_worker.py         <-- Base worker class for all model containers
│   └── video-qc/                  <-- Step 3: Video quality control (OpenCV blur, drift, focus)
│       ├── Dockerfile             # Container definition for Container Apps Job
│       └── worker.py              # Laplacian focus, illumination, drift calculation
├── src/                           <-- Core application source code (.NET 8)
│   ├── Penancia.S.Domain/      <-- Pure business logic: Rules table, Kinematics, State Machine
│   │   ├── Model/                 # Measurement, Provenance, Enums, Calibration, IClock
│   │   ├── Fields/                # FieldCatalog (Sections A-J), FieldValidator, display rounding
│   │   ├── Parameters/            # ParameterSet & ValidationManifest
│   │   ├── Kinematics/            # KinematicsCalculator (K-1 to K-8), KinematicsAggregator
│   │   ├── Resolvers/             # Motility, Concentration, Morphology, Vitality Resolvers
│   │   ├── Rules/                 # RuleTable, FlagCatalog, RulesEngine, Completeness
│   │   ├── Workflow/              # SampleState, SampleStateMachine (strict lifecycle guards)
│   │   ├── Narrative/             # TemplateNarrative, NarrativeValidator (4-point LLM guardrail)
│   │   └── Reporting/             # ReportModel (Section 16 schema), ReportBuilder (SHA-256)
│   ├── Penancia.S.Data/        <-- EF Core database context, entities, audit ledger
│   ├── Penancia.S.Api/         <-- Versioned REST API (v1 Gateway, SAS generation, Signoff)
│   └── Penancia.S.Workflow/    <-- Durable Functions orchestrator, activities, and reconciler
└── tests/                         <-- Automated test suites (103 test methods: 90 [Fact] + 13 [Theory]; 171 cases incl. [InlineData] — recounted 2026-11-21 after the fix batch; Domain logic only)
    └── Penancia.S.Tests/
        ├── TestSupport.cs         # FixedClock, Calibration, and test helper vectors
        ├── Kinematics/
        │   ├── KinematicsTests.cs # KIN-1 to KIN-6, gap interpolation, 500-sample fuzz test
        │   └── AggregatorTests.cs # Mean, median, sample SD (n-1), exclusion tallies
        ├── Fields/
        │   └── FieldCatalogTests.cs # Uniqueness, hard ranges, non-future dates, display rounding
        ├── Model/
        │   └── ModelTests.cs      # Measurement & Provenance consistency, ParameterSet validation
        ├── RulesEngineBoundaryTests.cs # Display rounding boundaries against clinical limits
        ├── MotilityResolverTests.cs    # 5-row decision table, sum check, review overrides
        ├── ConcentrationResolverTests.cs # Manual reference method, relative gap check, zero count
        ├── MorphologyResolverTests.cs  # MADRNet/CBAM mapping, per-cell rule, review gating
        ├── VitalityResolverTests.cs    # OpenCASA vs manual, Motility <= Vitality check
        ├── ReportBuilderTests.cs       # Full report assembly, content_sha256 stability, JSON schema
        ├── StateMachineInvariantTests.cs # State progression, dual sign-off, stale hash rejection
        ├── NarrativeGuardrailTests.cs  # Banned phrases, numeric hallucination blocker, fallback
        # CalibrationTests.cs deleted 2026-11-21; its coverage is merged into Model/ModelTests.cs (canonical calibration-validity test).
```
