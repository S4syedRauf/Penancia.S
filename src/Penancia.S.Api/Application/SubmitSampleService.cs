using System;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Penancia.S.Data;
using Penancia.S.Data.Entities;
using Penancia.S.Domain.Workflow;

namespace Penancia.S.Api.Application;

public sealed record SubmitSampleCommand(
    string SampleId,
    string CallerId,
    string CallerRole,
    bool IsStaff,
    string IdempotencyKey);

public sealed record SubmitSampleResult(
    int StatusCode,
    bool Success,
    string? ErrorCode = null,
    string? Message = null,
    string? SampleId = null,
    string? State = null,
    Guid? OutboxId = null);

/// <summary>
/// Transactional sample submission service (Phase 2 Step 2.5).
/// Verifies ownership, state machine transition, calibration and cleared media,
/// and atomically updates sample state + inserts one outbox row in a single IDbContextTransaction.
/// </summary>
public class SubmitSampleService
{
    private readonly PenanciaDbContext _db;

    public SubmitSampleService(PenanciaDbContext db)
    {
        _db = db ?? throw new ArgumentNullException(nameof(db));
    }

    public async Task<SubmitSampleResult> SubmitAsync(SubmitSampleCommand cmd, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(cmd.IdempotencyKey))
        {
            return new SubmitSampleResult(400, false, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key header is required.");
        }

        var sample = await _db.Samples
            .Include(s => s.Calibration)
            .FirstOrDefaultAsync(s => s.SampleId == cmd.SampleId && !s.IsDeleted, cancellationToken);

        if (sample == null)
        {
            return new SubmitSampleResult(404, false, "SAMPLE_NOT_FOUND", $"Sample {cmd.SampleId} not found.");
        }

        if (sample.CreatedBy != cmd.CallerId && !cmd.IsStaff)
        {
            return new SubmitSampleResult(403, false, "FORBIDDEN", "Caller is not authorized to submit this sample.");
        }

        // Idempotent replay check: same IdempotencyKey for this sample returns the existing outbox result
        var existingByKey = await _db.OutboxMessages
            .AsNoTracking()
            .FirstOrDefaultAsync(o => o.IdempotencyKey == cmd.IdempotencyKey, cancellationToken);

        if (existingByKey != null)
        {
            if (!string.Equals(existingByKey.SampleId, cmd.SampleId, StringComparison.Ordinal))
            {
                return new SubmitSampleResult(409, false, "IDEMPOTENCY_KEY_CONFLICT", "Idempotency-Key was already used for another sample.");
            }

            return new SubmitSampleResult(
                202,
                true,
                SampleId: sample.SampleId,
                State: sample.State,
                OutboxId: existingByKey.Id);
        }

        if (!Enum.TryParse<SampleState>(sample.State, ignoreCase: true, out var currentState))
        {
            return new SubmitSampleResult(422, false, "INVALID_STATE", $"Sample {cmd.SampleId} has unrecognised state '{sample.State}'.");
        }

        if (sample.IsLocked || SampleStateMachine.IsTerminal(currentState) || currentState != SampleState.Draft)
        {
            return new SubmitSampleResult(409, false, "INVALID_STATE_TRANSITION", $"Sample {cmd.SampleId} is in state '{sample.State}' and cannot be submitted.");
        }

        if (sample.Calibration == null)
        {
            return new SubmitSampleResult(422, false, "MISSING_CALIBRATION", "Sample requires a calibration record before submission.");
        }

        var assets = await _db.MediaAssets
            .Where(a => a.SampleId == cmd.SampleId)
            .ToListAsync(cancellationToken);

        var mediaAssets = assets.Where(a =>
            string.Equals(a.Kind, "video", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(a.Kind, "image", StringComparison.OrdinalIgnoreCase)).ToList();

        if (!mediaAssets.Any(a => string.Equals(a.Status, "Cleared", StringComparison.OrdinalIgnoreCase)))
        {
            return new SubmitSampleResult(422, false, "NO_CLEARED_MEDIA", "Sample requires at least one malware-cleared media asset before submission.");
        }

        // Scan gate: no quarantine media asset may remain uncleared
        if (mediaAssets.Any(a =>
            string.Equals(a.Container, "quarantine", StringComparison.OrdinalIgnoreCase) &&
            !string.Equals(a.Status, "Cleared", StringComparison.OrdinalIgnoreCase)))
        {
            return new SubmitSampleResult(422, false, "SCAN_PENDING", "All quarantine media assets must pass malware scan before submission.");
        }

        var ctx = new TransitionContext(
            cmd.CallerId,
            cmd.CallerRole,
            Array.Empty<string>(),
            FilesAndCalibrationPresent: true);

        var transition = SampleStateMachine.Apply(currentState, SampleEvent.Submit, ctx);
        if (!transition.Success)
        {
            return new SubmitSampleResult(409, false, "INVALID_STATE_TRANSITION", transition.FailureReason);
        }

        using IDbContextTransaction tx = await _db.Database.BeginTransactionAsync(cancellationToken);

        sample.State = transition.NewState.ToString();

        var outbox = new OutboxMessageEntity
        {
            Id = Guid.NewGuid(),
            SampleId = sample.SampleId,
            Type = "sample-submit",
            PayloadJson = JsonSerializer.Serialize(new
            {
                sampleId = sample.SampleId,
                submittedBy = cmd.CallerId,
                submittedAtUtc = DateTime.UtcNow
            }),
            CreatedAtUtc = DateTime.UtcNow,
            DispatchedAtUtc = null,
            Attempts = 0,
            IdempotencyKey = cmd.IdempotencyKey
        };

        _db.OutboxMessages.Add(outbox);
        await _db.SaveChangesAsync(cancellationToken);
        await tx.CommitAsync(cancellationToken);

        return new SubmitSampleResult(
            202,
            true,
            SampleId: sample.SampleId,
            State: sample.State,
            OutboxId: outbox.Id);
    }
}
