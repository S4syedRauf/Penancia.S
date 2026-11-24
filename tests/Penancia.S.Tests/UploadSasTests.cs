using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Security.Claims;
using System.Threading.Tasks;
using Azure;
using Azure.Storage;
using Azure.Storage.Blobs;
using Azure.Storage.Sas;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Penancia.S.Api.Controllers.V1;
using Penancia.S.Data;
using Penancia.S.Data.Entities;
using Xunit;

namespace Penancia.S.Tests;

public class UploadSasTests
{
    private class TestableSamplesController : SamplesController
    {
        private readonly Func<string, string, DateTimeOffset, DateTimeOffset, Task<string>>? _sasGenerator;

        public TestableSamplesController(
            PenanciaDbContext db,
            BlobServiceClient? blobs,
            IHttpClientFactory httpClients,
            IConfiguration configuration,
            ILogger<SamplesController> logger,
            Func<string, string, DateTimeOffset, DateTimeOffset, Task<string>>? sasGenerator = null)
            : base(db, blobs!, httpClients, configuration, logger)
        {
            _sasGenerator = sasGenerator;
        }

        protected override Task<string> BuildUserDelegationSasUriAsync(
            string container,
            string blobName,
            DateTimeOffset startsOn,
            DateTimeOffset expiresOn)
        {
            if (_sasGenerator != null)
            {
                return _sasGenerator(container, blobName, startsOn, expiresOn);
            }

            var sas = CreateBlobSasBuilder(container, blobName, startsOn, expiresOn);

            var testKey = new StorageSharedKeyCredential("stpenancias", Convert.ToBase64String(new byte[64]));
            var queryParams = sas.ToSasQueryParameters(testKey);
            var parsed = QueryHelpers.ParseQuery("?" + queryParams.ToString());
            var updatedQuery = new Dictionary<string, string?>();
            foreach (var kvp in parsed)
            {
                updatedQuery[kvp.Key] = kvp.Value.ToString();
            }
            // In User Delegation SAS, 'sr' directly reflects sas.Resource ("b", "c", etc.)
            updatedQuery["sr"] = sas.Resource;

            var queryString = QueryString.Create(updatedQuery).ToString();
            var uri = new Uri($"https://stpenancias.blob.core.windows.net/{container}/{blobName}{queryString}");
            return Task.FromResult(uri.ToString());
        }
    }

    private static (TestableSamplesController Controller, PenanciaDbContext Db, DefaultHttpContext HttpContext) CreateController(
        string userId = "test-patient",
        bool isStaff = false,
        Dictionary<string, string?>? customConfig = null,
        Func<string, string, DateTimeOffset, DateTimeOffset, Task<string>>? sasGenerator = null)
    {
        var options = new DbContextOptionsBuilder<PenanciaDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        var db = new PenanciaDbContext(options);

        var inMemorySettings = new Dictionary<string, string?>
        {
            ["MediaUpload:MaxBytes:Video"] = "524288000",
            ["MediaUpload:MaxBytes:Image"] = "26214400",
            ["MediaUpload:MaxBytes:Calibration"] = "26214400",
            ["MediaUpload:BlockSizeBytes"] = "4194304"
        };
        if (customConfig != null)
        {
            foreach (var (k, v) in customConfig)
                inMemorySettings[k] = v;
        }

        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(inMemorySettings)
            .Build();

        var logger = NullLogger<SamplesController>.Instance;
        var controller = new TestableSamplesController(db, null!, null!, config, logger, sasGenerator);

        var claims = new List<Claim>
        {
            new("oid", userId),
            new(ClaimTypes.Name, userId)
        };
        if (isStaff)
        {
            claims.Add(new(ClaimTypes.Role, "Technician"));
        }

        var identity = new ClaimsIdentity(claims, "TestAuth");
        var principal = new ClaimsPrincipal(identity);
        var httpContext = new DefaultHttpContext { User = principal };
        controller.ControllerContext = new ControllerContext
        {
            HttpContext = httpContext
        };

        return (controller, db, httpContext);
    }

    private static async Task SeedSampleAsync(PenanciaDbContext db, string sampleId, string ownerId)
    {
        db.Samples.Add(new SampleEntity
        {
            SampleId = sampleId,
            CreatedBy = ownerId,
            CreatedAtUtc = DateTime.UtcNow,
            State = "Draft",
            WorkflowMode = "prescreen"
        });
        await db.SaveChangesAsync();
    }

