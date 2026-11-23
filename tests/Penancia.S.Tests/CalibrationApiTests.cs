using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Penancia.S.Api.Controllers.V1;
using Penancia.S.Api.Services;
using Penancia.S.Data;
using Penancia.S.Data.Entities;
using Xunit;

namespace Penancia.S.Tests;

public class CalibrationApiTests
{
    private (PenanciaDbContext db, CalibrationController controller, CalibrationResultService service) CreateSut(
        string userId = "user-123",
        bool isStaff = false,
        bool demoMode = false)
    {
        var options = new DbContextOptionsBuilder<PenanciaDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;
        var db = new PenanciaDbContext(options);

        var inMemorySettings = new Dictionary<string, string?>
        {
            { "DEMO_MODE", demoMode ? "true" : "false" },
            { "Calibration:ValidityDays", "7" }
        };
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(inMemorySettings)
            .Build();

        var service = new CalibrationResultService(db, config, NullLogger<CalibrationResultService>.Instance);
        var logger = NullLogger<CalibrationController>.Instance;
        var controller = new CalibrationController(logger, db, config, service);

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

        return (db, controller, service);
    }

    [Fact]
    public void LegacyCalibration_Returns410_WhenDemoModeIsOff()
    {
        var (_, controller, _) = CreateSut(demoMode: false);
        var req = new CalibrationRequest
        {
            GridLineCount = 10,
            FieldWidthUm = 500.0,
            SpacingVariancePct = 2.0
        };

        var result = controller.PostCalibration(req) as ObjectResult;
        Assert.NotNull(result);
        Assert.Equal(410, result.StatusCode);
    }

    [Fact]
    public void LegacyCalibration_Returns200_WhenDemoModeIsOn_WithDemoNotMeasured()
    {
        var (_, controller, _) = CreateSut(demoMode: true);
        var req = new CalibrationRequest
        {
            GridLineCount = 10,
            FieldWidthUm = 500.0,
            SpacingVariancePct = 2.0
        };

        var result = controller.PostCalibration(req) as OkObjectResult;
        Assert.NotNull(result);
        Assert.Equal(200, result.StatusCode);

        var json = JsonSerializer.Serialize(result.Value);
        Assert.Contains("\"demo\":true", json);
        Assert.Contains("\"status\":\"DEMO_NOT_MEASURED\"", json);
        Assert.DoesNotContain("Micrometer Verified", json);
    }

    [Fact]
    public async Task PostSampleCalibration_RejectsUnknownTarget_With422()
    {
        var (db, controller, _) = CreateSut();
        var sample = new SampleEntity
        {
            SampleId = "sample-test-1",
            CreatedBy = "user-123",
            State = "Draft"
        };
        db.Samples.Add(sample);
        await db.SaveChangesAsync();

        var req = new StartCalibrationRequest
        {
            AssetId = Guid.NewGuid(),
            TargetId = "unknown-ruler-99"
        };

        var result = await controller.PostSampleCalibration(sample.SampleId, req) as ObjectResult;
        Assert.NotNull(result);
        Assert.Equal(422, result.StatusCode);
    }

    [Fact]
    public async Task PostSampleCalibration_RejectsUnverifiedAsset_With422()
    {
        var (db, controller, _) = CreateSut();
        var sample = new SampleEntity
        {
            SampleId = "sample-test-2",
            CreatedBy = "user-123",
            State = "Draft"
        };
        db.Samples.Add(sample);

        var asset = new MediaAssetEntity
        {
            AssetId = Guid.NewGuid(),
            SampleId = sample.SampleId,
            Kind = "calibration",
            Container = "raw-images",
            BlobName = "calib.jpg",
            ContentTypeDeclared = "image/jpeg",
            SizeBytes = 1024,
            Status = "Uploaded" // Not yet verified
        };
        db.MediaAssets.Add(asset);
        await db.SaveChangesAsync();

        var req = new StartCalibrationRequest
        {
            AssetId = asset.AssetId,
            TargetId = "thorlabs-r1l3s2p"
        };

        var result = await controller.PostSampleCalibration(sample.SampleId, req) as ObjectResult;
        Assert.NotNull(result);
        Assert.Equal(422, result.StatusCode);
        var json = JsonSerializer.Serialize(result.Value);
        Assert.Contains("ASSET_NOT_VERIFIED", json);
    }

