using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.DurableTask;
using Microsoft.DurableTask.Client;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Penancia.S.Data;
using Penancia.S.Data.Entities;
using Penancia.S.Domain.Workflow;
using Penancia.S.Workflow.Functions;
using Xunit;

namespace Penancia.S.Tests;

public class BlobEventsFunctionTests
{
    private class TestDurableTaskClient : DurableTaskClient
    {
        public bool InstanceExists { get; set; } = true;
        public bool ThrowOnRaiseEvent { get; set; } = false;
        public string? RaisedInstanceId { get; private set; }
        public string? RaisedEventName { get; private set; }
        public object? RaisedPayload { get; private set; }

        public TestDurableTaskClient(string name = "test-hub") : base(name)
        {
        }

        public void ResetRaised()
        {
            RaisedInstanceId = null;
            RaisedEventName = null;
            RaisedPayload = null;
        }

        public override Task<string> ScheduleNewOrchestrationInstanceAsync(
            TaskName orchestratorName,
            object? input = null,
            StartOrchestrationOptions? options = null,
            CancellationToken cancellationToken = default)
        {
            return Task.FromResult(options?.InstanceId ?? Guid.NewGuid().ToString());
        }

        public override Task<OrchestrationMetadata?> GetInstanceAsync(
            string instanceId,
            bool getInputsAndOutputs = false,
            CancellationToken cancellationToken = default)
        {
            if (!InstanceExists)
            {
                return Task.FromResult<OrchestrationMetadata?>(null);
            }

            var metadata = new OrchestrationMetadata("SampleOrchestrator", instanceId);
            return Task.FromResult<OrchestrationMetadata?>(metadata);
        }

        public override Task RaiseEventAsync(
            string instanceId,
            string eventName,
            object? eventPayload,
            CancellationToken cancellationToken = default)
        {
            if (ThrowOnRaiseEvent)
            {
                throw new InvalidOperationException("Simulated DurableTaskClient failure");
            }
            RaisedInstanceId = instanceId;
            RaisedEventName = eventName;
            RaisedPayload = eventPayload;
            return Task.CompletedTask;
        }

        public override Task TerminateInstanceAsync(
            string instanceId,
            TerminateInstanceOptions? options = null,
            CancellationToken cancellationToken = default)
        {
            return Task.CompletedTask;
        }

        public override Task SuspendInstanceAsync(string instanceId, string? reason = null, CancellationToken cancellationToken = default) => Task.CompletedTask;
        public override Task ResumeInstanceAsync(string instanceId, string? reason = null, CancellationToken cancellationToken = default) => Task.CompletedTask;
        public override ValueTask DisposeAsync() => default;
        public override Task<PurgeResult> PurgeInstanceAsync(string instanceId, CancellationToken cancellationToken = default) => Task.FromResult(new PurgeResult(0));
        public override AsyncPageable<OrchestrationMetadata> GetAllInstancesAsync(OrchestrationQuery? filter = null) => throw new NotImplementedException();
        public override Task<OrchestrationMetadata?> GetInstancesAsync(string instanceId, bool getInputsAndOutputs = false, CancellationToken cancellationToken = default) => GetInstanceAsync(instanceId, getInputsAndOutputs, cancellationToken);
        public override Task<OrchestrationMetadata> WaitForInstanceStartAsync(string instanceId, bool getInputsAndOutputs = false, CancellationToken cancellationToken = default) => throw new NotImplementedException();
        public override Task<OrchestrationMetadata> WaitForInstanceCompletionAsync(string instanceId, bool getInputsAndOutputs = false, CancellationToken cancellationToken = default) => throw new NotImplementedException();
        public override Task<PurgeResult> PurgeAllInstancesAsync(PurgeInstancesFilter filter, CancellationToken cancellationToken = default) => Task.FromResult(new PurgeResult(0));
    }

    private static (PenanciaDbContext Db, BlobEventsFunction Function) CreateFunction()
    {
        var options = new DbContextOptionsBuilder<PenanciaDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        var db = new PenanciaDbContext(options);
        var logger = NullLogger<BlobEventsFunction>.Instance;
        var function = new BlobEventsFunction(db, logger);
        return (db, function);
    }

