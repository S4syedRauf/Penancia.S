# Penancia.S Frontend

The React + TypeScript patient application and Express development server for Penancia.S.

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open **http://localhost:3000**.

## Configuration

- `GEMINI_API_KEY` enables Gemini-powered assistant features.
- `VITE_API_BASE` sets an optional remote .NET API origin for supported operations.
- `VITE_BACKEND_ENABLED=true` routes uploaded-sample blob/orchestration operations through that .NET API. The default local configuration uses Express for application state, quotes/orders, reports, assistant requests, and image-derived session persistence. Keep Express running for the complete Panacea workflow.

The browser does not replace API calls with local success responses. Uploaded-image measurements are derived from the selected file and saved unchanged as research-only sessions; they are not diagnostic results.

Environment files are ignored by Git. Only `.env.example`, which contains placeholders rather than credentials, belongs in version control.

## Quality checks

```bash
npm test
npm run lint
npm run build
```

The tests cover real HTTP transport safeguards, backend error propagation, report API contracts, research-session consent/persistence rules, connected-component image segmentation, image-derived report generation, honest handling of fields with no measurable candidate, safe HTML report downloads, and explicit demonstration-fixture labels.

See the [repository README](../README.md) for architecture, backend commands, report limitations, and deployment documentation.
