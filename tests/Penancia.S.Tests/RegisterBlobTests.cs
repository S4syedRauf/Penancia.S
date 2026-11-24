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
            : base(db, blobs ?? new BlobServiceClient(new Uri("https://stpenancias.blob.core.windows.net")), null!, configuration, NullLogger<SamplesController>.Instance)
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
        Func<string, string, Task>? blobDeleter = null,
        BlobServiceClient? blobs = null)
    {
        var options = new DbContextOptionsBuilder<PenanciaDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .ConfigureWarnings(w => w.Ignore(Microsoft.EntityFrameworkCore.Diagnostics.InMemoryEventId.TransactionIgnoredWarning))
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

        var controller = new TestableSamplesController(db, blobs, config, blobPropertiesReader, blobDeleter);

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

    private static async Task SeedSampleAsync(PenanciaDbContext db, string sampleId, string ownerId = "test-patient", string state = "Draft")
    {
        db.Samples.Add(new SampleEntity
        {
            SampleId = sampleId,
            CreatedBy = ownerId,
            CreatedAtUtc = DateTime.UtcNow,
            State = state,
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
    public async Task Test9_RegisterBlob_SecondCallIsIdempotent_AndDoesNotTouchStorage_C1()
    {
        // C1: Idempotency: 2nd RegisterBlob on an Uploaded asset must NOT touch storage
        int storageCalls = 0;
        var (controller, db, _) = CreateController(
            blobPropertiesReader: (_, _) =>
            {
                storageCalls++;
                if (storageCalls > 1)
                {
                    throw new InvalidOperationException("Storage should NOT be called on second idempotent invocation!");
                }
                return Task.FromResult(new BlobPropertiesDto { Exists = true, ContentLength = 500000, ContentType = "video/mp4" });
            });

        const string sampleId = "s-idempotent-c1";
        await SeedSampleAsync(db, sampleId);
        var asset = await SeedMediaAssetAsync(db, sampleId, kind: "video");

        var request = new RegisterBlobRequest { AssetId = asset.AssetId };

        // First call
        var result1 = await controller.RegisterBlob(sampleId, request);
        var ok1 = Assert.IsType<OkObjectResult>(result1);
        Assert.Equal(StatusCodes.Status200OK, ok1.StatusCode);
        Assert.Equal(1, storageCalls);

        var firstAsset = await db.MediaAssets.AsNoTracking().FirstAsync(m => m.AssetId == asset.AssetId);

        // Second call: storage reader would throw if invoked!
        var result2 = await controller.RegisterBlob(sampleId, request);
        var ok2 = Assert.IsType<OkObjectResult>(result2);
        Assert.Equal(StatusCodes.Status200OK, ok2.StatusCode);
        Assert.Equal(1, storageCalls); // Must remain 1, storage not touched!

        var secondAsset = await db.MediaAssets.AsNoTracking().FirstAsync(m => m.AssetId == asset.AssetId);
        Assert.Equal("Uploaded", secondAsset.Status);
        Assert.Equal(firstAsset.SizeBytes, secondAsset.SizeBytes);
    }

    [Fact]
    public async Task Test10_RegisterBlob_BlobNamePrefixCaseSensitive_Returns409_C2()
    {
        // C2: Prefix check is case-sensitive: BlobName "S-1/..." for sample "s-1" -> 409 (kills OrdinalIgnoreCase)
        var (controller, db, _) = CreateController();
        const string sampleId = "s-case-sensitive";
        await SeedSampleAsync(db, sampleId);

        // Upper case prefix: S-CASE-SENSITIVE/ vs s-case-sensitive/
        var asset = await SeedMediaAssetAsync(db, sampleId, blobName: $"S-CASE-SENSITIVE/{Guid.NewGuid()}.mp4");

        var request = new RegisterBlobRequest { AssetId = asset.AssetId };
        var result = await controller.RegisterBlob(sampleId, request);

        var objResult = Assert.IsType<ConflictObjectResult>(result);
        Assert.Equal(StatusCodes.Status409Conflict, objResult.StatusCode);

        var error = objResult.Value?.GetType().GetProperty("error")?.GetValue(objResult.Value)?.ToString();
        Assert.Equal("BLOB_PREFIX_MISMATCH", error);
    }

    [Fact]
    public async Task Test11_RegisterBlob_SizeBoundary_ExactMaxSucceeds_MaxPlusOneFails_C3()
    {
        // C3: Size boundary: ContentLength == maxBytes -> 200 Uploaded; maxBytes + 1 -> 413 (kills >= mutation)
        const long maxBytes = 5000;

        // Sub-test A: ContentLength == maxBytes -> 200 Uploaded
        {
            var (controller, db, _) = CreateController(
                customConfig: new Dictionary<string, string?> { ["MediaUpload:MaxBytes:Video"] = maxBytes.ToString() },
                blobPropertiesReader: (_, _) => Task.FromResult(new BlobPropertiesDto { Exists = true, ContentLength = maxBytes, ContentType = "video/mp4" }));

            const string sampleId = "s-bound-equal";
            await SeedSampleAsync(db, sampleId);
            var asset = await SeedMediaAssetAsync(db, sampleId, kind: "video");

            var result = await controller.RegisterBlob(sampleId, new RegisterBlobRequest { AssetId = asset.AssetId });
            var okResult = Assert.IsType<OkObjectResult>(result);
            Assert.Equal(StatusCodes.Status200OK, okResult.StatusCode);

            var reloaded = await db.MediaAssets.FindAsync(asset.AssetId);
            Assert.Equal("Uploaded", reloaded!.Status);
        }

        // Sub-test B: ContentLength == maxBytes + 1 -> 413 PayloadTooLarge
        {
            var (controller, db, _) = CreateController(
                customConfig: new Dictionary<string, string?> { ["MediaUpload:MaxBytes:Video"] = maxBytes.ToString() },
                blobPropertiesReader: (_, _) => Task.FromResult(new BlobPropertiesDto { Exists = true, ContentLength = maxBytes + 1, ContentType = "video/mp4" }));

            const string sampleId = "s-bound-plus-one";
            await SeedSampleAsync(db, sampleId);
            var asset = await SeedMediaAssetAsync(db, sampleId, kind: "video");

            var result = await controller.RegisterBlob(sampleId, new RegisterBlobRequest { AssetId = asset.AssetId });
            var objResult = Assert.IsType<ObjectResult>(result);
            Assert.Equal(StatusCodes.Status413PayloadTooLarge, objResult.StatusCode);

            var reloaded = await db.MediaAssets.FindAsync(asset.AssetId);
            Assert.Equal("Rejected", reloaded!.Status);
        }
    }

    [Fact]
    public async Task Test12_RegisterBlob_MediaKindSetsSpecificUri_ImageVideoCalibration_C4()
    {
        // C4: Media kind sets specific URI: image sets RawImageBlobUri, video sets RawVideoBlobUri, calibration sets neither
        // 1. Kind = video
        {
            var (controller, db, _) = CreateController(
                blobPropertiesReader: (_, _) => Task.FromResult(new BlobPropertiesDto { Exists = true, ContentLength = 1000, ContentType = "video/mp4" }));
            const string sampleId = "s-c4-video";
            await SeedSampleAsync(db, sampleId);
            var asset = await SeedMediaAssetAsync(db, sampleId, kind: "video");

            await controller.RegisterBlob(sampleId, new RegisterBlobRequest { AssetId = asset.AssetId });
            var sample = await db.Samples.FindAsync(sampleId);
            Assert.NotNull(sample!.RawVideoBlobUri);
            Assert.Null(sample.RawImageBlobUri);
        }

        // 2. Kind = image
        {
            var (controller, db, _) = CreateController(
                blobPropertiesReader: (_, _) => Task.FromResult(new BlobPropertiesDto { Exists = true, ContentLength = 1000, ContentType = "image/jpeg" }));
            const string sampleId = "s-c4-image";
            await SeedSampleAsync(db, sampleId);
            var asset = await SeedMediaAssetAsync(db, sampleId, kind: "image");

            await controller.RegisterBlob(sampleId, new RegisterBlobRequest { AssetId = asset.AssetId });
            var sample = await db.Samples.FindAsync(sampleId);
            Assert.Null(sample!.RawVideoBlobUri);
            Assert.NotNull(sample.RawImageBlobUri);
        }

        // 3. Kind = calibration
        {
            var (controller, db, _) = CreateController(
                blobPropertiesReader: (_, _) => Task.FromResult(new BlobPropertiesDto { Exists = true, ContentLength = 1000, ContentType = "image/png" }));
            const string sampleId = "s-c4-cal";
            await SeedSampleAsync(db, sampleId);
            var asset = await SeedMediaAssetAsync(db, sampleId, kind: "calibration");

            await controller.RegisterBlob(sampleId, new RegisterBlobRequest { AssetId = asset.AssetId });
            var sample = await db.Samples.FindAsync(sampleId);
            Assert.Null(sample!.RawVideoBlobUri);
            Assert.Null(sample.RawImageBlobUri);
        }
    }

    [Fact]
    public async Task Test13_RegisterBlob_DeprecationHeaders_PresentWhenBlobUriSent_AbsentWhenOmitted_C5()
    {
        // C5: Both deprecation headers asserted: Deprecation: true AND X-Deprecated-Field: blobUri, absent when blobUri is omitted
        // Case A: blobUri sent -> both headers present
        {
            var (controller, db, httpContext) = CreateController(
                blobPropertiesReader: (_, _) => Task.FromResult(new BlobPropertiesDto { Exists = true, ContentLength = 1000, ContentType = "video/mp4" }));
            const string sampleId = "s-c5-sent";
            await SeedSampleAsync(db, sampleId);
            var asset = await SeedMediaAssetAsync(db, sampleId, kind: "video");

            var request = new RegisterBlobRequest
            {
                AssetId = asset.AssetId,
                BlobUri = "https://old.blob.windows.net/quarantine/old.mp4"
            };
            var result = await controller.RegisterBlob(sampleId, request);
            Assert.IsType<OkObjectResult>(result);

            Assert.True(httpContext.Response.Headers.ContainsKey("Deprecation"));
            Assert.Equal("true", httpContext.Response.Headers["Deprecation"].ToString());
            Assert.True(httpContext.Response.Headers.ContainsKey("X-Deprecated-Field"));
            Assert.Equal("blobUri", httpContext.Response.Headers["X-Deprecated-Field"].ToString());
        }

        // Case B: blobUri omitted -> neither header present
        {
            var (controller, db, httpContext) = CreateController(
                blobPropertiesReader: (_, _) => Task.FromResult(new BlobPropertiesDto { Exists = true, ContentLength = 1000, ContentType = "video/mp4" }));
            const string sampleId = "s-c5-omitted";
            await SeedSampleAsync(db, sampleId);
            var asset = await SeedMediaAssetAsync(db, sampleId, kind: "video");

            var request = new RegisterBlobRequest { AssetId = asset.AssetId };
            var result = await controller.RegisterBlob(sampleId, request);
            Assert.IsType<OkObjectResult>(result);

            Assert.False(httpContext.Response.Headers.ContainsKey("Deprecation"));
            Assert.False(httpContext.Response.Headers.ContainsKey("X-Deprecated-Field"));
        }
    }

    [Fact]
    public async Task Test14_RegisterBlob_CalibrationDefaultMaxBytes_WithNoConfig_BoundaryTest_C6()
    {
        // C6: Calibration default maxBytes (26214400) with no config, plus boundary test
        const long defaultMax = 26214400;

        // Sub-test A: ContentLength == defaultMax -> 200 OK
        {
            var (controller, db, _) = CreateController(
                customConfig: new Dictionary<string, string?>
                {
                    ["MediaUpload:MaxBytes:Calibration"] = null // No config
                },
                blobPropertiesReader: (_, _) => Task.FromResult(new BlobPropertiesDto { Exists = true, ContentLength = defaultMax, ContentType = "image/png" }));
            const string sampleId = "s-c6-max";
            await SeedSampleAsync(db, sampleId);
            var asset = await SeedMediaAssetAsync(db, sampleId, kind: "calibration");

            var result = await controller.RegisterBlob(sampleId, new RegisterBlobRequest { AssetId = asset.AssetId });
            var okResult = Assert.IsType<OkObjectResult>(result);
            Assert.Equal(StatusCodes.Status200OK, okResult.StatusCode);
            var reloaded = await db.MediaAssets.FindAsync(asset.AssetId);
            Assert.Equal("Uploaded", reloaded!.Status);
        }

        // Sub-test B: ContentLength == defaultMax + 1 -> 413 PayloadTooLarge
        {
            var (controller, db, _) = CreateController(
                customConfig: new Dictionary<string, string?>
                {
                    ["MediaUpload:MaxBytes:Calibration"] = null // No config
                },
                blobPropertiesReader: (_, _) => Task.FromResult(new BlobPropertiesDto { Exists = true, ContentLength = defaultMax + 1, ContentType = "image/png" }));
            const string sampleId = "s-c6-over";
            await SeedSampleAsync(db, sampleId);
            var asset = await SeedMediaAssetAsync(db, sampleId, kind: "calibration");

            var result = await controller.RegisterBlob(sampleId, new RegisterBlobRequest { AssetId = asset.AssetId });
            var objResult = Assert.IsType<ObjectResult>(result);
            Assert.Equal(StatusCodes.Status413PayloadTooLarge, objResult.StatusCode);
            var reloaded = await db.MediaAssets.FindAsync(asset.AssetId);
            Assert.Equal("Rejected", reloaded!.Status);
        }
    }

    [Fact]
    public async Task Test15_RegisterBlob_OversizeBlob_RowMarkedRejected_EvenWhenDeleteThrows_C7()
    {
        // C7: Oversize ordering: row marked Rejected in DB even if DeleteBlobIfExistsAsync throws (still returns 413)
        var (controller, db, _) = CreateController(
            customConfig: new Dictionary<string, string?>
            {
                ["MediaUpload:MaxBytes:Video"] = "1000"
            },
            blobPropertiesReader: (_, _) => Task.FromResult(new BlobPropertiesDto { Exists = true, ContentLength = 2000 }),
            blobDeleter: (_, _) => throw new InvalidOperationException("Failed to delete blob from storage!"));

        const string sampleId = "s-c7-delete-throws";
        await SeedSampleAsync(db, sampleId);
        var asset = await SeedMediaAssetAsync(db, sampleId, kind: "video");

        var request = new RegisterBlobRequest { AssetId = asset.AssetId };
        var result = await controller.RegisterBlob(sampleId, request);

        var objResult = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status413PayloadTooLarge, objResult.StatusCode);

        // Verify MediaAsset row is STILL marked Rejected in DB (clearing change tracker ensures DB persistence)
        db.ChangeTracker.Clear();
        var reloaded = await db.MediaAssets.FindAsync(asset.AssetId);
        Assert.NotNull(reloaded);
        Assert.Equal("Rejected", reloaded!.Status);
        Assert.Contains("exceeds maximum allowed", reloaded.RejectReason);
    }

    [Fact]
    public async Task Test16_RegisterBlob_StorageFailure_Returns503_AndRowUnchanged_WithNoExceptionLeak()
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
    public async Task Test17_RegisterBlob_RejectedAsset_Returns409Conflict()
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

    [Fact]
    public async Task Test18_SubmitSample_QuarantineScanGate_UploadedNotCleared_Returns422NoClearedMedia()
    {
        var (controller, db, httpContext) = CreateController();
        const string sampleId = "s-scan-gate-pending";
        var cal = new CalibrationEntity
        {
            CalibrationId = Guid.NewGuid(),
            SampleId = sampleId,
            Status = "Valid",
            TargetId = "thorlabs-r1l3s2p",
            ReferencePitchUm = 10.0,
            MicronsPerPixel = 0.4,
            CreatedAtUtc = DateTime.UtcNow
        };
        db.Calibrations.Add(cal);
        await SeedSampleAsync(db, sampleId, state: "Draft");
        var sample = await db.Samples.FindAsync(sampleId);
        sample!.CalibrationId = cal.CalibrationId;
        await db.SaveChangesAsync();

        // Seed media asset that is "Uploaded" (has not passed malware scanning)
        await SeedMediaAssetAsync(db, sampleId, kind: "video", status: "Uploaded", sizeBytes: 1024);

        httpContext.Request.Headers["Idempotency-Key"] = "test18-key";
        var result = await controller.SubmitSample(sampleId);

        var objResult = Assert.IsType<UnprocessableEntityObjectResult>(result);
        Assert.Equal(StatusCodes.Status422UnprocessableEntity, objResult.StatusCode);

        var error = objResult.Value?.GetType().GetProperty("error")?.GetValue(objResult.Value)?.ToString();
        Assert.Equal("NO_CLEARED_MEDIA", error);
    }

    [Fact]
    public async Task Test19_SubmitSample_QuarantineScanGate_Cleared_Succeeds202()
    {
        var (controller, db, httpContext) = CreateController();
        const string sampleId = "s-scan-gate-cleared";
        var cal = new CalibrationEntity
        {
            CalibrationId = Guid.NewGuid(),
            SampleId = sampleId,
            Status = "Valid",
            TargetId = "thorlabs-r1l3s2p",
            ReferencePitchUm = 10.0,
            MicronsPerPixel = 0.4,
            CreatedAtUtc = DateTime.UtcNow
        };
        db.Calibrations.Add(cal);
        await SeedSampleAsync(db, sampleId, state: "Draft");
        var sample = await db.Samples.FindAsync(sampleId);
        sample!.CalibrationId = cal.CalibrationId;
        await db.SaveChangesAsync();

        // Seed media asset that is "Cleared"
        await SeedMediaAssetAsync(db, sampleId, kind: "video", status: "Cleared", sizeBytes: 1024);

        httpContext.Request.Headers["Idempotency-Key"] = "test19-key";
        var result = await controller.SubmitSample(sampleId);

        var accepted = Assert.IsType<AcceptedResult>(result);
        Assert.Equal(StatusCodes.Status202Accepted, accepted.StatusCode);
    }

    [Fact]
    public async Task Test20_RegisterBlob_ClearedAsset_Returns200Idempotent_AndStaysCleared_F1()
    {
        // F1: RegisterBlob on an already Cleared asset must NOT regress status back to Uploaded or touch storage
        var (controller, db, _) = CreateController(
            blobPropertiesReader: (_, _) => throw new InvalidOperationException("Storage must NOT be called for Cleared asset!"));
        const string sampleId = "s-cleared-sticky-f1";
        await SeedSampleAsync(db, sampleId);
        var asset = await SeedMediaAssetAsync(db, sampleId, kind: "video", status: "Cleared", sizeBytes: 4096);

        var result = await controller.RegisterBlob(sampleId, new RegisterBlobRequest { AssetId = asset.AssetId });

        var okResult = Assert.IsType<OkObjectResult>(result);
        Assert.Equal(StatusCodes.Status200OK, okResult.StatusCode);
        var statusProp = okResult.Value?.GetType().GetProperty("status")?.GetValue(okResult.Value)?.ToString();
        Assert.Equal("Cleared", statusProp);

        db.ChangeTracker.Clear();
        var reloaded = await db.MediaAssets.FindAsync(asset.AssetId);
        Assert.NotNull(reloaded);
        Assert.Equal("Cleared", reloaded!.Status);
        Assert.Equal(4096, reloaded.SizeBytes);

        var reloadedSample = await db.Samples.FindAsync(sampleId);
        Assert.Null(reloadedSample!.RawVideoBlobUri);
    }

    [Fact]
    public async Task Test21_SubmitSample_OneClearedAndOneUploadedMediaAsset_Returns422ScanPending_F4()
    {
        // F4: Kills Any -> All mutant in quarantine scan-gate on SubmitSample
        var (controller, db, httpContext) = CreateController();
        const string sampleId = "s-scan-gate-any-vs-all";
        var cal = new CalibrationEntity
        {
            CalibrationId = Guid.NewGuid(),
            SampleId = sampleId,
            Status = "Valid",
            TargetId = "thorlabs-r1l3s2p",
            ReferencePitchUm = 10.0,
            MicronsPerPixel = 0.4,
            CreatedAtUtc = DateTime.UtcNow
        };
        db.Calibrations.Add(cal);
        await SeedSampleAsync(db, sampleId, state: "Draft");
        var sample = await db.Samples.FindAsync(sampleId);
        sample!.CalibrationId = cal.CalibrationId;
        await db.SaveChangesAsync();

        await SeedMediaAssetAsync(db, sampleId, kind: "video", status: "Cleared", sizeBytes: 2048);
        await SeedMediaAssetAsync(db, sampleId, kind: "image", status: "Uploaded", sizeBytes: 1024);

        httpContext.Request.Headers["Idempotency-Key"] = "test21-key";
        var result = await controller.SubmitSample(sampleId);

        var objResult = Assert.IsType<UnprocessableEntityObjectResult>(result);
        Assert.Equal(StatusCodes.Status422UnprocessableEntity, objResult.StatusCode);
        var error = objResult.Value?.GetType().GetProperty("error")?.GetValue(objResult.Value)?.ToString();
        Assert.Equal("SCAN_PENDING", error);
    }

    [Fact]
    public async Task Test22_SubmitSample_QuarantineAssetWithVerifiedStatus_Returns422NoClearedMedia_F5()
    {
        // F5: Verified is removed from the quarantine scan-gate
        var (controller, db, httpContext) = CreateController();
        const string sampleId = "s-scan-gate-no-verified";
        var cal = new CalibrationEntity
        {
            CalibrationId = Guid.NewGuid(),
            SampleId = sampleId,
            Status = "Valid",
            TargetId = "thorlabs-r1l3s2p",
            ReferencePitchUm = 10.0,
            MicronsPerPixel = 0.4,
            CreatedAtUtc = DateTime.UtcNow
        };
        db.Calibrations.Add(cal);
        await SeedSampleAsync(db, sampleId, state: "Draft");
        var sample = await db.Samples.FindAsync(sampleId);
        sample!.CalibrationId = cal.CalibrationId;
        await db.SaveChangesAsync();

        await SeedMediaAssetAsync(db, sampleId, kind: "video", status: "Verified", sizeBytes: 2048);

        httpContext.Request.Headers["Idempotency-Key"] = "test22-key";
        var result = await controller.SubmitSample(sampleId);

        var objResult = Assert.IsType<UnprocessableEntityObjectResult>(result);
        Assert.Equal(StatusCodes.Status422UnprocessableEntity, objResult.StatusCode);
        var error = objResult.Value?.GetType().GetProperty("error")?.GetValue(objResult.Value)?.ToString();
        Assert.Equal("NO_CLEARED_MEDIA", error);
    }
}