    private static async Task<MediaAssetEntity> SeedMediaAssetAsync(
        PenanciaDbContext db,
        string sampleId,
        Guid? assetId = null,
        string status = "Issued")
    {
        var id = assetId ?? Guid.NewGuid();
        var asset = new MediaAssetEntity
        {
            AssetId = id,
            SampleId = sampleId,
            Kind = "video",
            Container = "quarantine",
            BlobName = $"{sampleId}/{id}.mp4",
            ContentTypeDeclared = "video/mp4",
            Status = status,
            SizeBytes = 0,
            CreatedAtUtc = DateTime.UtcNow
        };
        db.MediaAssets.Add(asset);
        await db.SaveChangesAsync();
        return asset;
    }

    [Fact]
    public async Task OnBlobCreated_ValidEvent_SetsStatusUploaded_AndSizeBytes()
    {
        var (db, function) = CreateFunction();
        const string sampleId = "s-blob-created";
        var assetId = Guid.NewGuid();
        await SeedMediaAssetAsync(db, sampleId, assetId, status: "Issued");

        var cloudEvent = new
        {
            specversion = "1.0",
            type = "Microsoft.Storage.BlobCreated",
            id = Guid.NewGuid().ToString(),
            time = DateTime.UtcNow.ToString("o"),
            subject = $"/blobServices/default/containers/quarantine/blobs/{sampleId}/{assetId}.mp4",
            data = new
            {
                api = "PutBlockList",
                clientRequestId = "test-req",
                contentLength = 4096000L,
                contentType = "video/mp4",
                url = $"https://stpenancias.blob.core.windows.net/quarantine/{sampleId}/{assetId}.mp4"
            }
        };

        string json = JsonSerializer.Serialize(cloudEvent);
        bool handled = await function.ProcessBlobCreatedAsync(json);

        Assert.True(handled);

        var reloaded = await db.MediaAssets.FindAsync(assetId);
        Assert.NotNull(reloaded);
        Assert.Equal("Uploaded", reloaded!.Status);
        Assert.Equal(4096000L, reloaded.SizeBytes);
    }

    [Fact]
    public async Task OnScanResult_Malicious_RecordsMalicious_AndRejectsAsset()
    {
        var (db, function) = CreateFunction();
        const string sampleId = "s-scan-malicious";
        var assetId = Guid.NewGuid();
        await SeedMediaAssetAsync(db, sampleId, assetId, status: "Uploaded");

        const string eicarSha256 = "131f95c51cc819465fa1797f6ccccd9d432aa141f179d6bf0fdf833dbeeecd99";
        var scanEvent = new
        {
            id = Guid.NewGuid().ToString(),
            eventType = "Microsoft.Security.MalwareScanningResult",
            eventTime = DateTime.UtcNow.ToString("o"),
            data = new
            {
                blobUri = $"https://stpenancias.blob.core.windows.net/quarantine/{sampleId}/{assetId}.mp4",
                correlationId = Guid.NewGuid().ToString(),
                scanFinishedTimeUtc = DateTime.UtcNow.ToString("o"),
                scanResultType = "Malicious",
                scanResultDetails = new
                {
                    malwareNamesFound = new[] { "EICAR_Test_File" },
                    sha256 = eicarSha256
                }
            }
        };

        string json = JsonSerializer.Serialize(scanEvent);
        var client = new TestDurableTaskClient();

        bool handled = await function.ProcessScanResultAsync(json, client);

        Assert.True(handled);

        var reloaded = await db.MediaAssets.FindAsync(assetId);
        Assert.NotNull(reloaded);
        Assert.Equal("Rejected", reloaded!.Status);
        Assert.Equal("Malicious", reloaded.ScanVerdict);
        Assert.Equal(eicarSha256, reloaded.Sha256);
        Assert.NotNull(reloaded.ScannedAtUtc);
        Assert.NotNull(reloaded.MalwareNamesFound);
        Assert.Contains("EICAR_Test_File", reloaded.MalwareNamesFound);
        Assert.Contains("Malware detected", reloaded.RejectReason);

        // Orchestrator event raised
        Assert.Equal(sampleId, client.RaisedInstanceId);
        Assert.Equal(WorkflowEvents.ScanCompleted(assetId), client.RaisedEventName);
        var payload = Assert.IsType<ScanCompletedEvent>(client.RaisedPayload);
        Assert.Equal(assetId, payload.AssetId);
        Assert.Equal("Malicious", payload.Verdict);
    }

