using System;
using System.Collections.Generic;
using System.Security.Claims;
using System.Threading.Tasks;
using Azure.Storage.Blobs;
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

public class RegisterBlobTests
{
    private class TestableSamplesController : SamplesController
    {
        private readonly Func<string, string, Task<BlobPropertiesDto>>? _blobPropertiesReader;
        private readonly Func<string, string, Task>? _blobDeleter;

        public TestableSamplesController(
            PenanciaDbContext db,
            BlobServiceClient? blobs,
            IConfiguration configuration,
            Func<string, string, Task<BlobPropertiesDto>>? blobPropertiesReader = null,
            Func<string, string, Task>? blobDeleter = null)
            : base(db, blobs!, null!, configuration, NullLogger<SamplesController>.Instance)
        {
            _blobPropertiesReader = blobPropertiesReader;
            _blobDeleter = blobDeleter;
        }

        protected override Task<BlobPropertiesDto> GetBlobPropertiesAsync(string container, string blobName)
        {
            if (_blobPropertiesReader != null)
            {
                return _blobPropertiesReader(container, blobName);
            }
            return Task.FromResult(new BlobPropertiesDto { Exists = true, ContentLength = 1024, ContentType = "video/mp4" });
        }

        protected override Task DeleteBlobIfExistsAsync(string container, string blobName)
        {
            if (_blobDeleter != null)
            {
                return _blobDeleter(container, blobName);
            }
            return Task.CompletedTask;
        }
    }

    private static (TestableSamplesController Controller, PenanciaDbContext Db, DefaultHttpContext HttpContext) CreateController(
        string userId = "test-patient",
        bool isStaff = false,
        Dictionary<string, string?>? customConfig = null,
        Func<string, string, Task<BlobPropertiesDto>>? blobPropertiesReader = null,
        Func<string, string, Task>? blobDeleter = null)
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

        var controller = new TestableSamplesController(db, null, config, blobPropertiesReader, blobDeleter);

        var claims = new List<Claim> { new("oid", userId), new(ClaimTypes.Name, userId) };
        if (isStaff)
        {
            claims.Add(new Claim(ClaimTypes.Role, "Staff"));
            claims.Add(new Claim("roles", "Staff"));
        }

        var principal = new ClaimsPrincipal(new ClaimsIdentity(claims, "TestAuth"));
        var httpContext = new DefaultHttpContext { User = principal };
        controller.ControllerContext = new ControllerContext { HttpContext = httpContext };

