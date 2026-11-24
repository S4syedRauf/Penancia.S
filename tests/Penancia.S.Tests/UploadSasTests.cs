using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;
using Azure.Storage.Blobs;
using Azure.Storage.Sas;
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

public class UploadSasTests
{
    private static (SamplesController Controller, PenanciaDbContext Db, DefaultHttpContext HttpContext) CreateController(
        string userId = "test-patient",
        bool isStaff = false,
        Dictionary<string, string?>? customConfig = null)
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
        var controller = new SamplesController(db, null!, null!, config, logger);

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

        // Verify error code
        var errorProp = badRequest.Value?.GetType().GetProperty("error")?.GetValue(badRequest.Value)?.ToString();
        Assert.Equal("INVALID_MEDIA_KIND", errorProp);

        // Assert nothing inserted in MediaAssets table
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