    [Fact]
    public async Task OnScanResult_NoThreatsFound_RecordsClean_AndClearsAsset()
    {
        var (db, function) = CreateFunction();
        const string sampleId = "s-scan-clean";
        var assetId = Guid.NewGuid();
        await SeedMediaAssetAsync(db, sampleId, assetId, status: "Uploaded");

        const string cleanSha256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
        var scanEvent = new
        {
            id = Guid.NewGuid().ToString(),
            eventType = "Microsoft.Security.MalwareScanningResult",
            eventTime = DateTime.UtcNow.ToString("o"),
            data = new
            {
                blobUri = $"https://stpenancias.blob.core.windows.net/quarantine/{sampleId}/{assetId}.mp4",
                correlationId = Guid.NewGuid().ToString(),
                scanFinishedTimeUtc = DateTime.UtcNow.ToString("o"),
                scanResultType = "No threats found",
                scanResultDetails = new
                {
                    malwareNamesFound = Array.Empty<string>(),
                    sha256 = cleanSha256
                }
            }
        };

        string json = JsonSerializer.Serialize(scanEvent);
        var client = new TestDurableTaskClient();

        bool handled = await function.ProcessScanResultAsync(json, client);

        Assert.True(handled);

        var reloaded = await db.MediaAssets.FindAsync(assetId);
        Assert.NotNull(reloaded);
        Assert.Equal("Cleared", reloaded!.Status);
        Assert.Equal("Clean", reloaded.ScanVerdict);
        Assert.Equal(cleanSha256, reloaded.Sha256);
        Assert.NotNull(reloaded.ScannedAtUtc);

        // Orchestrator event raised
        Assert.Equal(sampleId, client.RaisedInstanceId);
        Assert.Equal(WorkflowEvents.ScanCompleted(assetId), client.RaisedEventName);
        var payload = Assert.IsType<ScanCompletedEvent>(client.RaisedPayload);
        Assert.Equal(assetId, payload.AssetId);
        Assert.Equal("Clean", payload.Verdict);
    }

    [Theory]
    [InlineData("Not Scanned", "NotScanned")]
    [InlineData("not scanned", "NotScanned")]
    [InlineData("UnknownVerdict", "Error")]
    [InlineData("", "Error")]
    public async Task OnScanResult_NonCleanVerdicts_NeverClears_AndMarksRejected(string rawType, string expectedVerdict)
    {
        var (db, function) = CreateFunction();
        const string sampleId = "s-scan-fail-closed";
        var assetId = Guid.NewGuid();
        await SeedMediaAssetAsync(db, sampleId, assetId, status: "Uploaded");

        var scanEvent = new
        {
            id = Guid.NewGuid().ToString(),
            eventType = "Microsoft.Security.MalwareScanningResult",
            eventTime = DateTime.UtcNow.ToString("o"),
            data = new
            {
                blobUri = $"https://stpenancias.blob.core.windows.net/quarantine/{sampleId}/{assetId}.mp4",
                scanResultType = rawType
            }
        };

        string json = JsonSerializer.Serialize(scanEvent);
        bool handled = await function.ProcessScanResultAsync(json);

        Assert.True(handled);

        var reloaded = await db.MediaAssets.FindAsync(assetId);
        Assert.NotNull(reloaded);
        Assert.Equal("Rejected", reloaded!.Status);
        Assert.Equal(expectedVerdict, reloaded.ScanVerdict);
        Assert.NotNull(reloaded.ScannedAtUtc);
        Assert.Equal($"Malware scanning failed: {expectedVerdict}", reloaded.RejectReason);
    }

