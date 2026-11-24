using System;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Penancia.S.Api.Application;
using Penancia.S.Data;
using Penancia.S.Data.Entities;
using Xunit;

namespace Penancia.S.Tests;

public class SubmitSampleServiceTests
{
    private static PenanciaDbContext CreateInMemoryDb()
    {
        var options = new DbContextOptionsBuilder<PenanciaDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .ConfigureWarnings(w => w.Ignore(InMemoryEventId.TransactionIgnoredWarning))
            .Options;
        return new PenanciaDbContext(options);
    }

    private static async Task<SampleEntity> SeedReadySampleAsync(
        PenanciaDbContext db,
        string sampleId,
        string ownerId = "patient-1",
        string state = "Draft",
        bool withCalibration = true,
        string mediaStatus = "Cleared")
    {
        Guid? calId = null;
        if (withCalibration)
        {
            var cal = new CalibrationEntity
            {
                CalibrationId = Guid.NewGuid(),
                SampleId = sampleId,
                Status = "Valid",
                TargetId = "thorlabs-r1l3s2p",
                ReferencePitchUm = 10.0,
                MicronsPerPixel = 0.4,
                MeasuredPitchPx = 25.0,
                CreatedAtUtc = DateTime.UtcNow,
                ExpiresAtUtc = DateTime.UtcNow.AddDays(7)
            };
            db.Calibrations.Add(cal);
            calId = cal.CalibrationId;
        }

        var sample = new SampleEntity
        {
            SampleId = sampleId,
            CreatedBy = ownerId,
            CreatedAtUtc = DateTime.UtcNow,
            State = state,
            WorkflowMode = "prescreen",
            CalibrationId = calId
        };
        db.Samples.Add(sample);

        if (!string.IsNullOrEmpty(mediaStatus))
        {
            db.MediaAssets.Add(new MediaAssetEntity
            {
                AssetId = Guid.NewGuid(),
                SampleId = sampleId,
                Kind = "video",
                Container = "quarantine",
                BlobName = $"{sampleId}/{Guid.NewGuid()}.mp4",
                ContentTypeDeclared = "video/mp4",
                Status = mediaStatus,
                SizeBytes = 1024,
                CreatedAtUtc = DateTime.UtcNow
            });
        }

        await db.SaveChangesAsync();
        return sample;
    }

    [Fact]
    public async Task Submit_HappyPath_TransitionsState_AndWritesSingleOutboxRow()
    {
        using var db = CreateInMemoryDb();
        const string sampleId = "s-submit-happy";
        await SeedReadySampleAsync(db, sampleId);

        var service = new SubmitSampleService(db);
        var result = await service.SubmitAsync(new SubmitSampleCommand(
            sampleId, "patient-1", "Patient", IsStaff: false, IdempotencyKey: "key-1"));

        Assert.True(result.Success);
        Assert.Equal(202, result.StatusCode);
        Assert.Equal(sampleId, result.SampleId);
        Assert.Equal("Validating", result.State);
        Assert.NotNull(result.OutboxId);

        db.ChangeTracker.Clear();
        var reloadedSample = await db.Samples.FindAsync(sampleId);
        Assert.Equal("Validating", reloadedSample!.State);

        var outboxRows = await db.OutboxMessages.Where(o => o.SampleId == sampleId).ToListAsync();
        Assert.Single(outboxRows);
        Assert.Equal(result.OutboxId, outboxRows[0].Id);
        Assert.Equal("sample-submit", outboxRows[0].Type);
        Assert.Equal("key-1", outboxRows[0].IdempotencyKey);
        Assert.Null(outboxRows[0].DispatchedAtUtc);
        Assert.Equal(0, outboxRows[0].Attempts);
    }

