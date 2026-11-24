using System.Reflection;
using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Routing;
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
    public void ApiAssembly_HasNoEndpoint_AcceptingCalibrationResultDto_OrRoutingCalibrationResult()
    {
        // G5: Scan every ControllerBase type in Penancia.S.Api assembly.
        // Assert: no action method accepts CalibrationResultDto AND no route template contains both 'calibration' and 'result'.
        var apiAssembly = typeof(CalibrationController).Assembly;
        var controllerTypes = apiAssembly.GetTypes()
            .Where(t => typeof(ControllerBase).IsAssignableFrom(t) && !t.IsAbstract);

        foreach (var controller in controllerTypes)
        {
            var controllerRoute = controller.GetCustomAttribute<RouteAttribute>()?.Template ?? "";

            var methods = controller.GetMethods(BindingFlags.Instance | BindingFlags.Public | BindingFlags.DeclaredOnly);
            foreach (var method in methods)
            {
                var parameters = method.GetParameters();
                Assert.DoesNotContain(parameters, p => p.ParameterType == typeof(CalibrationResultDto));

                var httpAttrs = method.GetCustomAttributes().OfType<HttpMethodAttribute>();
                foreach (var attr in httpAttrs)
                {
                    var actionRoute = attr.Template ?? "";
                    var fullRoute = $"{controllerRoute}/{actionRoute}".ToLowerInvariant();
                    bool hasCalibration = fullRoute.Contains("calibration");
                    bool hasResult = fullRoute.Contains("result");
                    Assert.False(hasCalibration && hasResult,
                        $"Controller {controller.Name} method {method.Name} has forbidden route '{fullRoute}' containing both 'calibration' and 'result'.");
                }

                var directRoutes = method.GetCustomAttributes<RouteAttribute>();
                foreach (var attr in directRoutes)
                {
                    var actionRoute = attr.Template ?? "";
                    var fullRoute = $"{controllerRoute}/{actionRoute}".ToLowerInvariant();
                    bool hasCalibration = fullRoute.Contains("calibration");
                    bool hasResult = fullRoute.Contains("result");
                    Assert.False(hasCalibration && hasResult,
                        $"Controller {controller.Name} method {method.Name} has forbidden route '{fullRoute}' containing both 'calibration' and 'result'.");
                }
            }
        }
    }

    [Fact]
    public async Task CalibrationResultService_RejectsScaleFactorMismatch_BeyondTolerance()
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
            LinesDetected = 12,
            SpacingCvPct = 1.0,
            ImageWidthPx = 800,
            ImageHeightPx = 600,
            ToolVersion = "1.0.0-phase1+sha123"
        };

        var applyResult = await service.ApplyAsync(cal.CalibrationId, resultDto);
        Assert.True(applyResult.Success);
        Assert.Equal("Rejected", applyResult.Status);

        var freshCal = await db.Calibrations.FirstAsync(c => c.CalibrationId == cal.CalibrationId);
        Assert.Equal("Rejected", freshCal.Status);
        Assert.Equal("SCALE_FACTOR_MISMATCH", freshCal.RejectReason);
    }

    [Fact]
    public async Task CalibrationResultService_RelativeTolerance_Accepts0Point01Percent_Rejects1Percent()
    {
        // Q2: 0.1% relative tolerance. Ref 10 µm, pitch 25 px -> expected 0.4000 µm/px.
        // 0.404 (1% off) must be stored as Rejected (SCALE_FACTOR_MISMATCH).
        // 0.40004 (0.01% off) must be stored as Valid.
        var (db, _, service) = CreateSut();

        // 1. Test 1% off -> Rejected
        var cal1 = new CalibrationEntity
        {
            CalibrationId = Guid.NewGuid(),
            SampleId = "sample-q2-1",
            TargetId = "thorlabs-r1l3s2p",
            ReferencePitchUm = 10.0,
            Status = "Pending"
        };
        db.Calibrations.Add(cal1);
        await db.SaveChangesAsync();

        var resReject = await service.ApplyAsync(cal1.CalibrationId, new CalibrationResultDto
        {
            Status = "Valid",
            MeasuredPitchPx = 25.0,
            MicronsPerPixel = 0.404, // 1% off
            LinesDetected = 10,
            SpacingCvPct = 2.0,
            ImageWidthPx = 800,
            ImageHeightPx = 600,
            ToolVersion = "1.0.0-phase1+test"
        });
        Assert.True(resReject.Success);
        Assert.Equal("Rejected", resReject.Status);
        var refreshedCal1 = await db.Calibrations.FirstAsync(c => c.CalibrationId == cal1.CalibrationId);
        Assert.Equal("Rejected", refreshedCal1.Status);
        Assert.Equal("SCALE_FACTOR_MISMATCH", refreshedCal1.RejectReason);

        // 2. Test 0.01% off -> Valid
        var cal2 = new CalibrationEntity
        {
            CalibrationId = Guid.NewGuid(),
            SampleId = "sample-q2-2",
            TargetId = "thorlabs-r1l3s2p",
            ReferencePitchUm = 10.0,
            Status = "Pending"
        };
        db.Calibrations.Add(cal2);
        await db.SaveChangesAsync();

        var resValid = await service.ApplyAsync(cal2.CalibrationId, new CalibrationResultDto
        {
            Status = "Valid",
            MeasuredPitchPx = 25.0,
            MicronsPerPixel = 0.40004, // 0.01% off (within 0.1% relative tolerance)
            LinesDetected = 10,
            SpacingCvPct = 2.0,
            ImageWidthPx = 800,
            ImageHeightPx = 600,
            ToolVersion = "1.0.0-phase1+test"
        });
        Assert.True(resValid.Success);
        Assert.Equal("Valid", resValid.Status);
        var refreshedCal2 = await db.Calibrations.FirstAsync(c => c.CalibrationId == cal2.CalibrationId);
        Assert.Equal("Valid", refreshedCal2.Status);
        Assert.Null(refreshedCal2.RejectReason);
    }

    [Fact]
    public async Task CalibrationResultService_ServerRechecks_RejectsSubstandardResults()
    {
        // F2(b): Server re-checks: LinesDetected >= 6, SpacingCvPct <= 5.0, MeasuredPitchPx > 0, MicronsPerPixel > 0, ToolVersion not empty
        var (db, _, service) = CreateSut();

        // 1. Lines detected < 6
        var calLines = new CalibrationEntity { CalibrationId = Guid.NewGuid(), SampleId = "s1", TargetId = "t1", ReferencePitchUm = 10.0, Status = "Pending" };
        db.Calibrations.Add(calLines);
        await db.SaveChangesAsync();
        var resLines = await service.ApplyAsync(calLines.CalibrationId, new CalibrationResultDto
        {
            Status = "Valid",
            MeasuredPitchPx = 25.0,
            MicronsPerPixel = 0.4000,
            LinesDetected = 5, // < 6
            SpacingCvPct = 2.0,
            ImageWidthPx = 800,
            ImageHeightPx = 600,
            ToolVersion = "1.0.0-phase1+test"
        });
        Assert.Equal("Rejected", resLines.Status);
        var calLinesDb = await db.Calibrations.FirstAsync(c => c.CalibrationId == calLines.CalibrationId);
        Assert.Equal("INSUFFICIENT_LINES_DETECTED", calLinesDb.RejectReason);

        // 2. Spacing CV > 5.0
        var calCv = new CalibrationEntity { CalibrationId = Guid.NewGuid(), SampleId = "s2", TargetId = "t1", ReferencePitchUm = 10.0, Status = "Pending" };
        db.Calibrations.Add(calCv);
        await db.SaveChangesAsync();
        var resCv = await service.ApplyAsync(calCv.CalibrationId, new CalibrationResultDto
        {
            Status = "Valid",
            MeasuredPitchPx = 25.0,
            MicronsPerPixel = 0.4000,
            LinesDetected = 10,
            SpacingCvPct = 5.5, // > 5.0
            ImageWidthPx = 800,
            ImageHeightPx = 600,
            ToolVersion = "1.0.0-phase1+test"
        });
        Assert.Equal("Rejected", resCv.Status);
        var calCvDb = await db.Calibrations.FirstAsync(c => c.CalibrationId == calCv.CalibrationId);
        Assert.Equal("SPACING_VARIATION_EXCEEDED", calCvDb.RejectReason);

        // 3. Missing ToolVersion
        var calVer = new CalibrationEntity { CalibrationId = Guid.NewGuid(), SampleId = "s3", TargetId = "t1", ReferencePitchUm = 10.0, Status = "Pending" };
        db.Calibrations.Add(calVer);
        await db.SaveChangesAsync();
        var resVer = await service.ApplyAsync(calVer.CalibrationId, new CalibrationResultDto
        {
            Status = "Valid",
            MeasuredPitchPx = 25.0,
            MicronsPerPixel = 0.4000,
            LinesDetected = 10,
            SpacingCvPct = 2.0,
            ImageWidthPx = 800,
            ImageHeightPx = 600,
            ToolVersion = "" // empty
        });
        Assert.Equal("Rejected", resVer.Status);
        var calVerDb = await db.Calibrations.FirstAsync(c => c.CalibrationId == calVer.CalibrationId);
        Assert.Equal("MISSING_TOOL_VERSION", calVerDb.RejectReason);
    }

    [Fact]
    public async Task CalibrationResultService_DefaultValidityDays_IsSevenDays_WhenConfigMissing()
    {
        // Q4: with no config, ExpiresAtUtc defaults to DateTime.UtcNow.AddDays(7) (within ±1 min).
        var options = new DbContextOptionsBuilder<PenanciaDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;
        var db = new PenanciaDbContext(options);
        var emptyConfig = new ConfigurationBuilder().Build(); // No Calibration:ValidityDays
        var service = new CalibrationResultService(db, emptyConfig, NullLogger<CalibrationResultService>.Instance);

        var cal = new CalibrationEntity
        {
            CalibrationId = Guid.NewGuid(),
            SampleId = "sample-q4",
            TargetId = "thorlabs-r1l3s2p",
            ReferencePitchUm = 10.0,
            Status = "Pending"
        };
        db.Calibrations.Add(cal);
        await db.SaveChangesAsync();

        var before = DateTime.UtcNow.AddDays(7);
        var result = await service.ApplyAsync(cal.CalibrationId, new CalibrationResultDto
        {
            Status = "Valid",
            MeasuredPitchPx = 25.0,
            MicronsPerPixel = 0.4000,
            LinesDetected = 10,
            SpacingCvPct = 1.0,
            ImageWidthPx = 800,
            ImageHeightPx = 600,
            ToolVersion = "1.0.0-phase1+test"
        });
        var after = DateTime.UtcNow.AddDays(7);

        Assert.True(result.Success);
        var refreshed = await db.Calibrations.FirstAsync(c => c.CalibrationId == cal.CalibrationId);
        Assert.NotNull(refreshed.ExpiresAtUtc);
        Assert.True(refreshed.ExpiresAtUtc >= before.AddMinutes(-1) && refreshed.ExpiresAtUtc <= after.AddMinutes(1));
    }

    [Fact]
    public async Task CalibrationResultService_DoesNotUpdateSample_WhenSampleLinksDifferentCalibration()
    {
        // Q6: if sample links a different calibration, sample's MicronsPerPixel is unchanged.
        var (db, _, service) = CreateSut();
        string sampleId = "sample-q6";
        var otherCalibrationId = Guid.NewGuid();
        var sample = new SampleEntity
        {
            SampleId = sampleId,
            CreatedBy = "user-123",
            State = "Draft",
            CalibrationId = otherCalibrationId, // Links to a different calibration
            MicronsPerPixel = 0.5555
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
        await db.SaveChangesAsync();

        var result = await service.ApplyAsync(cal.CalibrationId, new CalibrationResultDto
        {
            Status = "Valid",
            MeasuredPitchPx = 25.0,
            MicronsPerPixel = 0.4000,
            LinesDetected = 10,
            SpacingCvPct = 1.0,
            ImageWidthPx = 800,
            ImageHeightPx = 600,
            ToolVersion = "1.0.0-phase1+test"
        });
        Assert.True(result.Success);

        var refreshedSample = await db.Samples.FirstAsync(s => s.SampleId == sampleId);
        Assert.Equal(0.5555, refreshedSample.MicronsPerPixel); // Unchanged!
    }

    [Fact]
    public async Task CalibrationResultService_TerminalState_RefusesDifferentResult_AndIdenticalReplayIsIdempotent()
    {
        // Q8: calibration already Rejected or Valid refuses a different result; identical replay stays idempotent.
        var (db, _, service) = CreateSut();

        // 1. Valid calibration
        var validCal = new CalibrationEntity
        {
            CalibrationId = Guid.NewGuid(),
            SampleId = "sample-q8-1",
            TargetId = "thorlabs-r1l3s2p",
            ReferencePitchUm = 10.0,
            Status = "Pending"
        };
        db.Calibrations.Add(validCal);
        await db.SaveChangesAsync();

        var validDto = new CalibrationResultDto
        {
            Status = "Valid",
            MeasuredPitchPx = 25.0,
            MicronsPerPixel = 0.4000,
            LinesDetected = 10,
            SpacingCvPct = 1.0,
            ImageWidthPx = 800,
            ImageHeightPx = 600,
            ToolVersion = "1.0.0-phase1+test"
        };
        await service.ApplyAsync(validCal.CalibrationId, validDto);

        // Idempotent replay with same status -> Success
        var replayValid = await service.ApplyAsync(validCal.CalibrationId, validDto);
        Assert.True(replayValid.Success);
        Assert.Equal("Valid", replayValid.Status);

        // Different status (Rejected) -> Fails
        var conflictReject = await service.ApplyAsync(validCal.CalibrationId, new CalibrationResultDto
        {
            Status = "Rejected",
            RejectReason = "SOME_REASON"
        });
        Assert.False(conflictReject.Success);
        Assert.Contains("already terminal", conflictReject.ErrorMessage);

        // 2. Rejected calibration
        var rejectedCal = new CalibrationEntity
        {
            CalibrationId = Guid.NewGuid(),
            SampleId = "sample-q8-2",
            TargetId = "thorlabs-r1l3s2p",
            ReferencePitchUm = 10.0,
            Status = "Pending"
        };
        db.Calibrations.Add(rejectedCal);
        await db.SaveChangesAsync();

        var rejectDto = new CalibrationResultDto
        {
            Status = "Rejected",
            RejectReason = "UNEVEN_SPACING"
        };
        await service.ApplyAsync(rejectedCal.CalibrationId, rejectDto);

        // Idempotent replay with same status -> Success
        var replayReject = await service.ApplyAsync(rejectedCal.CalibrationId, rejectDto);
        Assert.True(replayReject.Success);
        Assert.Equal("Rejected", replayReject.Status);

        // Different status (Valid) -> Fails
        var conflictValid = await service.ApplyAsync(rejectedCal.CalibrationId, validDto);
        Assert.False(conflictValid.Success);
        Assert.Contains("already terminal", conflictValid.ErrorMessage);
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

    [Theory]
    [InlineData(double.NaN, 0.4000, 1.0, 10, 800, 600)]            // NaN pitch
    [InlineData(25.0, double.NaN, 1.0, 10, 800, 600)]            // NaN um/px
    [InlineData(25.0, 0.4000, double.NaN, 10, 800, 600)]         // NaN CV
    [InlineData(25.0, 0.4000, -3.0, 10, 800, 600)]               // negative CV
    [InlineData(double.PositiveInfinity, 0.4000, 1.0, 10, 800, 600)] // +Infinity pitch
    [InlineData(25.0, double.PositiveInfinity, 1.0, 10, 800, 600)] // +Infinity um/px
    [InlineData(0.0, 0.4000, 1.0, 10, 800, 600)]                 // zero pitch
    [InlineData(25.0, 0.0, 1.0, 10, 800, 600)]                   // zero um/px
    [InlineData(25.0, 0.4000, 1.0, null, 800, 600)]              // null LinesDetected
    [InlineData(25.0, 0.4000, null, 10, 800, 600)]               // null SpacingCvPct
    [InlineData(25.0, 0.4000, 1.0, 10, 0, 600)]                  // zero ImageWidthPx
    [InlineData(25.0, 0.4000, 1.0, 10, 800, -10)]                // negative ImageHeightPx
    public async Task CalibrationResultService_Rejects_InventedAndBadNumbers_AsInvalidMeasurement(
        double? pitchPx, double? umPerPx, double? cvPct, int? lines, int? width, int? height)
    {
        // G2: Before Valid, require finite positive pitch & um/px, finite non-negative CV, positive image dims, and LinesDetected.
        // On failure, store Rejected with reason INVALID_MEASUREMENT, ExpiresAtUtc null.
        var (db, _, service) = CreateSut();
        var cal = new CalibrationEntity
        {
            CalibrationId = Guid.NewGuid(),
            SampleId = $"sample-{Guid.NewGuid():N}",
            TargetId = "thorlabs-r1l3s2p",
            ReferencePitchUm = 10.0,
            Status = "Pending"
        };
        db.Calibrations.Add(cal);
        await db.SaveChangesAsync();

        var dto = new CalibrationResultDto
        {
            Status = "Valid",
            MeasuredPitchPx = pitchPx,
            MicronsPerPixel = umPerPx,
            SpacingCvPct = cvPct,
            LinesDetected = lines,
            ImageWidthPx = width,
            ImageHeightPx = height,
            ToolVersion = "1.0.0-phase1+test"
        };

        var result = await service.ApplyAsync(cal.CalibrationId, dto);
        Assert.True(result.Success);
        Assert.Equal("Rejected", result.Status);

        var refreshed = await db.Calibrations.FirstAsync(c => c.CalibrationId == cal.CalibrationId);
        Assert.Equal("Rejected", refreshed.Status);
        Assert.Equal("INVALID_MEASUREMENT", refreshed.RejectReason);
        Assert.Null(refreshed.ExpiresAtUtc);
    }

    [Fact]
    public async Task CalibrationResultService_Redelivery_WorkerValidTurnedRejected_RedeliveredIdentically_ReturnsOkStoredStatus()
    {
        // G3(a): A worker "Valid" that server turned into Rejected, redelivered identically, must return Ok with stored status.
        var (db, _, service) = CreateSut();
        var cal = new CalibrationEntity
        {
            CalibrationId = Guid.NewGuid(),
            SampleId = "sample-redelivery-rejected",
            TargetId = "thorlabs-r1l3s2p",
            ReferencePitchUm = 10.0,
            Status = "Pending"
        };
        db.Calibrations.Add(cal);
        await db.SaveChangesAsync();

        // 1. Initial attempt: worker sends Valid, but CV is 5.5% (exceeds limit 5.0%), so server turns it into Rejected
        var workerDto = new CalibrationResultDto
        {
            Status = "Valid",
            MeasuredPitchPx = 25.0,
            MicronsPerPixel = 0.4000,
            LinesDetected = 10,
            SpacingCvPct = 5.5,
            ImageWidthPx = 800,
            ImageHeightPx = 600,
            ToolVersion = "1.0.0-phase1+test"
        };

        var firstResult = await service.ApplyAsync(cal.CalibrationId, workerDto);
        Assert.True(firstResult.Success);
        Assert.Equal("Rejected", firstResult.Status);

        var stored = await db.Calibrations.FirstAsync(c => c.CalibrationId == cal.CalibrationId);
        Assert.Equal("Rejected", stored.Status);
        Assert.Equal("SPACING_VARIATION_EXCEEDED", stored.RejectReason);

        // 2. Redelivery: identical worker message arriving from Service Bus
        var redeliveryResult = await service.ApplyAsync(cal.CalibrationId, workerDto);
        Assert.True(redeliveryResult.Success);
        Assert.Equal("Rejected", redeliveryResult.Status);
    }

    [Fact]
    public async Task CalibrationResultService_Redelivery_ValidReceivingDifferentResult_ReturnsFail_AndLeavesStoredValuesUnchanged()
    {
        // G3(b): A Valid calibration receiving a DIFFERENT result (e.g. pitch 50, µm/px 0.2) must return Fail and leave stored values unchanged.
        var (db, _, service) = CreateSut();
        var cal = new CalibrationEntity
        {
            CalibrationId = Guid.NewGuid(),
            SampleId = "sample-redelivery-conflict",
            TargetId = "thorlabs-r1l3s2p",
            ReferencePitchUm = 10.0,
            Status = "Pending"
        };
        db.Calibrations.Add(cal);
        await db.SaveChangesAsync();

        var initialValidDto = new CalibrationResultDto
        {
            Status = "Valid",
            MeasuredPitchPx = 25.0,
            MicronsPerPixel = 0.4000,
            LinesDetected = 10,
            SpacingCvPct = 1.0,
            ImageWidthPx = 800,
            ImageHeightPx = 600,
            ToolVersion = "1.0.0-phase1+test"
        };

        var firstResult = await service.ApplyAsync(cal.CalibrationId, initialValidDto);
        Assert.True(firstResult.Success);
        Assert.Equal("Valid", firstResult.Status);

        // Conflicting second result with different pitch and scale factor
        var conflictingDto = new CalibrationResultDto
        {
            Status = "Valid",
            MeasuredPitchPx = 50.0,
            MicronsPerPixel = 0.2000,
            LinesDetected = 20,
            SpacingCvPct = 1.0,
            ImageWidthPx = 800,
            ImageHeightPx = 600,
            ToolVersion = "1.0.0-phase1+test"
        };

        var secondResult = await service.ApplyAsync(cal.CalibrationId, conflictingDto);
        Assert.False(secondResult.Success);
        Assert.Contains("refuses conflicting result", secondResult.ErrorMessage);

        var refreshed = await db.Calibrations.FirstAsync(c => c.CalibrationId == cal.CalibrationId);
        Assert.Equal("Valid", refreshed.Status);
        Assert.Equal(25.0, refreshed.MeasuredPitchPx);
        Assert.Equal(0.4000, refreshed.MicronsPerPixel);
        Assert.Equal(10, refreshed.LinesDetected);
    }

    [Fact]
    public async Task CalibrationResultService_ToleranceBoundary_0Point05PercentAccepted_0Point2PercentRejected()
    {
        // G4: 0.05% off -> Valid, 0.2% off -> Rejected (RelativeScaleTolerance = 0.001 = 0.1%).
        // Loosening RelativeScaleTolerance to 0.005 or 0.01 must fail a test.
        var (db, _, service) = CreateSut();

        // 1. 0.05% off: expected 0.4000, claimed 0.4002 -> relative error 0.0005 <= 0.001 -> Valid
        var cal1 = new CalibrationEntity
        {
            CalibrationId = Guid.NewGuid(),
            SampleId = "sample-tol-1",
            TargetId = "thorlabs-r1l3s2p",
            ReferencePitchUm = 10.0,
            Status = "Pending"
        };
        db.Calibrations.Add(cal1);
        await db.SaveChangesAsync();

        var resValid = await service.ApplyAsync(cal1.CalibrationId, new CalibrationResultDto
        {
            Status = "Valid",
            MeasuredPitchPx = 25.0,
            MicronsPerPixel = 0.4002, // 0.05% off
            LinesDetected = 10,
            SpacingCvPct = 1.0,
            ImageWidthPx = 800,
            ImageHeightPx = 600,
            ToolVersion = "1.0.0-phase1+test"
        });
        Assert.True(resValid.Success);
        Assert.Equal("Valid", resValid.Status);
        var ref1 = await db.Calibrations.FirstAsync(c => c.CalibrationId == cal1.CalibrationId);
        Assert.Equal("Valid", ref1.Status);
        Assert.Null(ref1.RejectReason);
        Assert.NotNull(ref1.ExpiresAtUtc);

        // 2. 0.2% off: expected 0.4000, claimed 0.4008 -> relative error 0.002 > 0.001 -> Rejected
        var cal2 = new CalibrationEntity
        {
            CalibrationId = Guid.NewGuid(),
            SampleId = "sample-tol-2",
            TargetId = "thorlabs-r1l3s2p",
            ReferencePitchUm = 10.0,
            Status = "Pending"
        };
        db.Calibrations.Add(cal2);
        await db.SaveChangesAsync();

        var resReject = await service.ApplyAsync(cal2.CalibrationId, new CalibrationResultDto
        {
            Status = "Valid",
            MeasuredPitchPx = 25.0,
            MicronsPerPixel = 0.4008, // 0.2% off (fails 0.1% tolerance; kills 0.005/0.01 loosening mutation)
            LinesDetected = 10,
            SpacingCvPct = 1.0,
            ImageWidthPx = 800,
            ImageHeightPx = 600,
            ToolVersion = "1.0.0-phase1+test"
        });
        Assert.True(resReject.Success);
        Assert.Equal("Rejected", resReject.Status);
        var ref2 = await db.Calibrations.FirstAsync(c => c.CalibrationId == cal2.CalibrationId);
        Assert.Equal("Rejected", ref2.Status);
        Assert.Equal("SCALE_FACTOR_MISMATCH", ref2.RejectReason);
        Assert.Null(ref2.ExpiresAtUtc);
    }

    [Theory]
    [InlineData("Processing")]
    [InlineData("Draft")]
    [InlineData("Queued")]
    [InlineData("Failed")]
    public async Task CalibrationResultService_RefusesNonPendingNonTerminalStatus(string nonPendingStatus)
    {
        // G4 / Q8: a calibration in any non-Pending, non-terminal status is refused.
        var (db, _, service) = CreateSut();
        var cal = new CalibrationEntity
        {
            CalibrationId = Guid.NewGuid(),
            SampleId = "sample-non-pending",
            TargetId = "thorlabs-r1l3s2p",
            ReferencePitchUm = 10.0,
            Status = nonPendingStatus
        };
        db.Calibrations.Add(cal);
        await db.SaveChangesAsync();

        var result = await service.ApplyAsync(cal.CalibrationId, new CalibrationResultDto
        {
            Status = "Valid",
            MeasuredPitchPx = 25.0,
            MicronsPerPixel = 0.4000,
            LinesDetected = 10,
            SpacingCvPct = 1.0,
            ImageWidthPx = 800,
            ImageHeightPx = 600,
            ToolVersion = "1.0.0-phase1+test"
        });

        Assert.False(result.Success);
        Assert.Contains("must be 'Pending'", result.ErrorMessage);
    }

    [Fact]
    public async Task CalibrationResultService_ServerRejectedCalibration_AlwaysHasNullExpiresAtUtc()
    {
        // G4 / N10: a server-rejected calibration has ExpiresAtUtc == null.
        var (db, _, service) = CreateSut();
        var cal = new CalibrationEntity
        {
            CalibrationId = Guid.NewGuid(),
            SampleId = "sample-n10",
            TargetId = "thorlabs-r1l3s2p",
            ReferencePitchUm = 10.0,
            Status = "Pending",
            ExpiresAtUtc = DateTime.UtcNow.AddDays(7)
        };
        db.Calibrations.Add(cal);
        await db.SaveChangesAsync();

        var result = await service.ApplyAsync(cal.CalibrationId, new CalibrationResultDto
        {
            Status = "Valid",
            MeasuredPitchPx = 25.0,
            MicronsPerPixel = 0.404, // Mismatch -> Rejected
            LinesDetected = 10,
            SpacingCvPct = 1.0,
            ImageWidthPx = 800,
            ImageHeightPx = 600,
            ToolVersion = "1.0.0-phase1+test"
        });

        Assert.True(result.Success);
        Assert.Equal("Rejected", result.Status);

        var refreshed = await db.Calibrations.FirstAsync(c => c.CalibrationId == cal.CalibrationId);
        Assert.Equal("Rejected", refreshed.Status);
        Assert.Null(refreshed.ExpiresAtUtc);
    }
}