    [Fact]
    public async Task OnScanResult_WrongEventType_DropsEvent()
    {
        var (db, function) = CreateFunction();
        const string sampleId = "s-wrong-type";
        var assetId = Guid.NewGuid();
        await SeedMediaAssetAsync(db, sampleId, assetId, status: "Uploaded");

        var scanEvent = new
        {
            id = Guid.NewGuid().ToString(),
            eventType = "Microsoft.Storage.BlobCreated", // WRONG
            data = new
            {
                blobUri = $"https://stpenancias.blob.core.windows.net/quarantine/{sampleId}/{assetId}.mp4",
                scanResultType = "No threats found"
            }
        };

        string json = JsonSerializer.Serialize(scanEvent);
        bool handled = await function.ProcessScanResultAsync(json);

        Assert.False(handled);

        // Status must NOT be Cleared
        var reloaded = await db.MediaAssets.FindAsync(assetId);
        Assert.NotNull(reloaded);
        Assert.Equal("Uploaded", reloaded!.Status);
        Assert.Null(reloaded.ScanVerdict);
    }

    [Fact]
    public async Task OnScanResult_GarbageJson_ThrowsJsonException_ForPoisonQueue()
    {
        var (_, function) = CreateFunction();
        await Assert.ThrowsAnyAsync<JsonException>(() => function.ProcessScanResultAsync("{ not-valid-json "));
    }

    [Fact]
    public async Task DuplicateMessage_Idempotent_DoesNotCorruptState()
    {
        var (db, function) = CreateFunction();
        const string sampleId = "s-duplicate";
        var assetId = Guid.NewGuid();
        await SeedMediaAssetAsync(db, sampleId, assetId, status: "Issued");

        var cloudEvent = new
        {
            specversion = "1.0",
            type = "Microsoft.Storage.BlobCreated",
            subject = $"/blobServices/default/containers/quarantine/blobs/{sampleId}/{assetId}.mp4",
            data = new
            {
                contentLength = 1000L,
                url = $"https://stpenancias.blob.core.windows.net/quarantine/{sampleId}/{assetId}.mp4"
            }
        };
        string blobJson = JsonSerializer.Serialize(cloudEvent);

        // Run OnBlobCreated twice
        Assert.True(await function.ProcessBlobCreatedAsync(blobJson));
        Assert.True(await function.ProcessBlobCreatedAsync(blobJson));

        var asset = await db.MediaAssets.FindAsync(assetId);
        Assert.NotNull(asset);
        Assert.Equal("Uploaded", asset!.Status);

        var scanEvent = new
        {
            eventType = "Microsoft.Security.MalwareScanningResult",
            data = new
            {
                blobUri = $"https://stpenancias.blob.core.windows.net/quarantine/{sampleId}/{assetId}.mp4",
                scanResultType = "No threats found",
                scanResultDetails = new { sha256 = "dummy-sha" }
            }
        };
        string scanJson = JsonSerializer.Serialize(scanEvent);

        // Run OnScanResult twice
        Assert.True(await function.ProcessScanResultAsync(scanJson));
        Assert.True(await function.ProcessScanResultAsync(scanJson));

        var reloaded = await db.MediaAssets.FindAsync(assetId);
        Assert.NotNull(reloaded);
        Assert.Equal("Cleared", reloaded!.Status);
        Assert.Equal("Clean", reloaded.ScanVerdict);
    }

    [Fact]
    public async Task OutOfOrder_ScanResultBeforeBlobCreated_EndsInCorrectState()
    {
        var (db, function) = CreateFunction();
        const string sampleId = "s-out-of-order";
        var assetId = Guid.NewGuid();
        // Asset starts in Issued
        await SeedMediaAssetAsync(db, sampleId, assetId, status: "Issued");

        var scanEvent = new
        {
            eventType = "Microsoft.Security.MalwareScanningResult",
            data = new
            {
                blobUri = $"https://stpenancias.blob.core.windows.net/quarantine/{sampleId}/{assetId}.mp4",
                scanResultType = "No threats found",
                scanResultDetails = new { sha256 = "ordered-sha" }
            }
        };
        string scanJson = JsonSerializer.Serialize(scanEvent);

        // 1. Scan result arrives first
        Assert.True(await function.ProcessScanResultAsync(scanJson));

        var afterScan = await db.MediaAssets.FindAsync(assetId);
        Assert.NotNull(afterScan);
        Assert.Equal("Cleared", afterScan!.Status);
        Assert.Equal("Clean", afterScan.ScanVerdict);

        // 2. BlobCreated arrives later
        var cloudEvent = new
        {
            specversion = "1.0",
            type = "Microsoft.Storage.BlobCreated",
            subject = $"/blobServices/default/containers/quarantine/blobs/{sampleId}/{assetId}.mp4",
            data = new
            {
                contentLength = 2000L,
                url = $"https://stpenancias.blob.core.windows.net/quarantine/{sampleId}/{assetId}.mp4"
            }
        };
        string blobJson = JsonSerializer.Serialize(cloudEvent);
        Assert.True(await function.ProcessBlobCreatedAsync(blobJson));

        // Must still be Cleared! (not overwritten back to Uploaded)
        var finalAsset = await db.MediaAssets.FindAsync(assetId);
        Assert.NotNull(finalAsset);
        Assert.Equal("Cleared", finalAsset!.Status);
        Assert.Equal("Clean", finalAsset.ScanVerdict);
    }