    [Fact]
    public async Task D1_GenerateUploadSas_WhenOverrideThrows_Returns503_AndInsertsZeroRows()
    {
        var (controller, db, _) = CreateController(
            sasGenerator: (_, _, _, _) => throw new RequestFailedException(500, "Simulated Azure delegation failure"));
        const string sampleId = "s-storage-throw";
        await SeedSampleAsync(db, sampleId, "test-patient");

        var result = await controller.GenerateUploadSas(
            sampleId: sampleId,
            kind: "video",
            contentType: "video/mp4");

        var objResult = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status503ServiceUnavailable, objResult.StatusCode);

        var errorProp = objResult.Value?.GetType().GetProperty("error")?.GetValue(objResult.Value)?.ToString();
        var msgProp = objResult.Value?.GetType().GetProperty("message")?.GetValue(objResult.Value)?.ToString();
        Assert.Equal("STORAGE_UNAVAILABLE", errorProp);
        Assert.Equal("Storage service unavailable.", msgProp);
        Assert.DoesNotContain("Simulated Azure delegation failure", msgProp);

        Assert.Empty(db.MediaAssets);
    }

    [Fact]
    public async Task CarryOver_GenerateUploadSas_503Body_MessageIsExact_AndLeaksNoExceptionText()
    {
        var (controller, db, _) = CreateController(
            sasGenerator: (_, _, _, _) => throw new InvalidOperationException("CRITICAL_INTERNAL_STORAGE_SECRET_KEY_FAIL"));
        const string sampleId = "s-storage-leak-test";
        await SeedSampleAsync(db, sampleId, "test-patient");

        var result = await controller.GenerateUploadSas(
            sampleId: sampleId,
            kind: "video",
            contentType: "video/mp4");

        var objResult = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status503ServiceUnavailable, objResult.StatusCode);

        var errorProp = objResult.Value?.GetType().GetProperty("error")?.GetValue(objResult.Value)?.ToString();
        var msgProp = objResult.Value?.GetType().GetProperty("message")?.GetValue(objResult.Value)?.ToString();

        Assert.Equal("STORAGE_UNAVAILABLE", errorProp);
        Assert.Equal("Storage service unavailable.", msgProp);
        Assert.DoesNotContain("CRITICAL_INTERNAL_STORAGE_SECRET_KEY_FAIL", msgProp);
        Assert.Empty(db.MediaAssets);
    }

    [Fact]
    public async Task D1_GenerateUploadSas_WhenBlobsNullInProductionClass_Returns503_AndInsertsZeroRows()
    {
        var options = new DbContextOptionsBuilder<PenanciaDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        var db = new PenanciaDbContext(options);
        const string sampleId = "s-prod-null-blobs";
        await SeedSampleAsync(db, sampleId, "test-patient");

        var config = new ConfigurationBuilder().Build();
        var logger = NullLogger<SamplesController>.Instance;
        // Instantiate the REAL un-subclassed SamplesController with null BlobServiceClient
        var controller = new SamplesController(db, null!, null!, config, logger);

        var claims = new List<Claim> { new("oid", "test-patient"), new(ClaimTypes.Name, "test-patient") };
        var principal = new ClaimsPrincipal(new ClaimsIdentity(claims, "TestAuth"));
        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext { User = principal }
        };

        var result = await controller.GenerateUploadSas(
            sampleId: sampleId,
            kind: "video",
            contentType: "video/mp4");

        var objResult = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status503ServiceUnavailable, objResult.StatusCode);

        var errorProp = objResult.Value?.GetType().GetProperty("error")?.GetValue(objResult.Value)?.ToString();
        var msgProp = objResult.Value?.GetType().GetProperty("message")?.GetValue(objResult.Value)?.ToString();
        Assert.Equal("STORAGE_UNAVAILABLE", errorProp);
        Assert.Equal("Storage service unavailable.", msgProp);
        Assert.DoesNotContain("BlobServiceClient", msgProp);

        Assert.Empty(db.MediaAssets);
    }

    [Fact]
    public async Task D2_GenerateUploadSas_RateLimit_CountsAllAssetsRegardlessOfStatus()
    {
        var (controller, db, httpContext) = CreateController();
        const string sampleId = "s-rate-limit-all-statuses";
        await SeedSampleAsync(db, sampleId, "test-patient");

        // Seed 10 assets with status "Uploaded", "Rejected", "Cleared" (NOT "Issued") within the last 30 minutes
        var statuses = new[] { "Uploaded", "Uploaded", "Rejected", "Cleared", "Uploaded", "Uploaded", "Uploaded", "Uploaded", "Uploaded", "Uploaded" };
        for (int i = 0; i < 10; i++)
        {
            db.MediaAssets.Add(new MediaAssetEntity
            {
                AssetId = Guid.NewGuid(),
                SampleId = sampleId,
                Kind = "video",
                Container = "quarantine",
                BlobName = $"{sampleId}/{Guid.NewGuid()}.mp4",
                ContentTypeDeclared = "video/mp4",
                Status = statuses[i],
                CreatedAtUtc = DateTime.UtcNow.AddMinutes(-30)
            });
        }
        await db.SaveChangesAsync();

        // 11th request must receive 429 even though NONE of the pre-existing assets are "Issued"
        var eleventhResult = await controller.GenerateUploadSas(
            sampleId: sampleId,
            kind: "video",
            contentType: "video/mp4");

        var statusResult = Assert.IsType<ObjectResult>(eleventhResult);
        Assert.Equal(StatusCodes.Status429TooManyRequests, statusResult.StatusCode);

        Assert.True(httpContext.Response.Headers.ContainsKey("Retry-After"));
        Assert.Equal("3600", httpContext.Response.Headers["Retry-After"].ToString());

        var errorProp = statusResult.Value?.GetType().GetProperty("error")?.GetValue(statusResult.Value)?.ToString();
        Assert.Equal("RATE_LIMIT_EXCEEDED", errorProp);

        // Database must still have exactly the 10 seeded assets
        Assert.Equal(10, await db.MediaAssets.CountAsync(m => m.SampleId == sampleId));
    }

    [Fact]
    public async Task T1_GenerateUploadSas_RateLimitWindow_Row59MinutesOldCounts_Row61MinutesOldDoesNot()
    {
        // Sub-test A: 9 recent rows + 1 row 59 minutes old => exactly 10 in window => 11th request is 429
        {
            var (controllerA, dbA, _) = CreateController();
            const string sampleA = "s-window-59min";
            await SeedSampleAsync(dbA, sampleA, "test-patient");

            for (int i = 0; i < 9; i++)
            {
                dbA.MediaAssets.Add(new MediaAssetEntity
                {
                    AssetId = Guid.NewGuid(),
                    SampleId = sampleA,
                    Kind = "video",
                    Container = "quarantine",
                    BlobName = $"{sampleA}/{Guid.NewGuid()}.mp4",
                    ContentTypeDeclared = "video/mp4",
                    Status = "Uploaded",
                    CreatedAtUtc = DateTime.UtcNow.AddMinutes(-10)
                });
            }
            // 59-minute-old asset (inside 1-hour window)
            dbA.MediaAssets.Add(new MediaAssetEntity
            {
                AssetId = Guid.NewGuid(),
                SampleId = sampleA,
                Kind = "video",
                Container = "quarantine",
                BlobName = $"{sampleA}/{Guid.NewGuid()}.mp4",
                ContentTypeDeclared = "video/mp4",
                Status = "Uploaded",
                CreatedAtUtc = DateTime.UtcNow.AddMinutes(-59)
            });
            await dbA.SaveChangesAsync();

            var resA = await controllerA.GenerateUploadSas(
                sampleId: sampleA,
                kind: "video",
                contentType: "video/mp4");

            var statusResult = Assert.IsType<ObjectResult>(resA);
            Assert.Equal(StatusCodes.Status429TooManyRequests, statusResult.StatusCode);
        }

        // Sub-test B: 9 recent rows + 1 row 61 minutes old => 9 in window => 10th request is allowed (200)
        {
            var (controllerB, dbB, _) = CreateController();
            const string sampleB = "s-window-61min";
            await SeedSampleAsync(dbB, sampleB, "test-patient");

            for (int i = 0; i < 9; i++)
            {
                dbB.MediaAssets.Add(new MediaAssetEntity
                {
                    AssetId = Guid.NewGuid(),
                    SampleId = sampleB,
                    Kind = "video",
                    Container = "quarantine",
                    BlobName = $"{sampleB}/{Guid.NewGuid()}.mp4",
                    ContentTypeDeclared = "video/mp4",
                    Status = "Uploaded",
                    CreatedAtUtc = DateTime.UtcNow.AddMinutes(-10)
                });
            }
            // 61-minute-old asset (outside 1-hour window)
            dbB.MediaAssets.Add(new MediaAssetEntity
            {
                AssetId = Guid.NewGuid(),
                SampleId = sampleB,
                Kind = "video",
                Container = "quarantine",
                BlobName = $"{sampleB}/{Guid.NewGuid()}.mp4",
                ContentTypeDeclared = "video/mp4",
                Status = "Uploaded",
                CreatedAtUtc = DateTime.UtcNow.AddMinutes(-61)
            });
            await dbB.SaveChangesAsync();

            var resB = await controllerB.GenerateUploadSas(
                sampleId: sampleB,
                kind: "video",
                contentType: "video/mp4");

            var okResult = Assert.IsType<OkObjectResult>(resB);
            Assert.Equal(StatusCodes.Status200OK, okResult.StatusCode);
        }
    }

    [Fact]
    public async Task T2_GenerateUploadSas_SasResource_IsStrictlyBlob_srEqualsB()
    {
        var (controller, db, _) = CreateController();
        const string sampleId = "s-resource-b";
        await SeedSampleAsync(db, sampleId, "test-patient");

        var result = await controller.GenerateUploadSas(
            sampleId: sampleId,
            kind: "video",
            contentType: "video/mp4");

        var ok = Assert.IsType<OkObjectResult>(result);
        var response = Assert.IsType<UploadSasResponseDto>(ok.Value);

        var uri = new Uri(response.UploadUrl);
        var query = QueryHelpers.ParseQuery(uri.Query);

        Assert.True(query.ContainsKey("sr"), "SAS URL must contain 'sr' parameter");
        Assert.Equal("b", query["sr"]);
    }

    [Fact]
    public async Task T3_GenerateUploadSas_DefaultMaxBytes_WithNoConfiguration()
    {
        var options = new DbContextOptionsBuilder<PenanciaDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        var db = new PenanciaDbContext(options);
        const string sampleId = "s-default-maxbytes";
        await SeedSampleAsync(db, sampleId, "test-patient");

        // Controller with completely empty IConfiguration (no MediaUpload section)
        var emptyConfig = new ConfigurationBuilder().Build();
        var logger = NullLogger<SamplesController>.Instance;
        var controller = new TestableSamplesController(db, null!, null!, emptyConfig, logger);

        var claims = new List<Claim> { new("oid", "test-patient"), new(ClaimTypes.Name, "test-patient") };
        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext { User = new ClaimsPrincipal(new ClaimsIdentity(claims, "TestAuth")) }
        };

        // Video default
        var videoRes = await controller.GenerateUploadSas(sampleId, kind: "video", contentType: "video/mp4");
        var videoDto = Assert.IsType<UploadSasResponseDto>(Assert.IsType<OkObjectResult>(videoRes).Value);
        Assert.Equal(524_288_000L, videoDto.MaxBytes);
        Assert.Equal(4_194_304L, videoDto.BlockSizeBytes);

        // Image default
        var imageRes = await controller.GenerateUploadSas(sampleId, kind: "image", contentType: "image/png");
        var imageDto = Assert.IsType<UploadSasResponseDto>(Assert.IsType<OkObjectResult>(imageRes).Value);
        Assert.Equal(26_214_400L, imageDto.MaxBytes);
        Assert.Equal(4_194_304L, imageDto.BlockSizeBytes);

        // Calibration default
        var calRes = await controller.GenerateUploadSas(sampleId, kind: "calibration", contentType: "image/jpeg");
        var calDto = Assert.IsType<UploadSasResponseDto>(Assert.IsType<OkObjectResult>(calRes).Value);
        Assert.Equal(26_214_400L, calDto.MaxBytes);
        Assert.Equal(4_194_304L, calDto.BlockSizeBytes);
    }

    [Fact]
    public async Task T4_GenerateUploadSas_SasTiming_StartIsNonFuture_AndExpiryIsBetween55And60Minutes()
    {
        var (controller, db, _) = CreateController();
        const string sampleId = "s-timing-check";
        await SeedSampleAsync(db, sampleId, "test-patient");

        var beforeCall = DateTimeOffset.UtcNow;
        var result = await controller.GenerateUploadSas(
            sampleId: sampleId,
            kind: "video",
            contentType: "video/mp4");
        var afterCall = DateTimeOffset.UtcNow;

        var ok = Assert.IsType<OkObjectResult>(result);
        var response = Assert.IsType<UploadSasResponseDto>(ok.Value);

        var uri = new Uri(response.UploadUrl);
        var query = QueryHelpers.ParseQuery(uri.Query);

        Assert.True(query.ContainsKey("st"), "SAS URL must contain start time 'st'");
        Assert.True(query.ContainsKey("se"), "SAS URL must contain expiry time 'se'");

        var st = DateTimeOffset.Parse(query["st"]!);
        var se = DateTimeOffset.Parse(query["se"]!);

        // Start time must not be in the future (startsOn is set to UtcNow - 5 min)
        Assert.True(st <= afterCall, $"Start time {st} must be <= current time {afterCall}");

        // Expiry minus now must be between 55 and 60.1 minutes
        var minutesRemaining = (se - beforeCall).TotalMinutes;
        Assert.InRange(minutesRemaining, 55.0, 60.1);
    }

    [Fact]
    public async Task T5_GenerateUploadSas_RawQueryParameters_VerifySprHttpsAndSpCw()
    {
        var (controller, db, _) = CreateController();
        const string sampleId = "s-query-raw-params";
        await SeedSampleAsync(db, sampleId, "test-patient");

        var result = await controller.GenerateUploadSas(
            sampleId: sampleId,
            kind: "image",
            contentType: "image/png");

        var ok = Assert.IsType<OkObjectResult>(result);
        var response = Assert.IsType<UploadSasResponseDto>(ok.Value);

        var uri = new Uri(response.UploadUrl);
        var query = QueryHelpers.ParseQuery(uri.Query);

        // Verify straight from the parsed URL query string
        Assert.True(query.ContainsKey("spr"), "SAS URL must contain 'spr'");
        Assert.Equal("https", query["spr"]);

        Assert.True(query.ContainsKey("sp"), "SAS URL must contain 'sp'");
        Assert.Equal("cw", query["sp"]);
    }

    [Theory]
    [InlineData("audio")]
    [InlineData("executable")]
    [InlineData("pdf")]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData(null)]
    public async Task GenerateUploadSas_RejectsUnknownKind_With400_AndCreatesNoAsset(string? badKind)
    {
        var (controller, db, _) = CreateController();
        const string sampleId = "s-kind-reject";
        await SeedSampleAsync(db, sampleId, "test-patient");

        var result = await controller.GenerateUploadSas(
            sampleId: sampleId,
            kind: badKind,
            contentType: "video/mp4");

        var badRequest = Assert.IsType<BadRequestObjectResult>(result);
        Assert.Equal(400, badRequest.StatusCode);

        var errorProp = badRequest.Value?.GetType().GetProperty("error")?.GetValue(badRequest.Value)?.ToString();
        Assert.Equal("INVALID_MEDIA_KIND", errorProp);

        Assert.Empty(db.MediaAssets);
    }

    [Theory]
    [InlineData("application/octet-stream")]
    [InlineData("application/x-sh")]
    [InlineData("text/plain")]
    [InlineData("video/avi")]
    [InlineData("image/bmp")]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData(null)]
    public async Task GenerateUploadSas_RejectsUnknownContentType_With400_AndCreatesNoAsset(string? badContentType)
    {
        var (controller, db, _) = CreateController();
        const string sampleId = "s-ctype-reject";
        await SeedSampleAsync(db, sampleId, "test-patient");

        var result = await controller.GenerateUploadSas(
            sampleId: sampleId,
            kind: "video",
            contentType: badContentType);

        var badRequest = Assert.IsType<BadRequestObjectResult>(result);
        Assert.Equal(400, badRequest.StatusCode);

        var errorProp = badRequest.Value?.GetType().GetProperty("error")?.GetValue(badRequest.Value)?.ToString();
        Assert.Equal("INVALID_CONTENT_TYPE", errorProp);

        Assert.Empty(db.MediaAssets);
    }

    [Theory]
    [InlineData("video", "image/png")]
    [InlineData("video", "image/jpeg")]
    [InlineData("image", "video/mp4")]
    [InlineData("image", "video/quicktime")]
    [InlineData("calibration", "video/webm")]
    public async Task GenerateUploadSas_RejectsMismatchedContentType_With400_AndCreatesNoAsset(string kind, string mismatchedContentType)
    {
        var (controller, db, _) = CreateController();
        const string sampleId = "s-mismatch-reject";
        await SeedSampleAsync(db, sampleId, "test-patient");

        var result = await controller.GenerateUploadSas(
            sampleId: sampleId,
            kind: kind,
            contentType: mismatchedContentType);

        var badRequest = Assert.IsType<BadRequestObjectResult>(result);
        Assert.Equal(400, badRequest.StatusCode);

        var errorProp = badRequest.Value?.GetType().GetProperty("error")?.GetValue(badRequest.Value)?.ToString();
        Assert.Equal("INVALID_CONTENT_TYPE", errorProp);

        Assert.Empty(db.MediaAssets);
    }

    [Fact]
    public async Task GenerateUploadSas_RejectsNonOwner_With403_AndCreatesNoAsset()
    {
        var (controller, db, _) = CreateController(userId: "impostor-user", isStaff: false);
        const string sampleId = "s-owner-check";
        await SeedSampleAsync(db, sampleId, "legitimate-owner");

        var result = await controller.GenerateUploadSas(
            sampleId: sampleId,
            kind: "video",
            contentType: "video/mp4");

        Assert.IsType<ForbidResult>(result);
        Assert.Empty(db.MediaAssets);
    }

    [Fact]
    public async Task GenerateUploadSas_AllowsStaffCaller_ForOtherUsersSample()
    {
        var (controller, db, _) = CreateController(userId: "staff-member", isStaff: true);
        const string sampleId = "s-staff-allow";
        await SeedSampleAsync(db, sampleId, "patient-owner");

        var result = await controller.GenerateUploadSas(
            sampleId: sampleId,
            kind: "video",
            contentType: "video/mp4");

        var ok = Assert.IsType<OkObjectResult>(result);
        Assert.Equal(200, ok.StatusCode);
        Assert.Single(db.MediaAssets);
    }

    [Fact]
    public async Task GenerateUploadSas_UnknownSample_Returns404_AndCreatesNoAsset()
    {
        var (controller, db, _) = CreateController();
        var result = await controller.GenerateUploadSas(
            sampleId: "non-existent-sample",
            kind: "video",
            contentType: "video/mp4");

        var notFound = Assert.IsType<NotFoundObjectResult>(result);
        Assert.Equal(404, notFound.StatusCode);
        Assert.Empty(db.MediaAssets);
    }

    [Fact]
    public async Task GenerateUploadSas_PermissionsAndContainer_ExactRequirements()
    {
        var (controller, db, _) = CreateController();
        const string sampleId = "s-sas-permissions";
        await SeedSampleAsync(db, sampleId, "test-patient");

        var kindsAndContentTypes = new[]
        {
            ("video", "video/mp4", ".mp4"),
            ("image", "image/png", ".png"),
            ("calibration", "image/jpeg", ".jpg")
        };

        foreach (var (kind, contentType, expectedExt) in kindsAndContentTypes)
        {
            var result = await controller.GenerateUploadSas(
                sampleId: sampleId,
                kind: kind,
                contentType: contentType);

            var ok = Assert.IsType<OkObjectResult>(result);
            var response = Assert.IsType<UploadSasResponseDto>(ok.Value);

            // 1. Container must be quarantine
            Assert.Equal("quarantine", response.Container);

            // 2. Blob name must start with sampleId/ and end with expected extension
            Assert.StartsWith($"{sampleId}/", response.BlobName);
            Assert.EndsWith(expectedExt, response.BlobName);

            // 3. Expiry is <= 60 minutes
            var now = DateTime.UtcNow;
            Assert.True(response.ExpiresAtUtc <= now.AddMinutes(61), "Expiry should be <= 60 minutes from now");
            Assert.True(response.ExpiresAtUtc >= now.AddMinutes(50), "Expiry should be close to 60 minutes from now");

            // 4. Parse the SAS URL to verify container, permissions, and single blob resource
            var blobUri = new BlobUriBuilder(new Uri(response.UploadUrl));
            Assert.Equal("quarantine", blobUri.BlobContainerName);
            Assert.Equal(response.BlobName, blobUri.BlobName);
            Assert.Equal("b", blobUri.Sas.Resource);
            Assert.Equal("cw", blobUri.Sas.Permissions);
            Assert.Equal(SasProtocol.Https, blobUri.Sas.Protocol);

            // Expiry in SAS query parameters must be <= 60 minutes
            Assert.True(blobUri.Sas.ExpiresOn <= DateTimeOffset.UtcNow.AddMinutes(61));
        }
    }

    [Fact]
    public async Task GenerateUploadSas_HostileFileName_IsIgnored_BlobNameIsSafe()
    {
        var (controller, db, _) = CreateController();
        const string sampleId = "s-hostile-input";
        await SeedSampleAsync(db, sampleId, "test-patient");

        var hostileFileNames = new[]
        {
            "../../etc/passwd",
            "..\\..\\windows\\system32\\cmd.exe",
            "malware.exe%00.jpg",
            "<script>alert(1)</script>.png",
            "very/deep/nested/path/to/file.mov",
            "normal-looking-name.php.jpeg"
        };

        foreach (var hostileName in hostileFileNames)
        {
            var result = await controller.GenerateUploadSas(
                sampleId: sampleId,
                kind: "image",
                fileName: hostileName,
                contentType: "image/png");

            var ok = Assert.IsType<OkObjectResult>(result);
            var response = Assert.IsType<UploadSasResponseDto>(ok.Value);

            // The blob name MUST start with {sampleId}/ and end with .png
            Assert.StartsWith($"{sampleId}/", response.BlobName);
            Assert.EndsWith(".png", response.BlobName);

            // No trace of the hostile input in the blob name or upload URL
            Assert.DoesNotContain("..", response.BlobName);
            Assert.DoesNotContain("passwd", response.BlobName);
            Assert.DoesNotContain("exe", response.BlobName);
            Assert.DoesNotContain("<script>", response.BlobName);
            Assert.DoesNotContain("%00", response.BlobName);
            Assert.DoesNotContain("php", response.BlobName);

            // Blob name is strictly {sampleId}/{Guid}.png
            var remainder = response.BlobName.Substring($"{sampleId}/".Length);
            var guidPart = remainder.Substring(0, remainder.Length - ".png".Length);
            Assert.True(Guid.TryParse(guidPart, out var parsedGuid));
            Assert.Equal(response.AssetId, parsedGuid);
        }
    }

    [Fact]
    public async Task GenerateUploadSas_RateLimit_11thRequestWithinHour_Returns429_WithRetryAfter()
    {
        var (controller, db, httpContext) = CreateController();
        const string sampleId = "s-rate-limit";
        await SeedSampleAsync(db, sampleId, "test-patient");

        // First 10 requests must succeed
        for (int i = 1; i <= 10; i++)
        {
            var res = await controller.GenerateUploadSas(
                sampleId: sampleId,
                kind: "video",
                contentType: "video/mp4");

            var ok = Assert.IsType<OkObjectResult>(res);
            Assert.Equal(200, ok.StatusCode);
        }

        Assert.Equal(10, await db.MediaAssets.CountAsync(m => m.SampleId == sampleId));

        // 11th request must return 429 Too Many Requests
        var eleventhResult = await controller.GenerateUploadSas(
            sampleId: sampleId,
            kind: "video",
            contentType: "video/mp4");

        var statusResult = Assert.IsType<ObjectResult>(eleventhResult);
        Assert.Equal(StatusCodes.Status429TooManyRequests, statusResult.StatusCode);

        // Header Retry-After: 3600 must be set
        Assert.True(httpContext.Response.Headers.ContainsKey("Retry-After"));
        Assert.Equal("3600", httpContext.Response.Headers["Retry-After"].ToString());

        // Error payload code
        var errorProp = statusResult.Value?.GetType().GetProperty("error")?.GetValue(statusResult.Value)?.ToString();
        Assert.Equal("RATE_LIMIT_EXCEEDED", errorProp);

        // Database must still have exactly 10 rows (11th request was rejected and created nothing)
        Assert.Equal(10, await db.MediaAssets.CountAsync(m => m.SampleId == sampleId));

        // A different sample should NOT be rate limited (rate limit is per-sample)
        const string otherSampleId = "s-rate-limit-other";
        await SeedSampleAsync(db, otherSampleId, "test-patient");
        var otherResult = await controller.GenerateUploadSas(
            sampleId: otherSampleId,
            kind: "video",
            contentType: "video/mp4");
        var otherOk = Assert.IsType<OkObjectResult>(otherResult);
        Assert.Equal(200, otherOk.StatusCode);

        // Old assets from more than 1 hour ago do NOT count towards the rate limit
        var expiredAsset = new MediaAssetEntity
        {
            AssetId = Guid.NewGuid(),
            SampleId = sampleId,
            Kind = "video",
            Container = "quarantine",
            BlobName = $"{sampleId}/old.mp4",
            ContentTypeDeclared = "video/mp4",
            Status = "Issued",
            CreatedAtUtc = DateTime.UtcNow.AddHours(-2) // 2 hours ago
        };
        db.MediaAssets.Add(expiredAsset);
        await db.SaveChangesAsync();

        // Count of all assets in DB for sample is 11, but only 10 are in the last hour
        Assert.Equal(11, await db.MediaAssets.CountAsync(m => m.SampleId == sampleId));
    }

    [Fact]
    public async Task GenerateUploadSas_PersistsMediaAsset_AndReturnsExpectedDtoProperties()
    {
        var (controller, db, _) = CreateController();
        const string sampleId = "s-dto-verify";
        await SeedSampleAsync(db, sampleId, "test-patient");

        var result = await controller.GenerateUploadSas(
            sampleId: sampleId,
            kind: "video",
            contentType: "video/mp4");

        var ok = Assert.IsType<OkObjectResult>(result);
        var response = Assert.IsType<UploadSasResponseDto>(ok.Value);

        // Check response properties
        Assert.NotEqual(Guid.Empty, response.AssetId);
        Assert.NotEmpty(response.UploadUrl);
        Assert.Equal(524_288_000L, response.MaxBytes);
        Assert.Equal(4_194_304L, response.BlockSizeBytes);
        Assert.Equal("quarantine", response.Container);
        Assert.Equal($"{sampleId}/{response.AssetId}.mp4", response.BlobName);

#pragma warning disable CS0618
        // Obsolete fields must match for one release
        Assert.Equal(response.UploadUrl, response.SasUrl);
        Assert.Equal(response.UploadUrl, response.TargetBlobUri);
#pragma warning restore CS0618

        // Check persisted MediaAssetEntity in database
        var asset = await db.MediaAssets.FirstOrDefaultAsync(m => m.AssetId == response.AssetId);
        Assert.NotNull(asset);
        Assert.Equal(sampleId, asset.SampleId);
        Assert.Equal("video", asset.Kind);
        Assert.Equal("quarantine", asset.Container);
        Assert.Equal(response.BlobName, asset.BlobName);
        Assert.Equal("video/mp4", asset.ContentTypeDeclared);
        Assert.Equal(0, asset.SizeBytes);
        Assert.Equal("Issued", asset.Status);
        Assert.True(asset.CreatedAtUtc >= DateTime.UtcNow.AddMinutes(-1));
    }

    [Fact]
    public async Task GenerateUploadSas_Configuration_OverridesMaxBytesAndBlockSize()
    {
        var customConfig = new Dictionary<string, string?>
        {
            ["MediaUpload:MaxBytes:Video"] = "104857600", // 100 MB
            ["MediaUpload:MaxBytes:Image"] = "10485760",   // 10 MB
            ["MediaUpload:BlockSizeBytes"] = "2097152"     // 2 MB
        };

        var (controller, db, _) = CreateController(customConfig: customConfig);
        const string sampleId = "s-custom-config";
        await SeedSampleAsync(db, sampleId, "test-patient");

        var result = await controller.GenerateUploadSas(
            sampleId: sampleId,
            kind: "video",
            contentType: "video/mp4");

        var ok = Assert.IsType<OkObjectResult>(result);
        var response = Assert.IsType<UploadSasResponseDto>(ok.Value);

        Assert.Equal(104_857_600L, response.MaxBytes);
        Assert.Equal(2_097_152L, response.BlockSizeBytes);
    }
}