    [Fact]
    public async Task PostSampleCalibration_RejectsNonCalibrationAsset_With422()
    {
        var (db, controller, _) = CreateSut();
        var sample = new SampleEntity
        {
            SampleId = "sample-test-noncalib",
            CreatedBy = "user-123",
            State = "Draft"
        };
        db.Samples.Add(sample);

        var asset = new MediaAssetEntity
        {
            AssetId = Guid.NewGuid(),
            SampleId = sample.SampleId,
            Kind = "video", // video instead of calibration
            Container = "raw-video",
            BlobName = "sample.mp4",
            ContentTypeDeclared = "video/mp4",
            SizeBytes = 1024,
            Status = "Verified"
        };
        db.MediaAssets.Add(asset);
        await db.SaveChangesAsync();

        var req = new StartCalibrationRequest
        {
            AssetId = asset.AssetId,
            TargetId = "thorlabs-r1l3s2p"
        };

        var result = await controller.PostSampleCalibration(sample.SampleId, req) as ObjectResult;
        Assert.NotNull(result);
        Assert.Equal(422, result.StatusCode);
        var json = JsonSerializer.Serialize(result.Value);
        Assert.Contains("ASSET_NOT_CALIBRATION_IMAGE", json);
    }

    [Fact]
    public async Task PostSampleCalibration_RejectsNonOwner_With403()
    {
        var (db, controller, _) = CreateSut(userId: "foreign-user-456", isStaff: false);
        var sample = new SampleEntity
        {
            SampleId = "sample-test-3",
            CreatedBy = "original-owner-123",
            State = "Draft"
        };
        db.Samples.Add(sample);
        await db.SaveChangesAsync();

        var req = new StartCalibrationRequest
        {
            AssetId = Guid.NewGuid(),
            TargetId = "thorlabs-r1l3s2p"
        };

        var result = await controller.PostSampleCalibration(sample.SampleId, req);
        Assert.IsType<ForbidResult>(result);
    }

    [Fact]
    public async Task GetSampleCalibration_RejectsForeignCaller_With403()
    {
        var (db, controller, _) = CreateSut(userId: "foreign-caller-999", isStaff: false);
        var sample = new SampleEntity
        {
            SampleId = "sample-get-foreign",
            CreatedBy = "legit-owner-111",
            State = "Draft"
        };
        db.Samples.Add(sample);

        var cal = new CalibrationEntity
        {
            CalibrationId = Guid.NewGuid(),
            SampleId = sample.SampleId,
            TargetId = "thorlabs-r1l3s2p",
            ReferencePitchUm = 10.0,
            Status = "Pending"
        };
        db.Calibrations.Add(cal);
        await db.SaveChangesAsync();

        var result = await controller.GetSampleCalibration(sample.SampleId, cal.CalibrationId);
        Assert.IsType<ForbidResult>(result);
    }

    [Fact]
    public async Task GetSampleCalibration_RejectsMismatchSample_With404()
    {
        var (db, controller, _) = CreateSut(userId: "owner-123", isStaff: false);
        var sample1 = new SampleEntity
        {
            SampleId = "sample-one",
            CreatedBy = "owner-123",
            State = "Draft"
        };
        var sample2 = new SampleEntity
        {
            SampleId = "sample-two",
            CreatedBy = "owner-123",
            State = "Draft"
        };
        db.Samples.AddRange(sample1, sample2);

        var calForSample1 = new CalibrationEntity
        {
            CalibrationId = Guid.NewGuid(),
            SampleId = sample1.SampleId,
            TargetId = "thorlabs-r1l3s2p",
            ReferencePitchUm = 10.0,
            Status = "Pending"
        };
        db.Calibrations.Add(calForSample1);
        await db.SaveChangesAsync();

        // Querying sample2 with sample1's calibrationId must return 404
        var result = await controller.GetSampleCalibration(sample2.SampleId, calForSample1.CalibrationId) as ObjectResult;
        Assert.NotNull(result);
        Assert.Equal(404, result.StatusCode);
    }