    [Fact]
    public async Task Submit_NotOwner_Returns403_AndWritesNoOutboxRow()
    {
        using var db = CreateInMemoryDb();
        const string sampleId = "s-submit-not-owner";
        await SeedReadySampleAsync(db, sampleId, ownerId: "patient-owner");

        var service = new SubmitSampleService(db);
        var result = await service.SubmitAsync(new SubmitSampleCommand(
            sampleId, "intruder", "Patient", IsStaff: false, IdempotencyKey: "key-intruder"));

        Assert.False(result.Success);
        Assert.Equal(403, result.StatusCode);
        Assert.Equal("FORBIDDEN", result.ErrorCode);

        Assert.Equal("Draft", (await db.Samples.FindAsync(sampleId))!.State);
        Assert.Empty(await db.OutboxMessages.ToListAsync());
    }

    [Fact]
    public async Task Submit_WrongState_Returns409_AndWritesNoOutboxRow()
    {
        using var db = CreateInMemoryDb();
        const string sampleId = "s-submit-wrong-state";
        await SeedReadySampleAsync(db, sampleId, state: "Analyzing");

        var service = new SubmitSampleService(db);
        var result = await service.SubmitAsync(new SubmitSampleCommand(
            sampleId, "patient-1", "Patient", IsStaff: false, IdempotencyKey: "key-wrong-state"));

        Assert.False(result.Success);
        Assert.Equal(409, result.StatusCode);
        Assert.Equal("INVALID_STATE_TRANSITION", result.ErrorCode);

        Assert.Equal("Analyzing", (await db.Samples.FindAsync(sampleId))!.State);
        Assert.Empty(await db.OutboxMessages.ToListAsync());
    }

    [Fact]
    public async Task Submit_NoCalibration_Returns422_AndWritesNoOutboxRow()
    {
        using var db = CreateInMemoryDb();
        const string sampleId = "s-submit-no-cal";
        await SeedReadySampleAsync(db, sampleId, withCalibration: false);

        var service = new SubmitSampleService(db);
        var result = await service.SubmitAsync(new SubmitSampleCommand(
            sampleId, "patient-1", "Patient", IsStaff: false, IdempotencyKey: "key-no-cal"));

        Assert.False(result.Success);
        Assert.Equal(422, result.StatusCode);
        Assert.Equal("MISSING_CALIBRATION", result.ErrorCode);

        Assert.Equal("Draft", (await db.Samples.FindAsync(sampleId))!.State);
        Assert.Empty(await db.OutboxMessages.ToListAsync());
    }

    [Theory]
    [InlineData("Issued")]
    [InlineData("Uploaded")]
    [InlineData("Rejected")]
    [InlineData("")]
    public async Task Submit_NoClearedMedia_Returns422_AndWritesNoOutboxRow(string mediaStatus)
    {
        using var db = CreateInMemoryDb();
        var sampleId = $"s-submit-no-cleared-{mediaStatus}";
        await SeedReadySampleAsync(db, sampleId, mediaStatus: mediaStatus);

        var service = new SubmitSampleService(db);
        var result = await service.SubmitAsync(new SubmitSampleCommand(
            sampleId, "patient-1", "Patient", IsStaff: false, IdempotencyKey: $"key-{mediaStatus}"));

        Assert.False(result.Success);
        Assert.Equal(422, result.StatusCode);
        Assert.Equal("NO_CLEARED_MEDIA", result.ErrorCode);

        Assert.Equal("Draft", (await db.Samples.FindAsync(sampleId))!.State);
        Assert.Empty(await db.OutboxMessages.ToListAsync());
    }

