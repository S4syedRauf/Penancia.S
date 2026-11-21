using System.Text.Json;
using Microsoft.Azure.Functions.Worker;
using Microsoft.DurableTask;
using Microsoft.Extensions.Logging;
using Penancia.S.Domain.Workflow;
using Penancia.S.Workflow.Activities;

namespace Penancia.S.Workflow.Orchestrators;

/// <summary>
/// Master Durable Functions Orchestrator for clinical semen analysis.
///
/// Core Guarantees:
/// 1. Deterministic execution: Orchestration Instance ID = sample_id.
///    Starting the same sample twice cannot create duplicate runs.
/// 2. Parallel fan-out to Service Bus queues for all model jobs.
/// 3. Resilient event handling for manual entry and human review tasks.
/// 4. Every path ends in a terminal state (Released, Rejected, Failed, Abandoned).
///
/// STATE MACHINE (source of truth): every state change goes through
/// SampleStateMachine.Apply via TransitionStateActivity, using SampleEvents — never by
/// assigning a target state. Legal path enforced here:
///   Draft --Submit--> Validating --FilesValidated--> Analyzing --AnalysisFinished-->
///   Collecting --CompletenessReached--> Evaluating --DraftGenerated--> AwaitingSignoff
///   --SignedOff--> Released
///   Validating --FilesRejected--> Rejected | Collecting --CollectTimeout--> Abandoned |
///   AwaitingSignoff --SignoffTimeout--> Abandoned | any non-terminal --UnrecoverableError--> Failed.
/// ValidateSignoff is private to the machine and runs inside Apply for the SignedOff event
/// (signer role, signer != data enterer, signed version + content hash).
///
/// MODEL WAIT POLICY (all, not any): Phase 3 awaits ALL THREE model completion events
/// (model_done:video-qc, model_done:pycasa, model_done:banerjee) within a 1-hour durable
/// timer. A timeout on ANY awaited model fails the orchestration (catch → Failed). There is
/// no proceed-on-timeout / single-model fallback: a partial result set must never be treated
/// as a complete analysis.
///
/// CANONICAL SERVICES DISPATCHED (for docs): video-qc, pycasa, banerjee — queues
/// job-video-qc, job-pycasa, job-banerjee. No other model services exist; "fan-out to 10
/// models" is a remaining item (docs correction + future work, not code in this change).
///
/// MODEL-RESULTS RECEIVER: no Service Bus trigger/receiver for the 'model-results' queue
/// exists anywhere in this Workflow project (or anywhere under src/ by file name) to raise
/// the model_done:* external events the orchestrator waits on. Until one lands, Phase 3
/// can only end by timeout. That receiver is a remaining item — it is NOT invented here.
/// The same applies to the raisers of 'manual_entry_completed' and 'sample_signed_off'.
///
/// HUMAN-WAIT TIMEOUTS: manual entry 7 days, sign-off 7 days (durable timers). These are
/// operational values chosen for this change — no clinical source prescribes them; confirm
/// with lab operations. On timeout the sample goes to Abandoned via the machine's
/// CollectTimeout / SignoffTimeout paths.
///
/// RETRIES: every activity call uses an exponential-backoff retry policy (3 attempts,
/// 5s → 10s → 20s, capped at 30s) for transient DB / Service Bus failures.
///
/// SIGN-OFF PAYLOAD CONTRACT: the 'sample_signed_off' external event must carry JSON:
///   { "signerId": "...", "role": "Signer|ClinicalDirector",
///     "signedReportVersion": 1, "signedContentSha256": "..." }
/// A malformed payload, or a missing signer/role, fails closed. NOTE — release is STILL
/// BLOCKED by design: the CURRENT version/hash now come from the sample row itself
/// (TransitionStateActivity fills CurrentReportVersion / CurrentContentSha256 from
/// SampleEntity.ReportVersion / ContentSha256 and DataEnterers from DataEnterersJson +
/// CreatedBy, read fresh at transition time), so the comparison is possible — but those
/// fields stay null until draft generation (Stage S5) populates them. Until then SignedOff
/// fails closed (STALE_VERSION / STALE_HASH) and the sample goes to Failed. Do not weaken
/// this by comparing the signed values against themselves.
/// </summary>
public static class SampleOrchestrator
{
    // Retry policy for DB / Service Bus activity calls: exponential back-off,
    // 3 attempts (5s, 10s, 20s), capped at a 30s interval between attempts.
    private static readonly TaskOptions DbRetryOptions = new()
    {
        Retry = new RetryPolicy(
            maxNumberOfAttempts: 3,
            firstRetryInterval: TimeSpan.FromSeconds(5),
            maxRetryInterval: TimeSpan.FromSeconds(30),
            backoffCoefficient: 2.0)
    };

