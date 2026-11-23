using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Penancia.S.Api.Controllers.V1;
using Penancia.S.Data;
using Penancia.S.Data.Entities;
using Penancia.S.Domain.Workflow;
using Penancia.S.Workflow.Activities;
using Xunit;

namespace Penancia.S.Tests;

public class SampleReadinessTests
{
    private SampleReadinessSnapshot CreateValidSample(
        string workflowMode = "prescreen",
        DateTime? expiresAt = null)
    {
        return new SampleReadinessSnapshot(
            SampleId: "test-ready-sample",
            WorkflowMode: workflowMode,
            ConsentAtUtc: DateTime.UtcNow.AddHours(-1),
            ChamberTypeId: workflowMode == "clinical" ? "leja-sc-20-01-02-b-ce" : null,
            ChamberDepthMicrons: workflowMode == "clinical" ? 20.0 : null,
            Calibration: new CalibrationReadinessSnapshot(
                Status: "Valid",
                ExpiresAtUtc: expiresAt ?? DateTime.UtcNow.AddDays(7),
                MicronsPerPixel: 0.4000
            )
        );
    }

    private List<MediaAssetReadinessSnapshot> CreateValidMedia(string status = "Verified")
    {
        return new List<MediaAssetReadinessSnapshot>
        {
            new(Guid.NewGuid(), status, "video")
        };
    }

    private (PenanciaDbContext db, SamplesController controller) CreateSamplesController(
        string userId = "user-123",
        bool isStaff = false)
    {
        var options = new DbContextOptionsBuilder<PenanciaDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;
        var db = new PenanciaDbContext(options);

        var logger = NullLogger<SamplesController>.Instance;
        var controller = new SamplesController(db, null!, null!, null!, logger);

        var claims = new List<Claim>
        {
            new Claim("oid", userId),
            new Claim(ClaimTypes.Name, userId)
        };
        if (isStaff)
        {
            claims.Add(new Claim(ClaimTypes.Role, "Technician"));
        }

        var identity = new ClaimsIdentity(claims, "TestAuth");
        var principal = new ClaimsPrincipal(identity);
        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext { User = principal }
        };