    [Fact]
    public async Task UnknownAsset_LogsAndDrops_DoesNotThrow()
    {
        var (db, function) = CreateFunction();
        var unknownId = Guid.NewGuid();

        var cloudEvent = new
        {
            specversion = "1.0",
            type = "Microsoft.Storage.BlobCreated",
            subject = $"/blobServices/default/containers/quarantine/blobs/s-unknown/{unknownId}.mp4",
            data = new { url = $"https://stpenancias.blob.core.windows.net/quarantine/s-unknown/{unknownId}.mp4" }
        };
        bool blobResult = await function.ProcessBlobCreatedAsync(JsonSerializer.Serialize(cloudEvent));
        Assert.False(blobResult);

        var scanEvent = new
        {
            eventType = "Microsoft.Security.MalwareScanningResult",
            data = new
            {
                blobUri = $"https://stpenancias.blob.core.windows.net/quarantine/s-unknown/{unknownId}.mp4",
                scanResultType = "No threats found"
            }
        };
        bool scanResult = await function.ProcessScanResultAsync(JsonSerializer.Serialize(scanEvent));
        Assert.False(scanResult);
    }

    [Fact]
    public async Task OnScanResult_NoOrchestratorInstance_VerdictStored_DoesNotThrow()
    {
        var (db, function) = CreateFunction();
        const string sampleId = "s-no-orchestrator";
        var assetId = Guid.NewGuid();
        await SeedMediaAssetAsync(db, sampleId, assetId, status: "Uploaded");

        var scanEvent = new
        {
            eventType = "Microsoft.Security.MalwareScanningResult",
            data = new
            {
                blobUri = $"https://stpenancias.blob.core.windows.net/quarantine/{sampleId}/{assetId}.mp4",
                scanResultType = "No threats found",
                scanResultDetails = new { sha256 = "no-orch-sha" }
            }
        };
        string json = JsonSerializer.Serialize(scanEvent);

        var client = new TestDurableTaskClient { InstanceExists = false };

        bool handled = await function.ProcessScanResultAsync(json, client);
        Assert.True(handled);

        var reloaded = await db.MediaAssets.FindAsync(assetId);
        Assert.NotNull(reloaded);
        Assert.Equal("Cleared", reloaded!.Status);
        Assert.Equal("Clean", reloaded.ScanVerdict);
        Assert.Null(client.RaisedInstanceId); // No event raised
    }

    [Fact]
    public async Task OnScanResult_CleanAfterRejected_DoesNotClear_StickyTerminal_F2()
    {
        var (db, function) = CreateFunction();
        const string sampleId = "s-sticky-rejected";
        var assetId = Guid.NewGuid();
        await SeedMediaAssetAsync(db, sampleId, assetId, status: "Rejected");

        var cleanEvent = new
        {
            eventType = "Microsoft.Security.MalwareScanningResult",
            data = new
            {
                blobUri = $"https://stpenancias.blob.core.windows.net/quarantine/{sampleId}/{assetId}.mp4",
                scanResultType = "No threats found"
            }
        };

        var client = new TestDurableTaskClient();
        bool handled = await function.ProcessScanResultAsync(JsonSerializer.Serialize(cleanEvent), client);

        Assert.True(handled);
        var reloaded = await db.MediaAssets.FindAsync(assetId);
        Assert.Equal("Rejected", reloaded!.Status);
        Assert.Null(reloaded.ScanVerdict);
        Assert.Null(client.RaisedInstanceId);
    }

