using Microsoft.Azure.Functions.Worker;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Penancia.S.Data;
using Penancia.S.Data.Entities;
using Penancia.S.Domain.Workflow;

namespace Penancia.S.Workflow.Activities;

/// <summary>
/// Atomically transitions a sample to a new state and appends an immutable audit event.
/// This is the ONLY place state changes are written — the orchestrator always goes through here.
///
/// Every state change is routed through SampleStateMachine.Apply (Penancia.S.Domain.Workflow)
/// with a SampleEvent — never by assigning a target state directly. A failed transition
/// throws InvalidOperationException carrying the machine's failure reason; the orchestrator
/// catches and moves the sample to Failed (via the machine's UnrecoverableError event).
///
/// Lock rule: a locked sample (IsLocked) rejects every event EXCEPT SignedOff from
/// AwaitingSignoff. That single exemption exists because FinalizeReleaseActivity sets
/// IsLocked = true immediately before the release transition runs, as part of the same
/// release sequence — and Apply still re-validates the sign-off itself (signer role,
/// signer != data enterer, signed version + content hash). Any other event on a locked
/// sample throws.
///
/// Sign-off current values: SampleStateMachine.ValidateSignoff requires the signed report
/// version + content hash to match the CURRENT draft, and the signer to be none of the data
/// enterers. The current values come from the sample row loaded here, read fresh at
/// transition time (not a snapshot taken before the sign-off wait): CurrentReportVersion =
/// sample.ReportVersion, CurrentContentSha256 = sample.ContentSha256, and DataEnterers =
/// the deserialised sample.DataEnterersJson list PLUS sample.CreatedBy (whoever created the
/// sample entered its data, so they must never be able to sign it off). The signed values
/// still come from the caller (the 'sample_signed_off' event payload, via TransitionInput).
/// Release is STILL blocked until draft generation (Stage S5) populates ReportVersion /
/// ContentSha256 / DataEnterersJson: while they are null, ValidateSignoff fails closed with
/// STALE_VERSION / STALE_HASH. That is the intended fail-closed behaviour — do not weaken it
/// by comparing the signed values against themselves.
///
/// Returns the new state name so the orchestrator can track the last-known state (used by
/// its catch block to skip the Failed marking when the sample is already terminal).
/// </summary>
public class TransitionStateActivity
{
    private readonly PenanciaDbContext _db;
    private readonly ILogger<TransitionStateActivity> _logger;

    public TransitionStateActivity(PenanciaDbContext db, ILogger<TransitionStateActivity> logger)
    {
        _db = db;
        _logger = logger;
    }

    [Function(nameof(TransitionStateActivity))]
    public async Task<string> Run(
        [ActivityTrigger] TransitionInput input,
        FunctionContext context)
    {
        _logger.LogInformation(
            "Transitioning sample {SampleId} via event {Event} (reason: {Reason})",
            input.SampleId, input.Event, input.Reason);

        var sample = await _db.Samples.FirstOrDefaultAsync(s => s.SampleId == input.SampleId)
            ?? throw new InvalidOperationException($"Sample {input.SampleId} not found.");

        if (!Enum.TryParse<SampleState>(sample.State, out var currentState))
        {
            throw new InvalidOperationException(
                $"Sample {input.SampleId} has unknown persisted state '{sample.State}'. " +
                "Refusing to transition.");
        }

        // Capture the from-state BEFORE any assignment (audit correctness).
        var previousState = currentState;

        // Locked samples reject every event except the release transition that
        // FinalizeReleaseActivity has just prepared (see class docstring).
        if (sample.IsLocked && !(input.Event == SampleEvent.SignedOff && currentState == SampleState.AwaitingSignoff))
        {
            throw new InvalidOperationException(
                $"Sample {input.SampleId} is locked (IsLocked) in state '{currentState}'. " +
                $"Event '{input.Event}' is rejected.");
        }

        // Sign-off wiring: for SignedOff the CURRENT version/hash and the data-enterer
        // list come from the sample row loaded above — the authoritative source, read
        // fresh at transition time (the draft could have changed during the sign-off
        // wait, so a snapshot taken earlier would be stale). Caller-supplied current
        // values are ignored for SignedOff; for every other event the machine ignores
        // these fields, so the caller-supplied values pass through unchanged.
        IReadOnlyList<string> dataEnterers;
        int? currentReportVersion = input.CurrentReportVersion;
        string? currentContentSha256 = input.CurrentContentSha256;
        if (input.Event == SampleEvent.SignedOff)
        {
            currentReportVersion = sample.ReportVersion;
            currentContentSha256 = sample.ContentSha256;
            dataEnterers = BuildDataEnterers(sample);
        }
        else
        {
            dataEnterers = string.IsNullOrWhiteSpace(sample.CreatedBy)
                ? Array.Empty<string>()
                : new[] { sample.CreatedBy };
        }

        var transitionContext = new TransitionContext(
            ActorId: input.ActorId ?? "Orchestrator",
            ActorRole: input.ActorRole ?? "Orchestrator",
            DataEnterers: dataEnterers,
            FilesAndCalibrationPresent: input.FilesAndCalibrationPresent,
            IsComplete: input.IsComplete,
            SignedReportVersion: input.SignedReportVersion,
            CurrentReportVersion: currentReportVersion,
            SignedContentSha256: input.SignedContentSha256,
            CurrentContentSha256: currentContentSha256,
            Reason: input.Reason);

        // EVERY state change goes through the machine. Never assign sample.State directly.
        var result = SampleStateMachine.Apply(currentState, input.Event, transitionContext);
        if (!result.Success)
        {
            throw new InvalidOperationException(
                $"Transition rejected for sample {input.SampleId}: " +
                $"event '{input.Event}' on state '{currentState}' — {result.FailureReason}");
        }

        sample.State = result.NewState.ToString();

        // Append immutable audit event (from = state captured before the assignment).
        _db.AuditEvents.Add(new AuditEventEntity
        {
            SampleId = input.SampleId,
            Actor = input.ActorId ?? "Orchestrator",
            Action = $"STATE_TRANSITION_{result.NewState.ToString().ToUpperInvariant()}",
            TimestampUtc = DateTime.UtcNow,
            DetailsJson = System.Text.Json.JsonSerializer.Serialize(new
            {
                from = previousState.ToString(),
                to = result.NewState.ToString(),
                @event = input.Event.ToString(),
                reason = input.Reason
            })
        });

        await _db.SaveChangesAsync();

        _logger.LogInformation("Sample {SampleId} state saved as {NewState}.", input.SampleId, result.NewState);
        return result.NewState.ToString();
    }