    // Human-wait timeouts (operational values — see class docstring; confirm with lab ops).
    private static readonly TimeSpan ManualEntryTimeout = TimeSpan.FromDays(7);
    private static readonly TimeSpan SignoffTimeout = TimeSpan.FromDays(7);
    private static readonly TimeSpan ModelCompletionTimeout = TimeSpan.FromHours(1);

    [Function(nameof(RunSampleWorkflow))]
    public static async Task RunSampleWorkflow(
        [OrchestrationTrigger] TaskOrchestrationContext context)
    {
        string sampleId = context.InstanceId;
        var logger = context.CreateReplaySafeLogger(nameof(SampleOrchestrator));

        logger.LogInformation("Starting deterministic orchestration for sample {SampleId}", sampleId);

        // Last-known state, tracked from TransitionStateActivity's return value. Used by the
        // catch block to skip the Failed marking when the sample is already terminal.
        // (The Api can also write state directly, so this is last-known, not ground truth;
        // the Failed-marking call is additionally wrapped in its own try/catch.)
        var currentState = SampleState.Draft;

        async Task TransitionAsync(TransitionInput input)
        {
            string newState = await context.CallActivityAsync<string>(
                nameof(TransitionStateActivity), input, DbRetryOptions);
            currentState = Enum.Parse<SampleState>(newState);
        }

        try
        {
            // --- Phase 1: Malware & Format Validation ---
            // NOTE: ValidateFilesActivity currently FAILS CLOSED (throws NotSupportedException)
            // until the real format/duration/malware checks land (Stage S4), so no sample can
            // pass this phase today. The isValid == false branch below is for when it lands.
            bool isValid = await context.CallActivityAsync<bool>(
                nameof(ValidateFilesActivity), sampleId, DbRetryOptions);

            // Submit gates on files + calibration being PRESENT (not on passing validation:
            // present-but-invalid files are Rejected below, not failed at Submit). Presence
            // here is asserted from the upload having registered the video + calibration
            // before orchestration started; ValidateFilesActivity does not yet verify
            // calibration presence — remaining item for Stage S4.
            await TransitionAsync(new TransitionInput(
                sampleId, SampleEvent.Submit, "SubmittedForValidation",
                FilesAndCalibrationPresent: true));

            if (!isValid)
            {
                logger.LogWarning("File validation or Defender scan failed for sample {SampleId}. Marking Rejected.", sampleId);
                await TransitionAsync(new TransitionInput(
                    sampleId, SampleEvent.FilesRejected, "ValidationFailed"));
                return;
            }

            await TransitionAsync(new TransitionInput(
                sampleId, SampleEvent.FilesValidated, "FilesValidated"));

            // --- Phase 2: Parallel Model Fan-Out via Service Bus ---
            // Determine media type from sample
            string mediaType = await context.CallActivityAsync<string>(
                nameof(GetSampleMediaTypeActivity), sampleId, DbRetryOptions);

            // Select appropriate model services based on media type
            var modelJobs = mediaType == "video"
                ? new List<string> { "video-qc", "pycasa", "banerjee" }
                : new List<string> { "image-analysis" }; // Future: add more image-specific models

            var dispatchTasks = modelJobs.Select(svc =>
                context.CallActivityAsync(
                    nameof(DispatchModelJobActivity),
                    new DispatchInput(sampleId, svc, mediaType),
                    DbRetryOptions));
            await Task.WhenAll(dispatchTasks);

            // --- Phase 3: Wait for ALL Model Completion Events ---
            // Policy: ALL must complete. A timeout on ANY awaited model fails the
            // orchestration — there is no proceed-on-timeout and no single-model fallback.
            // (Requires a 'model-results' receiver to raise these events; none exists yet —
            // see class docstring. Until it lands, this phase can only end by timeout.)
            var modelDoneEvents = modelJobs.Select(svc =>
                context.WaitForExternalEvent<bool>($"model_done:{svc}")).ToArray();
            var modelDone = Task.WhenAll(modelDoneEvents);
            var modelTimeout = context.CreateTimer(
                context.CurrentUtcDateTime.Add(ModelCompletionTimeout), CancellationToken.None);
            var modelWinner = await Task.WhenAny(modelDone, modelTimeout);
            if (modelWinner == modelTimeout)
            {
                throw new TimeoutException(
                    $"Timed out after {ModelCompletionTimeout} waiting for ALL model completion " +
                    $"events ({string.Join(", ", modelJobs.Select(s => $"model_done:{s}"))}) for sample " +
                    $"{sampleId}. Refusing to proceed on a partial result set.");
            }
            await modelDone;

            // --- Phase 4: Wait for Lab Technician Manual Entry (with timeout) ---
            await TransitionAsync(new TransitionInput(
                sampleId, SampleEvent.AnalysisFinished, "AnalysisFinished"));
            var manualEntryEvent = context.WaitForExternalEvent<bool>("manual_entry_completed");
            var manualEntryTimer = context.CreateTimer(
                context.CurrentUtcDateTime.Add(ManualEntryTimeout), CancellationToken.None);
            var manualWinner = await Task.WhenAny(manualEntryEvent, manualEntryTimer);
            if (manualWinner == manualEntryTimer)
            {
                logger.LogWarning("Manual entry timed out after {Timeout} for sample {SampleId}. Marking Abandoned.", ManualEntryTimeout, sampleId);
                await TransitionAsync(new TransitionInput(
                    sampleId, SampleEvent.CollectTimeout, "TIMEOUT_COLLECTING"));
                return;
            }
            bool entryComplete = await manualEntryEvent;
            if (!entryComplete)
            {
                throw new InvalidOperationException(
                    $"Manual entry for sample {sampleId} reported incomplete. " +
                    "The machine refuses CompletenessReached while required fields are open.");
            }

            // --- Phase 5: Clinical Rules Engine (Domain Library) ---
            await TransitionAsync(new TransitionInput(
                sampleId, SampleEvent.CompletenessReached, "ManualEntryComplete",
                IsComplete: true));
            // NOTE: EvaluateRulesActivity currently FAILS CLOSED (throws NotSupportedException)
            // until the Stage S4 resolver integration lands, so no sample can pass this
            // phase today. That is intended — a stub must never be treated as a pass.
            await context.CallActivityAsync(nameof(EvaluateRulesActivity), sampleId, DbRetryOptions);

            // --- Phase 6: Compile Report & Render PDF via Gotenberg ---
            // NOTE: RenderPdfReportActivity currently FAILS CLOSED (throws NotSupportedException)
            // until the Stage S5 Gotenberg call lands, so no sample can pass this phase today.
            await context.CallActivityAsync(nameof(RenderPdfReportActivity), sampleId, DbRetryOptions);

            // --- Phase 7: Await Authorized Clinical Sign-Off (with timeout) ---
            await TransitionAsync(new TransitionInput(
                sampleId, SampleEvent.DraftGenerated, "DraftGenerated"));
            var signoffEvent = context.WaitForExternalEvent<string>("sample_signed_off");
            var signoffTimer = context.CreateTimer(
                context.CurrentUtcDateTime.Add(SignoffTimeout), CancellationToken.None);
            var signoffWinner = await Task.WhenAny(signoffEvent, signoffTimer);
            if (signoffWinner == signoffTimer)
            {
                logger.LogWarning("Sign-off timed out after {Timeout} for sample {SampleId}. Marking Abandoned.", SignoffTimeout, sampleId);
                await TransitionAsync(new TransitionInput(
                    sampleId, SampleEvent.SignoffTimeout, "TIMEOUT_SIGNOFF"));
                return;
            }
            string signoffData = await signoffEvent;
            var signoff = ParseSignoffPayload(signoffData, sampleId);

            // Finalize FIRST (while still AwaitingSignoff: Finalize throws unless the state
            // is AwaitingSignoff, the draft PDF exists, and the sample is not already locked),
            // then apply the machine's SignedOff event, which ValidateSignoff guards
            // (signer role, signer != data enterer, signed version + content hash).
            await context.CallActivityAsync(
                nameof(FinalizeReleaseActivity), new FinalizeInput(sampleId, signoffData), DbRetryOptions);
            // SIGN-OFF PAYLOAD CONTRACT (unchanged): the 'sample_signed_off' event carries
            // { signerId, role, signedReportVersion, signedContentSha256 }; the signed values
            // below come from that payload only. The CURRENT draft version/hash and the data-
            // enterer list are NOT passed here: the orchestrator never loads the sample row,
            // and TransitionStateActivity fills them from the row it loads fresh at transition
            // time (sample.ReportVersion / ContentSha256, DataEnterersJson + CreatedBy). The
            // explicit nulls below are therefore placeholders the activity overrides for
            // SignedOff — never pass the signed values back as the current ones.
            await TransitionAsync(new TransitionInput(
                sampleId, SampleEvent.SignedOff, "ReportReleased",
                ActorId: signoff.SignerId,
                ActorRole: signoff.Role,
                SignedReportVersion: signoff.SignedReportVersion,
                CurrentReportVersion: null,
                SignedContentSha256: signoff.SignedContentSha256,
                CurrentContentSha256: null));

            logger.LogInformation("Sample {SampleId} successfully processed and released.", sampleId);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Unrecoverable orchestration error for sample {SampleId}.", sampleId);

            // Never transition an already-terminal sample to Failed: the machine rejects
            // all events from terminal states, and a second Failed marking would corrupt
            // the audit trail.
            if (SampleStateMachine.IsTerminal(currentState))
            {
                logger.LogWarning(
                    "Sample {SampleId} is already in terminal state {State}; skipping Failed marking.",
                    sampleId, currentState);
                return;
            }

            // The failure-marking call itself is wrapped so a DB outage in the catch path
            // cannot leave the orchestration failed with no Failed marking and no record
            // of why the marking itself failed.
            try
            {
                await context.CallActivityAsync(
                    nameof(TransitionStateActivity),
                    new TransitionInput(sampleId, SampleEvent.UnrecoverableError, ex.Message),
                    DbRetryOptions);
            }
            catch (Exception markEx)
            {
                logger.LogError(markEx,
                    "Could not mark sample {SampleId} as Failed after orchestration error. " +
                    "The sample may not be in Failed state; manual reconciliation is required. " +
                    "Original error: {OriginalError}",
                    sampleId, ex.Message);
            }
        }
    }