    [Fact]
    public async Task OnScanResult_MaliciousThenClean_StaysRejected_F2()
    {
        var (db, function) = CreateFunction();
        const string sampleId = "s-malicious-then-clean";
        var assetId = Guid.NewGuid();
        await SeedMediaAssetAsync(db, sampleId, assetId, status: "Uploaded");

        var maliciousEvent = new
        {
            eventType = "Microsoft.Security.MalwareScanningResult",
            data = new
            {
                blobUri = $"https://stpenancias.blob.core.windows.net/quarantine/{sampleId}/{assetId}.mp4",
                scanResultType = "Malicious",
                scanResultDetails = new { malwareNamesFound = new[] { "EICAR_Test_File" }, sha256 = "abc" }
            }
        };
        var cleanEvent = new
        {
            eventType = "Microsoft.Security.MalwareScanningResult",
            data = new
            {
                blobUri = $"https://stpenancias.blob.core.windows.net/quarantine/{sampleId}/{assetId}.mp4",
                scanResultType = "No threats found"
            }
        };

        var client = new TestDurableTaskClient();
        Assert.True(await function.ProcessScanResultAsync(JsonSerializer.Serialize(maliciousEvent), client));
        client.ResetRaised();

        // Late or duplicate Clean event arrives
        Assert.True(await function.ProcessScanResultAsync(JsonSerializer.Serialize(cleanEvent), client));

        var reloaded = await db.MediaAssets.FindAsync(assetId);
        Assert.Equal("Rejected", reloaded!.Status);
        Assert.Equal("Malicious", reloaded.ScanVerdict);
        Assert.Null(client.RaisedInstanceId); // Must not raise ScanCompleted again
    }

    [Fact]
    public async Task OnScanResult_CleanThenMalicious_FlipsToRejected_F2()
    {
        var (db, function) = CreateFunction();
        const string sampleId = "s-clean-then-malicious";
        var assetId = Guid.NewGuid();
        await SeedMediaAssetAsync(db, sampleId, assetId, status: "Cleared");

        var maliciousEvent = new
        {
            eventType = "Microsoft.Security.MalwareScanningResult",
            data = new
            {
                blobUri = $"https://stpenancias.blob.core.windows.net/quarantine/{sampleId}/{assetId}.mp4",
                scanResultType = "Malicious"
            }
        };

        Assert.True(await function.ProcessScanResultAsync(JsonSerializer.Serialize(maliciousEvent)));

        var reloaded = await db.MediaAssets.FindAsync(assetId);
        Assert.Equal("Rejected", reloaded!.Status);
        Assert.Equal("Malicious", reloaded.ScanVerdict);
    }

    [Fact]
    public async Task OnScanResult_RaiseEventThrows_StillPersistsVerdict_AndDoesNotThrow_F4()
    {
        var (db, function) = CreateFunction();
        const string sampleId = "s-raise-throws";
        var assetId = Guid.NewGuid();
        await SeedMediaAssetAsync(db, sampleId, assetId, status: "Uploaded");

        var cleanEvent = new
        {
            eventType = "Microsoft.Security.MalwareScanningResult",
            data = new
            {
                blobUri = $"https://stpenancias.blob.core.windows.net/quarantine/{sampleId}/{assetId}.mp4",
                scanResultType = "No threats found"
            }
        };

        var client = new TestDurableTaskClient { ThrowOnRaiseEvent = true };
        bool handled = await function.ProcessScanResultAsync(JsonSerializer.Serialize(cleanEvent), client);

        Assert.True(handled);
        var reloaded = await db.MediaAssets.FindAsync(assetId);
        Assert.Equal("Cleared", reloaded!.Status);
        Assert.Equal("Clean", reloaded.ScanVerdict);
        Assert.NotNull(reloaded.ScannedAtUtc);
    }

