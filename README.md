# Penancia.S Semen Analysis Platform

A full-stack reproductive-health application with a bilingual React frontend, local Express services, and an Azure-native .NET backend for auditable semen-analysis workflows. The repository includes the patient experience, image-derived research pre-screen reports, versioned REST APIs, Durable Functions orchestration, infrastructure, and automated tests.
Explanative YT video https://youtu.be/9RTThE5CtZE
## Repository layout

- `frontend/` — React 19 + TypeScript patient application and Express development server.
- `src/Penancia.S.Api/` — versioned REST API and direct-upload SAS endpoints.
- `src/Penancia.S.Domain/` — dependency-free clinical calculations and reporting rules.
- `src/Penancia.S.Data/` — EF Core persistence and migrations.
- `src/Penancia.S.Workflow/` — deterministic Durable Functions orchestration and model-job dispatch.
- `infra/` — parameterized Azure Bicep infrastructure and deployment scripts.
- `tests/` — .NET domain test suite.
- `docs/` — clinical and architecture documentation.

## Run the application locally

### Prerequisites

- Node.js and npm
- .NET 8 SDK for backend development and tests

### Frontend and local application services

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

Open **http://localhost:3000**. The default configuration uses the local Express pipeline. Gemini-powered features require `GEMINI_API_KEY`; other application features can be used without it.

To use the Azure backend instead, configure `VITE_API_BASE` and set `VITE_BACKEND_ENABLED=true` in `frontend/.env.local`. Do not commit environment files or credentials.

### Backend validation

```bash
dotnet restore Penancia.S.sln
dotnet test Penancia.S.sln
```

See [DEPLOY.md](DEPLOY.md) for Azure deployment and [MAP.md](MAP.md) for the full module map.

## Image-derived semen reports

Uploaded-image reports are generated from the supplied image at runtime. They are not replaced with generic result bands or fixed clinical outcomes. The current browser pre-screen measures the largest connected foreground structure and clearly marks measurements that the image cannot establish as **Not assessed**.

These reports are research pre-screens, not diagnostic semen analysis. Concentration, motility, vitality, detailed morphology, and clinical interpretation require validated laboratory methods and appropriate calibration. Reports include their source filename, SHA-256 fingerprint, analysis timestamp, measurement basis, limitations, and downloadable HTML/PDF presentation.

Explicitly labelled demonstration fixtures are separate from uploaded-image analysis. Local runtime report data under `frontend/.panacea-data/` is excluded from version control.

## Verification

Run all frontend checks:

```bash
cd frontend
npm test
npm run lint
npm run build
```

Run the .NET tests from the repository root:

```bash
dotnet test Penancia.S.sln
```

Validation completed on **22 November 2026**:

- **6/6 frontend tests passed**, including image-specific measurements, empty-field handling, safe report downloads, and explicit fixture labelling.
- TypeScript validation and the Vite production build passed.
- **171/171 .NET tests passed**.

The .NET suite primarily verifies Domain behavior. Frontend tests focus on image segmentation and report-generation safeguards; they do not establish clinical validation.

## Core architecture highlights

1. **Domain engine** — pure .NET calculations for WHO kinematics, motility, concentration, morphology, vitality, and auditable report hashes.
2. **API gateway** — versioned endpoints, direct blob-upload SAS generation, release-state access controls, and dual sign-off enforcement.
3. **Workflow orchestrator** — deterministic Durable Functions orchestration with asynchronous model-job fan-out.
4. **Cloud infrastructure** — Azure Bicep templates for UAE North and disaster recovery in UAE Central.

## Documentation

- [System atlas and architecture map](MAP.md)
- [Change log and deployment history](CHANGELOG.md)
- [Clinical specifications](docs/CLINICAL_WHO2021.md)
- [Infrastructure](infra/main.bicep)
- [Deployment guide](DEPLOY.md)
- [Frontend guide](frontend/README.md)