    [Fact]
    public async Task Submit_OneClearedAndOneUnclearedQuarantineAsset_Returns422ScanPending()
    {
        using var db = CreateInMemoryDb();
        const string sampleId = "s-submit-partial-scan";
        await SeedReadySampleAsync(db, sampleId, mediaStatus: "Cleared");
        db.MediaAssets.Add(new MediaAssetEntity
        {
            AssetId = Guid.NewGuid(),
            SampleId = sampleId,
            Kind = "image",
            Container = "quarantine",
            BlobName = $"{sampleId}/{Guid.NewGuid()}.jpg",
            ContentTypeDeclared = "image/jpeg",
            Status = "Uploaded",
            SizeBytes = 512,
            CreatedAtUtc = DateTime.UtcNow
        });
        await db.SaveChangesAsync();

        var service = new SubmitSampleService(db);
        var result = await service.SubmitAsync(new SubmitSampleCommand(
            sampleId, "patient-1", "Patient", IsStaff: false, IdempotencyKey: "key-partial-scan"));

        Assert.False(result.Success);
        Assert.Equal(422, result.StatusCode);
        Assert.Equal("SCAN_PENDING", result.ErrorCode);

        Assert.Equal("Draft", (await db.Samples.FindAsync(sampleId))!.State);
        Assert.Empty(await db.OutboxMessages.ToListAsync());
    }

    [Fact]
    public async Task Submit_SameIdempotencyKeyTwice_ReturnsSameResult_AndWritesOnlyOneOutboxRow()
    {
        using var db = CreateInMemoryDb();
        const string sampleId = "s-submit-idempotent";
        await SeedReadySampleAsync(db, sampleId);

        var service = new SubmitSampleService(db);
        var cmd = new SubmitSampleCommand(sampleId, "patient-1", "Patient", IsStaff: false, IdempotencyKey: "idem-same-key");

        var first = await service.SubmitAsync(cmd);
        Assert.True(first.Success);
        Assert.Equal(202, first.StatusCode);

        var second = await service.SubmitAsync(cmd);
        Assert.True(second.Success);
        Assert.Equal(202, second.StatusCode);
        Assert.Equal(first.OutboxId, second.OutboxId);
        Assert.Equal(first.State, second.State);

        var outboxRows = await db.OutboxMessages.Where(o => o.SampleId == sampleId).ToListAsync();
        Assert.Single(outboxRows);
    }

    [Fact]
    public async Task Submit_DifferentIdempotencyKeyOnAlreadySubmittedSample_Returns409_AndWritesNoSecondRow()
    {
        using var db = CreateInMemoryDb();
        const string sampleId = "s-submit-diff-key";
        await SeedReadySampleAsync(db, sampleId);

        var service = new SubmitSampleService(db);
        var first = await service.SubmitAsync(new SubmitSampleCommand(
            sampleId, "patient-1", "Patient", IsStaff: false, IdempotencyKey: "key-first"));
        Assert.True(first.Success);
        Assert.Equal(202, first.StatusCode);

        var second = await service.SubmitAsync(new SubmitSampleCommand(
            sampleId, "patient-1", "Patient", IsStaff: false, IdempotencyKey: "key-second"));
        Assert.False(second.Success);
        Assert.Equal(409, second.StatusCode);
        Assert.Equal("INVALID_STATE_TRANSITION", second.ErrorCode);

        var outboxRows = await db.OutboxMessages.Where(o => o.SampleId == sampleId).ToListAsync();
        Assert.Single(outboxRows);
    }

    [Fact]
    public async Task Submit_MissingSample_Returns404()
    {
        using var db = CreateInMemoryDb();
        var service = new SubmitSampleService(db);

        var result = await service.SubmitAsync(new SubmitSampleCommand(
            "nonexistent-sample", "patient-1", "Patient", IsStaff: false, IdempotencyKey: "key-404"));

        Assert.False(result.Success);
        Assert.Equal(404, result.StatusCode);
    }

    [Fact]
    public async Task Submit_MissingIdempotencyKey_Returns400()
    {
        using var db = CreateInMemoryDb();
        var service = new SubmitSampleService(db);

        var result = await service.SubmitAsync(new SubmitSampleCommand(
            "any-sample", "patient-1", "Patient", IsStaff: false, IdempotencyKey: ""));

        Assert.False(result.Success);
        Assert.Equal(400, result.StatusCode);
        Assert.Equal("IDEMPOTENCY_KEY_REQUIRED", result.ErrorCode);
    }
}