        return (db, controller);
    }

    [Fact]
    public void ReadySample_PassesAllPrerequisites()
    {
        var sample = CreateValidSample();
        var media = CreateValidMedia();

        var result = SampleReadiness.Check(sample, media);

        Assert.True(result.IsReady);
        Assert.Empty(result.MissingReasons);
    }

    [Fact]
    public void MissingConsent_ReturnsMissingConsentCode()
    {
        var sample = CreateValidSample() with { ConsentAtUtc = null };
        var media = CreateValidMedia();

        var result = SampleReadiness.Check(sample, media);

        Assert.False(result.IsReady);
        Assert.Contains(PrerequisiteReasonCodes.MissingConsent, result.MissingReasons);
    }

    [Fact]
    public void MissingCalibration_ReturnsMissingCalibrationCode()
    {
        var sample = CreateValidSample() with { Calibration = null };
        var media = CreateValidMedia();

        var result = SampleReadiness.Check(sample, media);

        Assert.False(result.IsReady);
        Assert.Contains(PrerequisiteReasonCodes.MissingCalibration, result.MissingReasons);
    }

    [Fact]
    public void CalibrationNotValid_ReturnsCalibrationNotValidCode()
    {
        var sample = CreateValidSample();
        var pendingCal = sample.Calibration! with { Status = "Pending" };
        sample = sample with { Calibration = pendingCal };
        var media = CreateValidMedia();

        var result = SampleReadiness.Check(sample, media);

        Assert.False(result.IsReady);
        Assert.Contains(PrerequisiteReasonCodes.CalibrationNotValid, result.MissingReasons);
    }

    [Fact]
    public void ExpiredCalibration_ReturnsCalibrationExpiredCode()
    {
        var sample = CreateValidSample(expiresAt: DateTime.UtcNow.AddMinutes(-5));
        var media = CreateValidMedia();

        var result = SampleReadiness.Check(sample, media);

        Assert.False(result.IsReady);
        Assert.Contains(PrerequisiteReasonCodes.CalibrationExpired, result.MissingReasons);
    }

    [Fact]
    public void MissingMedia_ReturnsMissingMediaCode()
    {
        var sample = CreateValidSample();
        var media = new List<MediaAssetReadinessSnapshot>();

        var result = SampleReadiness.Check(sample, media);

        Assert.False(result.IsReady);
        Assert.Contains(PrerequisiteReasonCodes.MissingMedia, result.MissingReasons);
    }

    [Theory]
    [InlineData("Issued")]
    [InlineData("Rejected")]
    [InlineData("Cleared")]
    public void MediaNotUploadedOrVerified_ReturnsCorrectReasonCode(string invalidStatus)
    {
        var sample = CreateValidSample();
        var media = CreateValidMedia(status: invalidStatus);

        var result = SampleReadiness.Check(sample, media);

        Assert.False(result.IsReady);
        Assert.Contains(PrerequisiteReasonCodes.MediaNotUploadedOrVerified, result.MissingReasons);
    }

    [Fact]
    public void ClinicalMode_MissingChamber_ReturnsMissingChamberCode()
    {
        var sample = CreateValidSample(workflowMode: "clinical") with
        {
            ChamberTypeId = null,
            ChamberDepthMicrons = null
        };
        var media = CreateValidMedia();

        var result = SampleReadiness.Check(sample, media);

        Assert.False(result.IsReady);
        Assert.Contains(PrerequisiteReasonCodes.MissingChamber, result.MissingReasons);
    }

    [Fact]
    public async Task CreateSample_LeavesUnmeasuredFieldsNull_AndSetsCatalogueDepth()
    {
        var (db, controller) = CreateSamplesController(userId: "doc-123");
        var req = new CreateSampleRequest(
            SampleId: "sample-alpha-1",
            SampleName: "Sample Alpha",
            MicronsPerPixel: null,
            MediaType: "video",
            Metadata: null,
            ChamberTypeId: "leja-sc-20-01-02-b-ce",
            WorkflowMode: "prescreen"
        );

        var result = await controller.CreateSample(req) as CreatedResult;
        Assert.NotNull(result);
        Assert.Equal(201, result.StatusCode);

        var sample = await db.Samples.FirstAsync(s => s.SampleId == "sample-alpha-1");
        Assert.Null(sample.MicronsPerPixel);
        Assert.Null(sample.FramesPerSecond);
        Assert.Equal(20.0, sample.ChamberDepthMicrons);
        Assert.Equal("leja-sc-20-01-02-b-ce", sample.ChamberTypeId);
        Assert.Equal("prescreen", sample.WorkflowMode);
    }

    [Fact]
    public async Task CreateSample_RejectsUnknownChamberType_With422()
    {
        var (_, controller) = CreateSamplesController(userId: "doc-123");
        var req = new CreateSampleRequest(
            SampleId: "sample-bad-1",
            SampleName: "Sample Bad",
            MicronsPerPixel: null,
            MediaType: "video",
            Metadata: null,
            ChamberTypeId: "unregistered-custom-slide",
            WorkflowMode: "clinical"
        );

        var result = await controller.CreateSample(req) as ObjectResult;
        Assert.NotNull(result);
        Assert.Equal(422, result.StatusCode);
    }

    [Fact]
    public async Task TriggerAnalysis_PrerequisitesMissing_Returns422_WithMissingReasonList()
    {
        var (db, controller) = CreateSamplesController(userId: "owner-1");
        var sample = new SampleEntity
        {
            SampleId = "sample-missing-pre",
            CreatedBy = "owner-1",
            State = "Draft",
            WorkflowMode = "prescreen",
            ConsentAtUtc = null
        };
        db.Samples.Add(sample);
        await db.SaveChangesAsync();

        var result = await controller.TriggerAnalysis(sample.SampleId) as ObjectResult;
        Assert.NotNull(result);
        Assert.Equal(422, result.StatusCode);
    }

    [Fact]
    public async Task TriggerAnalysis_AllPrerequisitesMet_PassesAndCopiesMicronsPerPixel()
    {
        var (db, controller) = CreateSamplesController(userId: "owner-2");
        var cal = new CalibrationEntity
        {
            CalibrationId = Guid.NewGuid(),
            SampleId = "sample-ready-2",
            Status = "Valid",
            MicronsPerPixel = 0.4000,
            MeasuredPitchPx = 25.0,
            TargetId = "thorlabs-r1l3s2p",
            ReferencePitchUm = 10.0,
            CreatedAtUtc = DateTime.UtcNow,
            ExpiresAtUtc = DateTime.UtcNow.AddDays(7)
        };
        db.Calibrations.Add(cal);

        var sample = new SampleEntity
        {
            SampleId = "sample-ready-2",
            CreatedBy = "owner-2",
            State = "Draft",
            WorkflowMode = "prescreen",
            ConsentAtUtc = DateTime.UtcNow.AddHours(-1),
            CalibrationId = cal.CalibrationId,
            MicronsPerPixel = null // Initially null
        };
        db.Samples.Add(sample);

        var asset = new MediaAssetEntity
        {
            AssetId = Guid.NewGuid(),
            SampleId = sample.SampleId,
            Kind = "video",
            Container = "raw-videos",
            BlobName = "video.mp4",
            ContentTypeDeclared = "video/mp4",
            SizeBytes = 4096,
            Status = "Verified"
        };
        db.MediaAssets.Add(asset);
        await db.SaveChangesAsync();

        var result = await controller.TriggerAnalysis(sample.SampleId) as OkObjectResult;
        Assert.NotNull(result);
        Assert.Equal(200, result.StatusCode);

        // Verify MicronsPerPixel was copied from calibration
        Assert.Equal(0.4000, sample.MicronsPerPixel);
    }

    [Fact]
    public async Task ValidateFilesActivity_VerifiesStoredTruth_AndCopiesMicronsPerPixel()
    {
        var options = new DbContextOptionsBuilder<PenanciaDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;
        var db = new PenanciaDbContext(options);

        var cal = new CalibrationEntity
        {
            CalibrationId = Guid.NewGuid(),
            SampleId = "sample-wf-1",
            Status = "Valid",
            MicronsPerPixel = 0.4000,
            MeasuredPitchPx = 25.0,
            TargetId = "thorlabs-r1l3s2p",
            ReferencePitchUm = 10.0,
            CreatedAtUtc = DateTime.UtcNow,
            ExpiresAtUtc = DateTime.UtcNow.AddDays(7)
        };
        db.Calibrations.Add(cal);

        var sample = new SampleEntity
        {
            SampleId = "sample-wf-1",
            CreatedBy = "owner-1",
            State = "Draft",
            WorkflowMode = "prescreen",
            ConsentAtUtc = DateTime.UtcNow.AddHours(-1),
            CalibrationId = cal.CalibrationId,
            MicronsPerPixel = null
        };
        db.Samples.Add(sample);

        var asset = new MediaAssetEntity
        {
            AssetId = Guid.NewGuid(),
            SampleId = sample.SampleId,
            Kind = "video",
            Container = "raw-videos",
            BlobName = "video.mp4",
            ContentTypeDeclared = "video/mp4",
            SizeBytes = 4096,
            Status = "Uploaded"
        };
        db.MediaAssets.Add(asset);
        await db.SaveChangesAsync();

        var activityLogger = NullLogger<ValidateFilesActivity>.Instance;
        var activity = new ValidateFilesActivity(db, activityLogger);

        var result = await activity.Run(sample.SampleId);
        Assert.True(result);

        var refreshed = await db.Samples.FirstAsync(s => s.SampleId == sample.SampleId);
        Assert.Equal(0.4000, refreshed.MicronsPerPixel);
    }
}
