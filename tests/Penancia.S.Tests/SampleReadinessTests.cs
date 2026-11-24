using System.Net;
using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
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
    private class FakeHttpMessageHandler : HttpMessageHandler
    {
        private readonly HttpStatusCode _statusCode;
        public HttpRequestMessage? LastRequest { get; private set; }

        public FakeHttpMessageHandler(HttpStatusCode statusCode = HttpStatusCode.Accepted)
        {
            _statusCode = statusCode;
        }

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            LastRequest = request;
            var response = new HttpResponseMessage(_statusCode);
            return Task.FromResult(response);
        }
    }

    private class FakeHttpClientFactory : IHttpClientFactory
    {
        private readonly HttpMessageHandler _handler;
        public FakeHttpClientFactory(HttpMessageHandler handler) => _handler = handler;
        public HttpClient CreateClient(string name) => new HttpClient(_handler)
        {
            BaseAddress = new Uri("https://fake-workflow.local/")
        };
    }

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

    private (PenanciaDbContext db, SamplesController controller, FakeHttpMessageHandler handler) CreateSamplesController(
        string userId = "user-123",
        bool isStaff = false,
        HttpStatusCode workflowStatusCode = HttpStatusCode.Accepted,
        string? functionKey = "test-key-123")
    {
        var options = new DbContextOptionsBuilder<PenanciaDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;
        var db = new PenanciaDbContext(options);

        var inMemorySettings = new Dictionary<string, string?>();
        if (functionKey != null)
        {
            inMemorySettings["Workflow:FunctionKey"] = functionKey;
        }
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(inMemorySettings)
            .Build();

        var handler = new FakeHttpMessageHandler(workflowStatusCode);
        var httpFactory = new FakeHttpClientFactory(handler);

        var logger = NullLogger<SamplesController>.Instance;
        var controller = new SamplesController(db, null!, httpFactory, config, logger);

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

        return (db, controller, handler);
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

    [Theory]
    [InlineData(null)]
    [InlineData(0.0)]
    [InlineData(-0.5)]
    public void Calibration_WithNullOrZeroMicronsPerPixel_FailsWithCalibrationNotValid(double? umPerPx)
    {
        var sample = CreateValidSample();
        var invalidCal = sample.Calibration! with { Status = "Valid", MicronsPerPixel = umPerPx };
        sample = sample with { Calibration = invalidCal };
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
    public void Calibration_WithNullExpiresAtUtc_FailsWithCalibrationExpired()
    {
        var sample = CreateValidSample();
        var neverExpCal = sample.Calibration! with { Status = "Valid", ExpiresAtUtc = null };
        sample = sample with { Calibration = neverExpCal };
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

    [Fact]
    public void OnlyCalibrationAssetPresent_FailsWithMissingMedia()
    {
        var sample = CreateValidSample();
        // A calibration asset alone must NOT satisfy sample semen media
        var media = new List<MediaAssetReadinessSnapshot>
        {
            new(Guid.NewGuid(), "Verified", "calibration")
        };

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

    [Theory]
    [InlineData("clinical ")]
    [InlineData(" Clinical")]
    [InlineData("CLINICAL")]
    public void ClinicalMode_Normalized_EnforcesChamberCheck(string rawMode)
    {
        var sample = CreateValidSample(workflowMode: rawMode) with
        {
            ChamberTypeId = null,
            ChamberDepthMicrons = null
        };
        var media = CreateValidMedia();

        var result = SampleReadiness.Check(sample, media);

        Assert.False(result.IsReady);
        Assert.Contains(PrerequisiteReasonCodes.MissingChamber, result.MissingReasons);
    }

    [Theory]
    [InlineData("Clinic")]
    [InlineData("unknown_mode")]
    [InlineData("prescreen_v2")]
    public void InvalidWorkflowMode_FailsWithInvalidWorkflowModeCode(string invalidMode)
    {
        var sample = CreateValidSample(workflowMode: invalidMode);
        var media = CreateValidMedia();

        var result = SampleReadiness.Check(sample, media);

        Assert.False(result.IsReady);
        Assert.Contains(PrerequisiteReasonCodes.InvalidWorkflowMode, result.MissingReasons);
    }

    [Fact]
    public async Task CreateSample_LeavesUnmeasuredFieldsNull_AndSetsCatalogueDepth()
    {
        var (db, controller, _) = CreateSamplesController(userId: "doc-123");
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
    public async Task CreateSample_RejectsInventedCalibration_With422()
    {
        var (_, controller, _) = CreateSamplesController(userId: "doc-123");
        var req = new CreateSampleRequest(
            SampleId: "sample-invented-calib",
            MicronsPerPixel: 0.4000, // Invented value supplied by client
            WorkflowMode: "prescreen"
        );

        var result = await controller.CreateSample(req) as ObjectResult;
        Assert.NotNull(result);
        Assert.Equal(422, result.StatusCode);
    }

    [Theory]
    [InlineData("Clinic")]
    [InlineData("unsupported")]
    public async Task CreateSample_RejectsInvalidWorkflowMode_With422(string badMode)
    {
        var (_, controller, _) = CreateSamplesController(userId: "doc-123");
        var req = new CreateSampleRequest(
            SampleId: "sample-bad-mode",
            WorkflowMode: badMode
        );

        var result = await controller.CreateSample(req) as ObjectResult;
        Assert.NotNull(result);
        Assert.Equal(422, result.StatusCode);
    }

    [Fact]
    public async Task CreateSample_RejectsUnknownChamberType_With422()
    {
        var (_, controller, _) = CreateSamplesController(userId: "doc-123");
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
        var (db, controller, _) = CreateSamplesController(userId: "owner-1");
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
    public async Task TriggerAnalysis_LeavesStateAsDraft_AndCallsWorkflow()
    {
        var (db, controller, handler) = CreateSamplesController(
            userId: "owner-2",
            workflowStatusCode: HttpStatusCode.Accepted);

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
            Status = "Verified"
        };
        db.MediaAssets.Add(asset);
        await db.SaveChangesAsync();

        var result = await controller.TriggerAnalysis(sample.SampleId) as AcceptedResult;
        Assert.NotNull(result);
        Assert.Equal(202, result.StatusCode);

        // Verify state remains Draft (not changed to Validating)
        var freshSample = await db.Samples.FirstAsync(s => s.SampleId == sample.SampleId);
        Assert.Equal("Draft", freshSample.State);

        // Verify workflow HTTP endpoint was called
        Assert.NotNull(handler.LastRequest);
        Assert.Equal(HttpMethod.Post, handler.LastRequest.Method);
        Assert.Contains(sample.SampleId, handler.LastRequest.RequestUri?.ToString());
    }

    [Fact]
    public async Task TriggerAnalysis_Returns503_WhenWorkflowNotConfigured()
    {
        var (db, controller, _) = CreateSamplesController(
            userId: "owner-503",
            functionKey: null); // Missing function key

        var cal = new CalibrationEntity
        {
            CalibrationId = Guid.NewGuid(),
            SampleId = "sample-ready-503",
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
            SampleId = "sample-ready-503",
            CreatedBy = "owner-503",
            State = "Draft",
            WorkflowMode = "prescreen",
            ConsentAtUtc = DateTime.UtcNow.AddHours(-1),
            CalibrationId = cal.CalibrationId
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

        var result = await controller.TriggerAnalysis(sample.SampleId) as ObjectResult;
        Assert.NotNull(result);
        Assert.Equal(503, result.StatusCode);
    }

    [Fact]
    public async Task TriggerAnalysis_Returns502_WhenWorkflowStartFails()
    {
        var (db, controller, _) = CreateSamplesController(
            userId: "owner-502",
            workflowStatusCode: HttpStatusCode.InternalServerError); // Upstream error

        var cal = new CalibrationEntity
        {
            CalibrationId = Guid.NewGuid(),
            SampleId = "sample-ready-502",
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
            SampleId = "sample-ready-502",
            CreatedBy = "owner-502",
            State = "Draft",
            WorkflowMode = "prescreen",
            ConsentAtUtc = DateTime.UtcNow.AddHours(-1),
            CalibrationId = cal.CalibrationId
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

        var result = await controller.TriggerAnalysis(sample.SampleId) as ObjectResult;
        Assert.NotNull(result);
        Assert.Equal(502, result.StatusCode);
    }

    [Fact]
    public void SampleReadiness_VideoAssetNotReady_AndCalibrationVerified_ReturnsMediaNotReady()
    {
        // R7: video/image asset not ready (Status = "Issued") + calibration asset Verified -> NOT ready (returns MEDIA_NOT_UPLOADED_OR_VERIFIED)
        var sample = CreateValidSample();
        var mediaAssets = new List<MediaAssetReadinessSnapshot>
        {
            new(Guid.NewGuid(), "Verified", "calibration"),
            new(Guid.NewGuid(), "Issued", "video")
        };

        var result = SampleReadiness.Check(sample, mediaAssets);

        Assert.False(result.IsReady);
        Assert.Contains(PrerequisiteReasonCodes.MediaNotUploadedOrVerified, result.MissingReasons);
    }

    [Fact]
    public async Task TriggerAnalysis_WhenPrerequisitesMissing_Returns422_AndNeverCallsWorkflow()
    {
        // V1: TriggerAnalysis returns 422 with reason list when readiness fails and does not call workflow starter.
        var (db, controller, handler) = CreateSamplesController();
        string sampleId = "sample-v1-unready";
        var sample = new SampleEntity
        {
            SampleId = sampleId,
            CreatedBy = "user-123",
            State = "Draft",
            WorkflowMode = "prescreen",
            ConsentAtUtc = null // Missing consent -> unready
        };
        db.Samples.Add(sample);
        await db.SaveChangesAsync();

        var actionResult = await controller.TriggerAnalysis(sampleId);
        var objectResult = Assert.IsType<ObjectResult>(actionResult);
        Assert.Equal(422, objectResult.StatusCode);

        // Assert workflow HTTP client was NEVER invoked
        Assert.Null(handler.LastRequest);
    }

    [Fact]
    public async Task ValidateFilesActivity_VerifiesStoredTruth_WithoutModifyingSample()
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
            MicronsPerPixel = null // Remains null: ValidateFilesActivity never copies calibration values
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
        // Assert ValidateFilesActivity did NOT write to sample.MicronsPerPixel
        Assert.Null(refreshed.MicronsPerPixel);
    }
}
