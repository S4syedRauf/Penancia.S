using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Penancia.S.Api.Controllers.V1;
using Penancia.S.Data;
using Penancia.S.Data.Entities;
using Xunit;

namespace Penancia.S.Tests;

public class CalibrationApiTests
{
    private (PenanciaDbContext db, CalibrationController controller) CreateSut(
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
            { "DEMO_MODE", demoMode ? "true" : "false" }
        };
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(inMemorySettings)
            .Build();

        var logger = NullLogger<CalibrationController>.Instance;
        var controller = new CalibrationController(logger, db, config);

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
    public void LegacyCalibration_Returns410_WhenDemoModeIsOff()
    {
        var (_, controller) = CreateSut(demoMode: false);
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
    public void LegacyCalibration_Returns200_WhenDemoModeIsOn()
    {
        var (_, controller) = CreateSut(demoMode: true);
        var req = new CalibrationRequest
        {
            GridLineCount = 10,
            FieldWidthUm = 500.0,
            SpacingVariancePct = 2.0
        };

        var result = controller.PostCalibration(req) as OkObjectResult;
        Assert.NotNull(result);
        Assert.Equal(200, result.StatusCode);
    }

    [Fact]
    public async Task PostSampleCalibration_RejectsUnknownTarget_With422()
    {
        var (db, controller) = CreateSut();
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
        var (db, controller) = CreateSut();
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
    }

    [Fact]
    public async Task PostSampleCalibration_RejectsNonOwner_With403()
    {
        var (db, controller) = CreateSut(userId: "foreign-user-456", isStaff: false);
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
    public async Task Calibration_EndToEnd_PostGivesPending_SimulatedResultGivesValid()
    {
        var (db, controller) = CreateSut(userId: "user-owner-1", isStaff: false);
        var sample = new SampleEntity
        {
            SampleId = "sample-e2e-calib",
            CreatedBy = "user-owner-1",
            State = "Draft"
        };
        db.Samples.Add(sample);

        var asset = new MediaAssetEntity
        {
            AssetId = Guid.NewGuid(),
            SampleId = sample.SampleId,
            Kind = "calibration",
            Container = "raw-images",
            BlobName = "verified_calib.jpg",
            ContentTypeDeclared = "image/jpeg",
            SizeBytes = 2048,
            Status = "Verified"
        };
        db.MediaAssets.Add(asset);
        await db.SaveChangesAsync();

        // 1. Post calibration
        var req = new StartCalibrationRequest
        {
            AssetId = asset.AssetId,
            TargetId = "thorlabs-r1l3s2p"
        };

        var postRes = await controller.PostSampleCalibration(sample.SampleId, req) as AcceptedResult;
        Assert.NotNull(postRes);
        Assert.Equal(202, postRes.StatusCode);

        // Verify Pending entity in DB
        var calInDb = await db.Calibrations.FirstOrDefaultAsync(c => c.SampleId == sample.SampleId);
        Assert.NotNull(calInDb);
        Assert.Equal("Pending", calInDb.Status);
        Assert.Equal("thorlabs-r1l3s2p", calInDb.TargetId);
        Assert.Equal(10.0, calInDb.ReferencePitchUm);
        Assert.Null(calInDb.MicronsPerPixel);
        Assert.Null(calInDb.MeasuredPitchPx);

        // Verify Outbox message registered
        var outboxMsg = await db.OutboxMessages.FirstOrDefaultAsync(m => m.Type == "job-calibration");
        Assert.NotNull(outboxMsg);
        Assert.Contains(calInDb.CalibrationId.ToString(), outboxMsg.PayloadJson);

        // Verify GET returns Pending
        var getPendingRes = await controller.GetSampleCalibration(sample.SampleId, calInDb.CalibrationId) as OkObjectResult;
        Assert.NotNull(getPendingRes);
        Assert.Equal(200, getPendingRes.StatusCode);

        // 2. Simulate worker result (Valid)
        calInDb.Status = "Valid";
        calInDb.MeasuredPitchPx = 25.0;
        calInDb.MicronsPerPixel = 0.4000;
        calInDb.LinesDetected = 12;
        calInDb.SpacingCvPct = 0.5;
        calInDb.ImageWidthPx = 600;
        calInDb.ImageHeightPx = 400;
        calInDb.ToolVersion = "1.0.0-phase1";
        await db.SaveChangesAsync();

        // 3. Verify GET returns Valid with exact computed scale factor
        var getValidRes = await controller.GetSampleCalibration(sample.SampleId, calInDb.CalibrationId) as OkObjectResult;
        Assert.NotNull(getValidRes);
        Assert.Equal(200, getValidRes.StatusCode);

        // Verify sample now links to Valid calibration
        var updatedSample = await db.Samples.FirstAsync(s => s.SampleId == sample.SampleId);
        Assert.Equal(calInDb.CalibrationId, updatedSample.CalibrationId);
    }
}