    [Fact]
    public async Task PostSampleCalibration_RegistersOutboxJobRequest_MatchingContract()
    {
        var (db, controller, _) = CreateSut(userId: "owner-123", isStaff: false);
        var sample = new SampleEntity
        {
            SampleId = "sample-contract-check",
            CreatedBy = "owner-123",
            State = "Draft"
        };
        db.Samples.Add(sample);

        var asset = new MediaAssetEntity
        {
            AssetId = Guid.NewGuid(),
            SampleId = sample.SampleId,
            Kind = "calibration",
            Container = "raw-images",
            BlobName = "calib_target.jpg",
            ContentTypeDeclared = "image/jpeg",
            SizeBytes = 4096,
            Status = "Verified"
        };
        db.MediaAssets.Add(asset);
        await db.SaveChangesAsync();

        var req = new StartCalibrationRequest
        {
            AssetId = asset.AssetId,
            TargetId = "thorlabs-r1l3s2p"
        };

        var postRes = await controller.PostSampleCalibration(sample.SampleId, req) as AcceptedResult;
        Assert.NotNull(postRes);
        Assert.Equal(202, postRes.StatusCode);

        var outboxMsg = await db.OutboxMessages.FirstOrDefaultAsync(m => m.Type == "job-calibration");
        Assert.NotNull(outboxMsg);

        using var doc = JsonDocument.Parse(outboxMsg.PayloadJson);
        var root = doc.RootElement;
        Assert.Equal("calibration", root.GetProperty("service").GetString());
        Assert.Equal("1.0.0", root.GetProperty("schema_version").GetString());
        Assert.Equal("sample-contract-check", root.GetProperty("sample_id").GetString());
        Assert.Equal("raw-images/calib_target.jpg", root.GetProperty("inputs").GetProperty("calibration_image_uri").GetString());
        Assert.Equal(10.0, root.GetProperty("params").GetProperty("reference_pitch_um").GetDouble());
        Assert.True(Guid.TryParse(root.GetProperty("job_id").GetString(), out _));
        Assert.True(Guid.TryParse(root.GetProperty("params").GetProperty("calibration_id").GetString(), out _));
    }

    [Fact]
    public async Task CalibrationResultService_AppliesValidResult_AndCopiesMicronsPerPixelToSample()
    {
        var (db, _, service) = CreateSut();
        string sampleId = "sample-valid-result";
        var sample = new SampleEntity
        {
            SampleId = sampleId,
            CreatedBy = "user-123",
            State = "Draft",
            MicronsPerPixel = null
        };
        db.Samples.Add(sample);

        var cal = new CalibrationEntity
        {
            CalibrationId = Guid.NewGuid(),
            SampleId = sampleId,
            TargetId = "thorlabs-r1l3s2p",
            ReferencePitchUm = 10.0,
            Status = "Pending"
        };
        db.Calibrations.Add(cal);
        sample.CalibrationId = cal.CalibrationId;
        await db.SaveChangesAsync();

        var resultDto = new CalibrationResultDto
        {
            Status = "Valid",
            MeasuredPitchPx = 25.0,
            MicronsPerPixel = 0.4000,
            LinesDetected = 12,
            SpacingCvPct = 0.48,
            ImageWidthPx = 800,
            ImageHeightPx = 600,
            ToolVersion = "1.0.0-phase1+sha123"
        };

        var applyResult = await service.ApplyAsync(cal.CalibrationId, resultDto);
        Assert.True(applyResult.Success);
        Assert.Equal("Valid", applyResult.Status);

        var freshCal = await db.Calibrations.FirstAsync(c => c.CalibrationId == cal.CalibrationId);
        Assert.Equal("Valid", freshCal.Status);
        Assert.Equal(0.4000, freshCal.MicronsPerPixel);
        Assert.Equal(25.0, freshCal.MeasuredPitchPx);
        Assert.Equal(12, freshCal.LinesDetected);
        Assert.Equal(0.48, freshCal.SpacingCvPct);
        Assert.Equal("1.0.0-phase1+sha123", freshCal.ToolVersion);
        Assert.NotNull(freshCal.ExpiresAtUtc);
        Assert.True(freshCal.ExpiresAtUtc > DateTime.UtcNow);

        // Assert sample's MicronsPerPixel was updated
        var freshSample = await db.Samples.FirstAsync(s => s.SampleId == sampleId);
        Assert.Equal(0.4000, freshSample.MicronsPerPixel);

        // Idempotent re-apply
        var replayResult = await service.ApplyAsync(cal.CalibrationId, resultDto);
        Assert.True(replayResult.Success);
        Assert.Equal("Valid", replayResult.Status);
    }