    /// <summary>
    /// Parses the 'sample_signed_off' external-event payload. Expected JSON (see class
    /// docstring): signerId, role, signedReportVersion, signedContentSha256. Fails closed
    /// (InvalidOperationException) on malformed JSON or a missing signerId / role.
    /// Deterministic: pure string parsing, no I/O, no clock, no randomness.
    /// </summary>
    private static SignoffPayload ParseSignoffPayload(string signoffData, string sampleId)
    {
        if (string.IsNullOrWhiteSpace(signoffData))
        {
            throw new InvalidOperationException(
                $"Empty 'sample_signed_off' payload for sample {sampleId}. " +
                "Expected JSON with signerId, role, signedReportVersion, signedContentSha256.");
        }

        JsonElement root;
        try
        {
            using var doc = JsonDocument.Parse(signoffData);
            root = doc.RootElement.Clone();
        }
        catch (JsonException ex)
        {
            throw new InvalidOperationException(
                $"Malformed 'sample_signed_off' payload for sample {sampleId}: not valid JSON. " +
                "Expected { signerId, role, signedReportVersion, signedContentSha256 }.", ex);
        }

        string? signerId = root.TryGetProperty("signerId", out var s) && s.ValueKind == JsonValueKind.String
            ? s.GetString() : null;
        string? role = root.TryGetProperty("role", out var r) && r.ValueKind == JsonValueKind.String
            ? r.GetString() : null;
        int? signedVersion = root.TryGetProperty("signedReportVersion", out var v) && v.ValueKind == JsonValueKind.Number && v.TryGetInt32(out var n)
            ? n : null;
        string? signedHash = root.TryGetProperty("signedContentSha256", out var h) && h.ValueKind == JsonValueKind.String
            ? h.GetString() : null;

        if (string.IsNullOrWhiteSpace(signerId) || string.IsNullOrWhiteSpace(role))
        {
            throw new InvalidOperationException(
                $"'sample_signed_off' payload for sample {sampleId} is missing signerId and/or role. " +
                "Sign-off cannot be validated without them.");
        }

        return new SignoffPayload(signerId, role, signedVersion, signedHash);
    }

    private sealed record SignoffPayload(
        string SignerId, string Role, int? SignedReportVersion, string? SignedContentSha256);
}
