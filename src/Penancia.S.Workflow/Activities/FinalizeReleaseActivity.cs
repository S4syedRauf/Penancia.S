using Microsoft.Azure.Functions.Worker;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Penancia.S.Data;
using Penancia.S.Data.Entities;
using Penancia.S.Domain.Workflow;

namespace Penancia.S.Workflow.Activities;

/// <summary>
/// Finalizes sample release after clinical sign-off.
/// Responsibilities:
/// 1. Promotes DraftReportPdfUri → FinalReportPdfUri (immutable after this point).
/// 2. Sets IsLocked = true — no further edits permitted on the entity.
/// 3. Appends a final REPORT_RELEASED audit event with signoff metadata.
///
/// Guards (all fail closed, before any write):
/// - Throws if DraftReportPdfUri is null/empty — there is no real PDF to promote.
/// - Throws if the sample is not in AwaitingSignoff.
/// - Throws if already locked (IsLocked) — a second run must never re-promote or append
///   a duplicate REPORT_RELEASED event.
///
/// Ordering with the state machine: this activity runs WHILE the sample is still
/// AwaitingSignoff, and the orchestrator then applies the SignedOff event via
/// TransitionStateActivity, which the machine turns into Released. TransitionStateActivity
/// exempts exactly that SignedOff-from-AwaitingSignoff step from its lock rejection,
/// because this activity has just set IsLocked as part of the same release sequence.
///
/// Clinical Invariant: Once released, a sample is immutable. The audit trail must be complete.
/// Any subsequent attempt to edit a released sample is rejected by SampleStateMachine.
/// </summary>
public class FinalizeReleaseActivity
{
    private readonly PenanciaDbContext _db;
    private readonly ILogger<FinalizeReleaseActivity> _logger;

    public FinalizeReleaseActivity(PenanciaDbContext db, ILogger<FinalizeReleaseActivity> logger)
    {
        _db = db;
        _logger = logger;
    }

    [Function(nameof(FinalizeReleaseActivity))]
    public async Task Run(
        [ActivityTrigger] FinalizeInput input,
        FunctionContext context)
    {
        _logger.LogInformation(
            "Finalizing release for sample {SampleId} (signoff: {SignoffData})",
            input.SampleId, input.SignoffData);

        var sample = await _db.Samples.FirstOrDefaultAsync(s => s.SampleId == input.SampleId)
            ?? throw new InvalidOperationException($"Sample {input.SampleId} not found.");

        // Fail-closed guards — all checked before any write.
        if (sample.IsLocked)
        {
            throw new InvalidOperationException(
                $"Sample {input.SampleId} is already locked/finalized. " +
                "Refusing a second finalize run (would re-promote and duplicate REPORT_RELEASED).");
        }

        if (sample.State != nameof(SampleState.AwaitingSignoff))
        {
            throw new InvalidOperationException(
                $"Sample {input.SampleId} is in state '{sample.State}', not '{nameof(SampleState.AwaitingSignoff)}'. " +
                "Finalize is only valid while awaiting sign-off.");
        }

        if (string.IsNullOrWhiteSpace(sample.DraftReportPdfUri))
        {
            throw new InvalidOperationException(
                $"Sample {input.SampleId} has no DraftReportPdfUri. " +
                "No real PDF exists to promote to FinalReportPdfUri.");
        }

        // Promote draft → final (immutable)
        sample.FinalReportPdfUri = sample.DraftReportPdfUri;
        sample.IsLocked = true;

        // Append the terminal audit event
        _db.AuditEvents.Add(new AuditEventEntity
        {
            SampleId = input.SampleId,
            Actor = "Orchestrator",
            Action = "REPORT_RELEASED",
            TimestampUtc = DateTime.UtcNow,
            DetailsJson = System.Text.Json.JsonSerializer.Serialize(new
            {
                signoff_data = input.SignoffData,
                final_pdf_uri = sample.FinalReportPdfUri,
                locked = true
            })
        });

        await _db.SaveChangesAsync();

        _logger.LogInformation(
            "Sample {SampleId} finalized. Final PDF: {FinalUri}",
            input.SampleId, sample.FinalReportPdfUri);
    }
}

/// <summary>Input record for FinalizeReleaseActivity.</summary>
public record FinalizeInput(string SampleId, string SignoffData);