    [Fact]
    public async Task CalibrationResultService_RejectsScaleFactorMismatch()
    {
        var (db, _, service) = CreateSut();
        string sampleId = "sample-mismatch";
        var sample = new SampleEntity { SampleId = sampleId, CreatedBy = "user-123", State = "Draft" };
        db.Samples.Add(sample);

        var cal = new CalibrationEntity
        {
            CalibrationId = Guid.NewGuid(),
            SampleId = sampleId,
            TargetId = "thorlabs-r1l3s2p",
            ReferencePitchUm = 10.0,
            Status = "Pending"
        };
        db.Calibrations.Add(cal);
        await db.SaveChangesAsync();

        // 10.0 / 25.0 = 0.4000, but supply 0.8000
        var resultDto = new CalibrationResultDto
        {
            Status = "Valid",
            MeasuredPitchPx = 25.0,
            MicronsPerPixel = 0.8000,
            LinesDetected = 12
        };

        var applyResult = await service.ApplyAsync(cal.CalibrationId, resultDto);
        Assert.False(applyResult.Success);
        Assert.Contains("Scale factor mismatch", applyResult.ErrorMessage);

        var freshCal = await db.Calibrations.FirstAsync(c => c.CalibrationId == cal.CalibrationId);
        Assert.Equal("Pending", freshCal.Status);
    }

    [Fact]
    public async Task CalibrationResultService_AppliesRejectedResult_WithoutExpiry()
    {
        var (db, _, service) = CreateSut();
        string sampleId = "sample-rejected-result";
        var sample = new SampleEntity { SampleId = sampleId, CreatedBy = "user-123", State = "Draft" };
        db.Samples.Add(sample);

        var cal = new CalibrationEntity
        {
            CalibrationId = Guid.NewGuid(),
            SampleId = sampleId,
            TargetId = "thorlabs-r1l3s2p",
            ReferencePitchUm = 10.0,
            Status = "Pending"
        };
        db.Calibrations.Add(cal);
        await db.SaveChangesAsync();

        var resultDto = new CalibrationResultDto
        {
            Status = "Rejected",
            RejectReason = "UNEVEN_SPACING",
            ToolVersion = "1.0.0-phase1+sha123"
        };

        var applyResult = await service.ApplyAsync(cal.CalibrationId, resultDto);
        Assert.True(applyResult.Success);
        Assert.Equal("Rejected", applyResult.Status);

        var freshCal = await db.Calibrations.FirstAsync(c => c.CalibrationId == cal.CalibrationId);
        Assert.Equal("Rejected", freshCal.Status);
        Assert.Equal("UNEVEN_SPACING", freshCal.RejectReason);
        Assert.Null(freshCal.ExpiresAtUtc);
    }
}