    [Fact]
    public async Task OnBlobCreated_ExistingSizeBytesGreaterThanZero_DoesNotOverwrite_F4()
    {
        var (db, function) = CreateFunction();
        const string sampleId = "s-no-overwrite-size";
        var assetId = Guid.NewGuid();
        var asset = new MediaAssetEntity
        {
            AssetId = assetId,
            SampleId = sampleId,
            Kind = "video",
            Container = "quarantine",
            BlobName = $"{sampleId}/{assetId}.mp4",
            ContentTypeDeclared = "video/mp4",
            Status = "Issued",
            SizeBytes = 12345,
            CreatedAtUtc = DateTime.UtcNow
        };
        db.MediaAssets.Add(asset);
        await db.SaveChangesAsync();

        var cloudEvent = new
        {
            specversion = "1.0",
            type = "Microsoft.Storage.BlobCreated",
            data = new
            {
                url = $"https://stpenancias.blob.core.windows.net/quarantine/{sampleId}/{assetId}.mp4",
                contentLength = 99999L
            }
        };

        Assert.True(await function.ProcessBlobCreatedAsync(JsonSerializer.Serialize(cloudEvent)));
        var reloaded = await db.MediaAssets.FindAsync(assetId);
        Assert.Equal("Uploaded", reloaded!.Status);
        Assert.Equal(12345L, reloaded.SizeBytes);
    }

    [Fact]
    public async Task OnBlobCreated_NonQuarantineContainer_IgnoredAndRowUntouched_F4()
    {
        var (db, function) = CreateFunction();
        const string sampleId = "s-non-quarantine-blob";
        var assetId = Guid.NewGuid();
        await SeedMediaAssetAsync(db, sampleId, assetId, status: "Issued");

        var cloudEvent = new
        {
            specversion = "1.0",
            type = "Microsoft.Storage.BlobCreated",
            data = new
            {
                url = $"https://stpenancias.blob.core.windows.net/raw-videos/{sampleId}/{assetId}.mp4",
                contentLength = 5000L
            }
        };

        Assert.False(await function.ProcessBlobCreatedAsync(JsonSerializer.Serialize(cloudEvent)));
        var reloaded = await db.MediaAssets.FindAsync(assetId);
        Assert.Equal("Issued", reloaded!.Status);
        Assert.Equal(0L, reloaded.SizeBytes);
    }

    [Fact]
    public async Task OnBlobCreated_SubjectOnlyFallback_NoDataUrl_MarksUploaded_F4()
    {
        var (db, function) = CreateFunction();
        const string sampleId = "s-subject-fallback";
        var assetId = Guid.NewGuid();
        await SeedMediaAssetAsync(db, sampleId, assetId, status: "Issued");

        var cloudEvent = new
        {
            specversion = "1.0",
            type = "Microsoft.Storage.BlobCreated",
            subject = $"/blobServices/default/containers/quarantine/blobs/{sampleId}/{assetId}.mp4",
            data = new { contentLength = 2048L }
        };

        Assert.True(await function.ProcessBlobCreatedAsync(JsonSerializer.Serialize(cloudEvent)));
        var reloaded = await db.MediaAssets.FindAsync(assetId);
        Assert.Equal("Uploaded", reloaded!.Status);
        Assert.Equal(2048L, reloaded.SizeBytes);
    }

    [Fact]
    public async Task BothFunctions_ArrayWrappedEvents_ProcessedCorrectly_F4()
    {
        var (db, function) = CreateFunction();
        const string sampleId = "s-array-events";
        var assetId = Guid.NewGuid();
        await SeedMediaAssetAsync(db, sampleId, assetId, status: "Issued");

        var blobArray = new[]
        {
            new
            {
                specversion = "1.0",
                type = "Microsoft.Storage.BlobCreated",
                data = new
                {
                    url = $"https://stpenancias.blob.core.windows.net/quarantine/{sampleId}/{assetId}.mp4",
                    contentLength = 4096L
                }
            }
        };

        Assert.True(await function.ProcessBlobCreatedAsync(JsonSerializer.Serialize(blobArray)));
        Assert.Equal("Uploaded", (await db.MediaAssets.FindAsync(assetId))!.Status);

        var scanArray = new[]
        {
            new
            {
                eventType = "Microsoft.Security.MalwareScanningResult",
                data = new
                {
                    blobUri = $"https://stpenancias.blob.core.windows.net/quarantine/{sampleId}/{assetId}.mp4",
                    scanResultType = "No threats found"
                }
            }
        };

        Assert.True(await function.ProcessScanResultAsync(JsonSerializer.Serialize(scanArray)));
        Assert.Equal("Cleared", (await db.MediaAssets.FindAsync(assetId))!.Status);
    }