        return (controller, db, httpContext);
    }

    private static async Task SeedSampleAsync(PenanciaDbContext db, string sampleId, string ownerId = "test-patient")
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

    private static async Task<MediaAssetEntity> SeedMediaAssetAsync(
        PenanciaDbContext db,
        string sampleId,
        string kind = "video",
        string status = "Issued",
        long sizeBytes = 0,
        string? blobName = null)
    {
        var asset = new MediaAssetEntity
        {
            AssetId = Guid.NewGuid(),
            SampleId = sampleId,
            Kind = kind,
            Container = "quarantine",
            BlobName = blobName ?? $"{sampleId}/{Guid.NewGuid()}.mp4",
            ContentTypeDeclared = kind == "video" ? "video/mp4" : "image/jpeg",
            Status = status,
            SizeBytes = sizeBytes,
            CreatedAtUtc = DateTime.UtcNow
        };
        db.MediaAssets.Add(asset);
        await db.SaveChangesAsync();
        return asset;
    }

    [Fact]
    public async Task Test1_RegisterBlob_FakeAssetId_Returns404()
    {
        var (controller, db, _) = CreateController();
        const string sampleId = "s-fake-asset";
        await SeedSampleAsync(db, sampleId);

        var request = new RegisterBlobRequest { AssetId = Guid.NewGuid() };
        var result = await controller.RegisterBlob(sampleId, request);

        var objResult = Assert.IsType<NotFoundObjectResult>(result);
        Assert.Equal(StatusCodes.Status404NotFound, objResult.StatusCode);

        var error = objResult.Value?.GetType().GetProperty("error")?.GetValue(objResult.Value)?.ToString();
        Assert.Equal("ASSET_NOT_FOUND", error);
    }

    [Fact]
    public async Task Test2_RegisterBlob_AssetBelongsToAnotherSample_Returns403()
    {
        var (controller, db, _) = CreateController();
        const string sampleA = "s-sample-a";
        const string sampleB = "s-sample-b";
        await SeedSampleAsync(db, sampleA);
        await SeedSampleAsync(db, sampleB);

        var assetOfB = await SeedMediaAssetAsync(db, sampleB);

        // Attempting to register B's asset under sample A
        var request = new RegisterBlobRequest { AssetId = assetOfB.AssetId };
        var result = await controller.RegisterBlob(sampleA, request);

        Assert.IsType<ForbidResult>(result);
    }

    [Fact]
    public async Task Test3_RegisterBlob_NonOwner_Returns403()
    {
        var (controller, db, _) = CreateController(userId: "intruder");
        const string sampleId = "s-owner-check";
        await SeedSampleAsync(db, sampleId, ownerId: "legitimate-patient");

        var asset = await SeedMediaAssetAsync(db, sampleId);

        var request = new RegisterBlobRequest { AssetId = asset.AssetId };
        var result = await controller.RegisterBlob(sampleId, request);

        Assert.IsType<ForbidResult>(result);
    }

    [Fact]
    public async Task Test4_RegisterBlob_MissingBlob_Returns409BlobNotUploaded()
    {
        var (controller, db, _) = CreateController(
            blobPropertiesReader: (_, _) => Task.FromResult(new BlobPropertiesDto { Exists = false, ContentLength = 0 }));
        const string sampleId = "s-missing-blob";
        await SeedSampleAsync(db, sampleId);
        var asset = await SeedMediaAssetAsync(db, sampleId);

        var request = new RegisterBlobRequest { AssetId = asset.AssetId };
        var result = await controller.RegisterBlob(sampleId, request);

        var objResult = Assert.IsType<ConflictObjectResult>(result);
        Assert.Equal(StatusCodes.Status409Conflict, objResult.StatusCode);

        var error = objResult.Value?.GetType().GetProperty("error")?.GetValue(objResult.Value)?.ToString();
        Assert.Equal("BLOB_NOT_UPLOADED", error);
    }

    [Fact]
    public async Task Test5_RegisterBlob_ZeroLengthBlob_Returns409ZeroLengthBlob()
    {
        var (controller, db, _) = CreateController(
            blobPropertiesReader: (_, _) => Task.FromResult(new BlobPropertiesDto { Exists = true, ContentLength = 0 }));
        const string sampleId = "s-zero-length-blob";
        await SeedSampleAsync(db, sampleId);
        var asset = await SeedMediaAssetAsync(db, sampleId);

        var request = new RegisterBlobRequest { AssetId = asset.AssetId };
        var result = await controller.RegisterBlob(sampleId, request);

        var objResult = Assert.IsType<ConflictObjectResult>(result);
        Assert.Equal(StatusCodes.Status409Conflict, objResult.StatusCode);

        var error = objResult.Value?.GetType().GetProperty("error")?.GetValue(objResult.Value)?.ToString();
        Assert.Equal("ZERO_LENGTH_BLOB", error);
    }

    [Fact]
    public async Task Test6_RegisterBlob_OversizeBlob_Returns413_AndMarksRowRejected_AndDeletesBlob()
    {
        bool blobDeleteCalled = false;
        var (controller, db, _) = CreateController(
            customConfig: new Dictionary<string, string?>
            {
                ["MediaUpload:MaxBytes:Video"] = "1000" // 1,000 bytes max
            },
            blobPropertiesReader: (_, _) => Task.FromResult(new BlobPropertiesDto { Exists = true, ContentLength = 2000 }), // 2,000 bytes uploaded
            blobDeleter: (_, _) =>
            {
                blobDeleteCalled = true;
                return Task.CompletedTask;
            });

        const string sampleId = "s-oversize-blob";
        await SeedSampleAsync(db, sampleId);
        var asset = await SeedMediaAssetAsync(db, sampleId, kind: "video");

        var request = new RegisterBlobRequest { AssetId = asset.AssetId };
        var result = await controller.RegisterBlob(sampleId, request);

        var objResult = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status413PayloadTooLarge, objResult.StatusCode);

        var error = objResult.Value?.GetType().GetProperty("error")?.GetValue(objResult.Value)?.ToString();
        Assert.Equal("PAYLOAD_TOO_LARGE", error);

        Assert.True(blobDeleteCalled);

        // Verify database state: row marked Rejected
        var reloaded = await db.MediaAssets.FindAsync(asset.AssetId);
        Assert.NotNull(reloaded);
        Assert.Equal("Rejected", reloaded!.Status);
        Assert.Contains("exceeds maximum allowed", reloaded.RejectReason);
    }

    [Fact]
    public async Task Test7_RegisterBlob_BlobNamePrefixMismatch_Returns409()
    {
        var (controller, db, _) = CreateController();
        const string sampleId = "s-prefix-check";
        await SeedSampleAsync(db, sampleId);

        // BlobName starts with "different-sample/" instead of "{sampleId}/"
        var asset = await SeedMediaAssetAsync(db, sampleId, blobName: $"different-sample/{Guid.NewGuid()}.mp4");

        var request = new RegisterBlobRequest { AssetId = asset.AssetId };
        var result = await controller.RegisterBlob(sampleId, request);

        var objResult = Assert.IsType<ConflictObjectResult>(result);
        Assert.Equal(StatusCodes.Status409Conflict, objResult.StatusCode);

        var error = objResult.Value?.GetType().GetProperty("error")?.GetValue(objResult.Value)?.ToString();
        Assert.Equal("BLOB_PREFIX_MISMATCH", error);
    }

    [Fact]
    public async Task Test8_RegisterBlob_Success_SetsUploaded_AndRealSize()
    {
        const long realLength = 1234567;
        var (controller, db, _) = CreateController(
            blobPropertiesReader: (_, _) => Task.FromResult(new BlobPropertiesDto { Exists = true, ContentLength = realLength, ContentType = "video/mp4" }));

        const string sampleId = "s-success";
        await SeedSampleAsync(db, sampleId);
        var asset = await SeedMediaAssetAsync(db, sampleId, kind: "video");

        var request = new RegisterBlobRequest { AssetId = asset.AssetId };
        var result = await controller.RegisterBlob(sampleId, request);

        var okResult = Assert.IsType<OkObjectResult>(result);
        Assert.Equal(StatusCodes.Status200OK, okResult.StatusCode);

        var reloadedAsset = await db.MediaAssets.FindAsync(asset.AssetId);
        Assert.NotNull(reloadedAsset);
        Assert.Equal("Uploaded", reloadedAsset!.Status);
        Assert.Equal(realLength, reloadedAsset.SizeBytes);

        // Sample RawVideoBlobUri derived from verified row
        var reloadedSample = await db.Samples.FindAsync(sampleId);
        Assert.NotNull(reloadedSample);
        Assert.Equal($"https://stpenancias.blob.core.windows.net/quarantine/{asset.BlobName}", reloadedSample!.RawVideoBlobUri);
    }

    [Fact]
    public async Task Test9_RegisterBlob_SecondCallIsIdempotent_AndDoesNotChangeData()
    {
        const long realLength = 500000;
        var (controller, db, _) = CreateController(
            blobPropertiesReader: (_, _) => Task.FromResult(new BlobPropertiesDto { Exists = true, ContentLength = realLength, ContentType = "video/mp4" }));

        const string sampleId = "s-idempotent";
        await SeedSampleAsync(db, sampleId);
        var asset = await SeedMediaAssetAsync(db, sampleId, kind: "video");

        var request = new RegisterBlobRequest { AssetId = asset.AssetId };

        // First call
        var result1 = await controller.RegisterBlob(sampleId, request);
        var ok1 = Assert.IsType<OkObjectResult>(result1);
        Assert.Equal(StatusCodes.Status200OK, ok1.StatusCode);

        var firstAsset = await db.MediaAssets.AsNoTracking().FirstAsync(m => m.AssetId == asset.AssetId);

        // Second call
        var result2 = await controller.RegisterBlob(sampleId, request);
        var ok2 = Assert.IsType<OkObjectResult>(result2);
        Assert.Equal(StatusCodes.Status200OK, ok2.StatusCode);

        var secondAsset = await db.MediaAssets.AsNoTracking().FirstAsync(m => m.AssetId == asset.AssetId);

        Assert.Equal("Uploaded", secondAsset.Status);
        Assert.Equal(firstAsset.SizeBytes, secondAsset.SizeBytes);
        Assert.Equal(firstAsset.CreatedAtUtc, secondAsset.CreatedAtUtc);
    }

    [Fact]
    public async Task Test10_RegisterBlob_RequestBodyContainingBlobUri_NeverChangesStoredUri_AndReturnsDeprecationHeader()
    {
        const long realLength = 2048;
        var (controller, db, httpContext) = CreateController(
            blobPropertiesReader: (_, _) => Task.FromResult(new BlobPropertiesDto { Exists = true, ContentLength = realLength, ContentType = "video/mp4" }));

        const string sampleId = "s-deprecated-bloburi";
        await SeedSampleAsync(db, sampleId);
        var asset = await SeedMediaAssetAsync(db, sampleId, kind: "video");

        // Old client sends hostile or arbitrary client-supplied blobUri
        var request = new RegisterBlobRequest
        {
            AssetId = asset.AssetId,
            BlobUri = "https://hostile.attacker.blob.core.windows.net/raw-video/evil.mp4",
            MediaType = "video"
        };

        var result = await controller.RegisterBlob(sampleId, request);
        var okResult = Assert.IsType<OkObjectResult>(result);
        Assert.Equal(StatusCodes.Status200OK, okResult.StatusCode);

        // Verify Deprecation header
        Assert.True(httpContext.Response.Headers.ContainsKey("Deprecation"));
        Assert.Equal("true", httpContext.Response.Headers["Deprecation"].ToString());

        // Verify sample RawVideoBlobUri is derived strictly from verified MediaAsset row, NEVER hostile URI
        var sample = await db.Samples.FindAsync(sampleId);
        Assert.NotNull(sample);
        Assert.DoesNotContain("hostile.attacker", sample!.RawVideoBlobUri);
        Assert.Equal($"https://stpenancias.blob.core.windows.net/quarantine/{asset.BlobName}", sample.RawVideoBlobUri);
    }

    [Fact]
    public async Task Test11_RegisterBlob_StorageFailure_Returns503_AndRowUnchanged_WithNoExceptionLeak()
    {
        var (controller, db, _) = CreateController(
            blobPropertiesReader: (_, _) => throw new InvalidOperationException("CRITICAL_INTERNAL_AZURE_STORAGE_SECRET_ERROR"));

        const string sampleId = "s-storage-fail";
        await SeedSampleAsync(db, sampleId);
        var asset = await SeedMediaAssetAsync(db, sampleId, kind: "video", status: "Issued", sizeBytes: 0);

        var request = new RegisterBlobRequest { AssetId = asset.AssetId };
        var result = await controller.RegisterBlob(sampleId, request);

        var objResult = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status503ServiceUnavailable, objResult.StatusCode);

        var error = objResult.Value?.GetType().GetProperty("error")?.GetValue(objResult.Value)?.ToString();
        var message = objResult.Value?.GetType().GetProperty("message")?.GetValue(objResult.Value)?.ToString();

        Assert.Equal("STORAGE_UNAVAILABLE", error);
        Assert.Equal("Storage service unavailable.", message);
        Assert.DoesNotContain("CRITICAL_INTERNAL_AZURE_STORAGE_SECRET_ERROR", message);

        // Database row must be completely unchanged
        var reloaded = await db.MediaAssets.FindAsync(asset.AssetId);
        Assert.NotNull(reloaded);
        Assert.Equal("Issued", reloaded!.Status);
        Assert.Equal(0, reloaded.SizeBytes);
        Assert.Null(reloaded.RejectReason);
    }

    [Fact]
    public async Task Test12_RegisterBlob_RejectedAsset_Returns409Conflict()
    {
        var (controller, db, _) = CreateController();
        const string sampleId = "s-rejected-asset";
        await SeedSampleAsync(db, sampleId);

        var asset = await SeedMediaAssetAsync(db, sampleId, kind: "video", status: "Rejected");
        asset.RejectReason = "Malware detected";
        await db.SaveChangesAsync();

        var request = new RegisterBlobRequest { AssetId = asset.AssetId };
        var result = await controller.RegisterBlob(sampleId, request);

        var objResult = Assert.IsType<ConflictObjectResult>(result);
        Assert.Equal(StatusCodes.Status409Conflict, objResult.StatusCode);

        var error = objResult.Value?.GetType().GetProperty("error")?.GetValue(objResult.Value)?.ToString();
        Assert.Equal("ASSET_REJECTED", error);
    }
}