    /// <summary>
    /// Builds the data-enterer list for sign-off validation: every actor id in
    /// <see cref="SampleEntity.DataEnterersJson"/> (a JSON array of actor-id strings)
    /// PLUS <see cref="SampleEntity.CreatedBy"/>. CreatedBy is always included: whoever
    /// created the sample entered its data, so they must never be able to sign it off
    /// (ValidateSignoff rejects a signer who appears in this list). The list is never
    /// null (TransitionContext.DataEnterers must be non-null); entries are deduplicated
    /// case-insensitively and blank entries are dropped. Malformed DataEnterersJson fails
    /// closed: signer independence cannot be validated from corrupt data, so sign-off is
    /// refused rather than silently validated against a partial list.
    /// </summary>
    private static IReadOnlyList<string> BuildDataEnterers(SampleEntity sample)
    {
        var enterers = new List<string>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        if (!string.IsNullOrWhiteSpace(sample.DataEnterersJson))
        {
            List<string>? stored;
            try
            {
                stored = System.Text.Json.JsonSerializer.Deserialize<List<string>>(sample.DataEnterersJson);
            }
            catch (System.Text.Json.JsonException ex)
            {
                throw new InvalidOperationException(
                    $"Sample {sample.SampleId} has malformed DataEnterersJson; " +
                    "signer independence cannot be validated. Refusing sign-off.", ex);
            }

            if (stored is not null)
            {
                foreach (var actorId in stored)
                {
                    if (!string.IsNullOrWhiteSpace(actorId) && seen.Add(actorId))
                    {
                        enterers.Add(actorId);
                    }
                }
            }
        }

        if (!string.IsNullOrWhiteSpace(sample.CreatedBy) && seen.Add(sample.CreatedBy))
        {
            enterers.Add(sample.CreatedBy);
        }

        return enterers;
    }
}

/// <summary>
/// Input record for TransitionStateActivity. Carries a machine <see cref="SampleEvent"/> — not a
/// target state: the resulting state is decided solely by SampleStateMachine.Apply. Sign-off
/// fields are required for the SignedOff event (Validated by the machine via ValidateSignoff);
/// FilesAndCalibrationPresent gates Submit and IsComplete gates CompletenessReached.
/// </summary>
public record TransitionInput(
    string SampleId,
    SampleEvent Event,
    string Reason,
    string? ActorId = null,
    string? ActorRole = null,
    bool FilesAndCalibrationPresent = false,
    bool IsComplete = false,
    int? SignedReportVersion = null,
    int? CurrentReportVersion = null,
    string? SignedContentSha256 = null,
    string? CurrentContentSha256 = null);
