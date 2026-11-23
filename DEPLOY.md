# DEPLOY.md — Penancia.S deployment procedure

> Status: **no deployment has been run from this fix batch.** The Bicep, `azure.yaml`, `deploy.sh` and app code were written and verified by re-reading files only (no build, test run or deployment was possible in the review environment). Follow the steps in order on the Mac.
>
> **No credentials are included in this file or in any deploy file in this repo.** Secrets are placeholders only (see step 4).

## 0. Preconditions

- Azure subscription with permission to create the resource group `rg-penancias-dev` in UAE North (`uaenorth`). DR is UAE Central — no DR resources are deployed by this procedure.
- `az` CLI, `azd` CLI and .NET 8 SDK installed on the Mac.
- Entra ID app registration for the Api (JWT bearer). The client/tenant IDs already in `src/Penancia.S.Api/appsettings.json` must match the registration — verify them; do not commit new secrets.
- The Api image must be built from the repo-root `Dockerfile` and pushed to ACR as `penancias-api:latest` before deploying the infrastructure (azd may not find the Dockerfile under `src/Penancia.S.Api`).
- Function App code is deployed separately (see step 6).

## 1. Build and test (on the Mac)

```bash
cd <repo root>
dotnet build Penancia.S.sln
dotnet test
```

Expected: 103 test methods (90 `[Fact]` + 13 `[Theory]`), 171 cases. Do not proceed if the build or tests fail.

## 2. Database — verify the hand-written migration SQL first

`migrations.sql` was written by hand from the EF migration sources. Before applying anything:

```bash
dotnet ef migrations script --project src/Penancia.S.Data --startup-project src/Penancia.S.Api
```

Diff the output against `migrations.sql` (especially §4, the `20261121010311_FixAuditAndBookingConstraints` migration). Do not apply if they differ — fix the SQL, not the migration.

Then:

```bash
dotnet ef database update --project src/Penancia.S.Data --startup-project src/Penancia.S.Api
```

Take a backup of `sqldb-penancias` first if it already holds data: §4 adds constraints, and orphan rows in AuditEvents/ModelRuns will fail the migration.

## 3. Validate the Bicep

`infra/parameters.json` is the single source of truth (prefix `penancias`, location `uaenorth`, environment `dev`). `infra/deploy.sh` reads it.

```bash
# Create the resource group first if it does not exist (infra/deploy.sh does this too):
az group create --name rg-penancias-dev --location uaenorth

az bicep build --file infra/main.bicep
az deployment group validate --resource-group rg-penancias-dev --template-file infra/main.bicep --parameters @infra/parameters.json
```

## 4. Fill the Key Vault secrets

Three placeholder secrets exist in the vault (`kv-penancias`) with value `<FILL-IN-VIA-KEY-VAULT>`:

- `sql-connection-string`
- `function-storage-connection-string`
- `app-insights-connection-string`

Fill them via the Azure portal or `az keyvault secret set`. Never commit real values.

## 5. Build and push the Api image, then deploy the infrastructure

```bash
# From the repo root, where the Dockerfile lives:
az acr build --registry acrpenancias --image penancias-api:latest .

# Then deploy (creates the resource group if needed, deploys infra/main.bicep):
./infra/deploy.sh
```

## 6. Deploy the Workflow Function App code

```bash
cd src/Penancia.S.Workflow
dotnet publish -c Release
# Deploy the published output to the Function App (zip deploy, or `azd deploy` from the repo root).
```

## 7. Verify

- `GET https://<api-fqdn>/health` → 200. This is the anonymous liveness probe; it returns no patient data.
- Swagger UI is dev-only; do not enable it in production.
- Sign-off flow: a sample in `AwaitingSignoff` with populated `ReportVersion` / `ContentSha256` / `DataEnterersJson` signs off via `POST /v1/signoff` (SignerOnly) and reaches `Released`.

**Expect the end-to-end flow NOT to succeed today:** Stages S4/S5 are stubs that throw by design (EvaluateRules, RenderPdf, ValidateFiles), no `model-results` queue receiver exists, and release is blocked until Stage S5 populates the sign-off fields. Phase 1 will fail closed until those land.

## 8. Rollback

- Bicep deploys in Incremental mode: re-running an earlier template version restores the earlier resource shape; it does not delete data.
- Keep the previous Api image tag in ACR; redeploy it to roll the Api back.
- Database: restore from the pre-migration backup (step 2). There is no down-migration script in this repo.

## Known limits of this deployment

- The React frontend now exists in `frontend/`, but the current Static Web Apps workflow publishes only its browser bundle. That static hosting model does not run the required Express application APIs (`/v1/state`, report, booking, assistant, and image-session routes). Do not treat that workflow as a complete full-stack deployment. Host Express separately (for example, as a Container App) or complete and verify an equivalent .NET API migration before enabling static production traffic.
- Api CORS allows the recorded Static Web App and storage-web origins plus localhost, but CORS alone does not implement missing API contracts.
- The orchestrator waits for all three model events and for the `sample_signed_off` durable event; Api sign-off does not raise that event (see the fix-batch entry in CHANGELOG.md) — reconcile before relying on the durable wait.
- The 7-day human-wait timeouts are operational choices needing lab-ops confirmation.
- Gotenberg runs with internal ingress only; the Function App calls it via the `GotenbergUrl` setting.
- Foundry runs nothing in this solution; the Ask endpoint is template-only.