    [Fact]
    public async Task BothFunctions_PathFewerThan3Segments_ReturnsFalse_F4()
    {
        var (_, function) = CreateFunction();

        var shortBlobEvent = new
        {
            specversion = "1.0",
            type = "Microsoft.Storage.BlobCreated",
            data = new { url = "https://stpenancias.blob.core.windows.net/quarantine/missing-asset.mp4" }
        };
        Assert.False(await function.ProcessBlobCreatedAsync(JsonSerializer.Serialize(shortBlobEvent)));

        var shortScanEvent = new
        {
            eventType = "Microsoft.Security.MalwareScanningResult",
            data = new
            {
                blobUri = "https://stpenancias.blob.core.windows.net/quarantine/missing-asset.mp4",
                scanResultType = "No threats found"
            }
        };
        Assert.False(await function.ProcessScanResultAsync(JsonSerializer.Serialize(shortScanEvent)));
    }

    [Fact]
    public async Task OnScanResult_UrlSampleIdMismatch_DropsEvent_F5()
    {
        var (db, function) = CreateFunction();
        var assetId = Guid.NewGuid();
        await SeedMediaAssetAsync(db, "sample-real", assetId, status: "Uploaded");

        var scanEvent = new
        {
            eventType = "Microsoft.Security.MalwareScanningResult",
            data = new
            {
                blobUri = $"https://stpenancias.blob.core.windows.net/quarantine/sample-spoofed/{assetId}.mp4",
                scanResultType = "No threats found"
            }
        };

        Assert.False(await function.ProcessScanResultAsync(JsonSerializer.Serialize(scanEvent)));
        var reloaded = await db.MediaAssets.FindAsync(assetId);
        Assert.Equal("Uploaded", reloaded!.Status);
        Assert.Null(reloaded.ScanVerdict);
    }

    [Fact]
    public async Task OnScanResult_NonQuarantineContainer_DropsEvent_F5()
    {
        var (db, function) = CreateFunction();
        const string sampleId = "s-scan-non-quarantine";
        var assetId = Guid.NewGuid();
        await SeedMediaAssetAsync(db, sampleId, assetId, status: "Uploaded");

        var scanEvent = new
        {
            eventType = "Microsoft.Security.MalwareScanningResult",
            data = new
            {
                blobUri = $"https://stpenancias.blob.core.windows.net/derived/{sampleId}/{assetId}.mp4",
                scanResultType = "No threats found"
            }
        };

        Assert.False(await function.ProcessScanResultAsync(JsonSerializer.Serialize(scanEvent)));
        var reloaded = await db.MediaAssets.FindAsync(assetId);
        Assert.Equal("Uploaded", reloaded!.Status);
        Assert.Null(reloaded.ScanVerdict);
    }

    [Fact]
    public void QueueTriggers_UseMediaQueuesConnection_AndExpectedQueueNames_F3()
    {
        var blobCreatedMethod = typeof(BlobEventsFunction).GetMethod(nameof(BlobEventsFunction.RunBlobCreated));
        Assert.NotNull(blobCreatedMethod);
        var blobTrigger = blobCreatedMethod!.GetParameters()[0]
            .GetCustomAttributes(typeof(Microsoft.Azure.Functions.Worker.QueueTriggerAttribute), false)
            .Cast<Microsoft.Azure.Functions.Worker.QueueTriggerAttribute>()
            .Single();
        Assert.Equal("blob-created-events", blobTrigger.QueueName);
        Assert.Equal("MediaQueues", blobTrigger.Connection);

        var scanResultMethod = typeof(BlobEventsFunction).GetMethod(nameof(BlobEventsFunction.RunScanResult));
        Assert.NotNull(scanResultMethod);
        var scanTrigger = scanResultMethod!.GetParameters()[0]
            .GetCustomAttributes(typeof(Microsoft.Azure.Functions.Worker.QueueTriggerAttribute), false)
            .Cast<Microsoft.Azure.Functions.Worker.QueueTriggerAttribute>()
            .Single();
        Assert.Equal("scan-result-events", scanTrigger.QueueName);
        Assert.Equal("MediaQueues", scanTrigger.Connection);
    }
}
