using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Azure.Functions.Worker;
using Microsoft.DurableTask.Client;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Penancia.S.Data;
using Penancia.S.Domain.Workflow;

namespace Penancia.S.Workflow.Functions;

/// <summary>
/// Event receivers for storage queue events (Event Grid -> Storage Queues).
/// Processes BlobCreated system events and Defender MalwareScanningResult events.
/// (Phase 2 Step 2.4)
/// </summary>
public class BlobEventsFunction
{
    private readonly PenanciaDbContext _db;
    private readonly ILogger<BlobEventsFunction> _logger;

    public BlobEventsFunction(PenanciaDbContext db, ILogger<BlobEventsFunction> logger)
    {
        _db = db;
        _logger = logger;
    }

    [Function("OnBlobCreated")]
    public async Task RunBlobCreated(
        [QueueTrigger("blob-created-events", Connection = "MediaQueues")] string messageText,
        CancellationToken cancellationToken)
    {
        await ProcessBlobCreatedAsync(messageText, cancellationToken);
    }

    [Function("OnScanResult")]
    public async Task RunScanResult(
        [QueueTrigger("scan-result-events", Connection = "MediaQueues")] string messageText,
        [DurableClient] DurableTaskClient client,
        CancellationToken cancellationToken)
    {
        await ProcessScanResultAsync(messageText, client, cancellationToken);
    }

    /// <summary>
    /// Processes CloudEvents v1.0 BlobCreated notification.
    /// Extracts container and blobName {sampleId}/{assetId}{ext}.
    /// Sets MediaAsset.Status = "Uploaded" and SizeBytes if currently "Issued".
    /// </summary>
    public async Task<bool> ProcessBlobCreatedAsync(string messageText, CancellationToken cancellationToken = default)
    {
        try
        {
            using var doc = JsonDocument.Parse(messageText);
            var root = doc.RootElement.ValueKind == JsonValueKind.Array
                ? doc.RootElement[0]
                : doc.RootElement;

            // Extract subject or data.url
            string? subject = root.TryGetProperty("subject", out var subjProp) ? subjProp.GetString() : null;
            string? url = root.TryGetProperty("data", out var dataProp) && dataProp.TryGetProperty("url", out var urlProp)
                ? urlProp.GetString()
                : null;

            long contentLength = 0;
            if (dataProp.ValueKind == JsonValueKind.Object && dataProp.TryGetProperty("contentLength", out var lenProp))
            {
                lenProp.TryGetInt64(out contentLength);
            }

            string? path = null;
            if (!string.IsNullOrWhiteSpace(url) && Uri.TryCreate(url, UriKind.Absolute, out var uri))
            {
                path = uri.AbsolutePath.TrimStart('/'); // e.g. "quarantine/sample-123/asset-uuid.mp4"
            }
            else if (!string.IsNullOrWhiteSpace(subject))
            {
                // subject format: /blobServices/default/containers/quarantine/blobs/sample-123/asset-uuid.mp4
                const string marker = "/containers/";
                int idx = subject.IndexOf(marker, StringComparison.OrdinalIgnoreCase);
                if (idx >= 0)
                {
                    string sub = subject[(idx + marker.Length)..];
                    int blobsIdx = sub.IndexOf("/blobs/", StringComparison.OrdinalIgnoreCase);
                    if (blobsIdx >= 0)
                    {
                        string container = sub[..blobsIdx];
                        string blob = sub[(blobsIdx + "/blobs/".Length)..];
                        path = $"{container}/{blob}";
                    }
                }
            }

            if (string.IsNullOrWhiteSpace(path))
            {
                _logger.LogWarning("Could not extract blob path from BlobCreated event: {Message}", messageText);
                return false;
            }

            var parts = path.Split('/', 3);
            if (parts.Length < 3)
            {
                _logger.LogWarning("Blob path does not match container/sampleId/asset format: {Path}", path);
                return false;
            }

            string containerName = parts[0];
            string sampleId = parts[1];
            string filename = parts[2];

            if (!string.Equals(containerName, "quarantine", StringComparison.OrdinalIgnoreCase))
            {
                _logger.LogInformation("Ignoring BlobCreated for non-quarantine container '{Container}'", containerName);
                return false;
            }

            string assetIdStr = Path.GetFileNameWithoutExtension(filename);
            if (!Guid.TryParse(assetIdStr, out var assetId))
            {
                _logger.LogWarning("Could not parse AssetId GUID from blob file '{Filename}'", filename);
                return false;
            }

            var asset = await _db.MediaAssets.FirstOrDefaultAsync(m => m.AssetId == assetId, cancellationToken);
            if (asset == null)
            {
                _logger.LogWarning("MediaAsset {AssetId} not found for sample {SampleId}; dropping event", assetId, sampleId);
                return false;
            }

            // Idempotent: only transition if currently Issued
            if (string.Equals(asset.Status, "Issued", StringComparison.OrdinalIgnoreCase))
            {
                asset.Status = "Uploaded";
                if (contentLength > 0 && asset.SizeBytes <= 0)
                {
                    asset.SizeBytes = contentLength;
                }
                await _db.SaveChangesAsync(cancellationToken);
                _logger.LogInformation("Marked MediaAsset {AssetId} as Uploaded from BlobCreated event", assetId);
            }

            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error processing BlobCreated queue message");
            throw; // Send to poison queue after maxDequeueCount
        }
    }

    /// <summary>
    /// Processes Defender for Storage MalwareScanningResult event.
    /// Maps scanResultType fail-closed: only "No threats found" -> "Clean".
    /// Stores verdict, sha256, malwareNamesFound, and raises ScanCompleted if orchestrator instance exists.
    /// </summary>
    public async Task<bool> ProcessScanResultAsync(
        string messageText,
        DurableTaskClient? client = null,
        CancellationToken cancellationToken = default)
    {
        try
        {
            using var doc = JsonDocument.Parse(messageText);
            var root = doc.RootElement.ValueKind == JsonValueKind.Array
                ? doc.RootElement[0]
                : doc.RootElement;

            // Verify eventType == "Microsoft.Security.MalwareScanningResult"
            string? eventType = root.TryGetProperty("eventType", out var etProp) ? etProp.GetString() : null;
            if (!string.Equals(eventType, "Microsoft.Security.MalwareScanningResult", StringComparison.OrdinalIgnoreCase))
            {
                _logger.LogWarning("Invalid or unexpected eventType '{EventType}'; dropping", eventType);
                return false;
            }

            if (!root.TryGetProperty("data", out var dataProp) || dataProp.ValueKind != JsonValueKind.Object)
            {
                _logger.LogWarning("ScanResult event missing 'data' object; dropping");
                return false;
            }

            string? blobUriStr = dataProp.TryGetProperty("blobUri", out var buProp) ? buProp.GetString() : null;
            if (string.IsNullOrWhiteSpace(blobUriStr) || !Uri.TryCreate(blobUriStr, UriKind.Absolute, out var blobUri))
            {
                _logger.LogWarning("ScanResult missing or invalid blobUri '{BlobUri}'; dropping", blobUriStr);
                return false;
            }

            // Extract container, sampleId and assetId from blob URI path e.g. /quarantine/{sampleId}/{assetId}.mp4
            var pathParts = blobUri.AbsolutePath.TrimStart('/').Split('/', 3);
            if (pathParts.Length < 3)
            {
                _logger.LogWarning("ScanResult blobUri path does not match container/sampleId/asset: {Path}", blobUri.AbsolutePath);
                return false;
            }

            string containerName = pathParts[0];
            if (!string.Equals(containerName, "quarantine", StringComparison.OrdinalIgnoreCase))
            {
                _logger.LogInformation("Ignoring ScanResult for non-quarantine container '{Container}'", containerName);
                return false;
            }

            string sampleId = pathParts[1];
            string filename = pathParts[2];
            string assetIdStr = Path.GetFileNameWithoutExtension(filename);
            if (!Guid.TryParse(assetIdStr, out var assetId))
            {
                _logger.LogWarning("Could not parse AssetId GUID from blobUri '{BlobUri}'", blobUriStr);
                return false;
            }

            var asset = await _db.MediaAssets.FirstOrDefaultAsync(m => m.AssetId == assetId, cancellationToken);
            if (asset == null)
            {
                _logger.LogWarning("MediaAsset {AssetId} not found in database; dropping scan result", assetId);
                return false;
            }

            if (!string.Equals(asset.SampleId, sampleId, StringComparison.Ordinal))
            {
                _logger.LogWarning("ScanResult URL sampleId '{UrlSampleId}' differs from MediaAsset.SampleId '{AssetSampleId}' for asset {AssetId}; dropping", sampleId, asset.SampleId, assetId);
                return false;
            }

            // Map scanResultType fail-closed
            string? scanResultType = dataProp.TryGetProperty("scanResultType", out var srtProp) ? srtProp.GetString() : null;
            string verdict;
            if (string.Equals(scanResultType, "No threats found", StringComparison.OrdinalIgnoreCase))
            {
                verdict = "Clean";
            }
            else if (string.Equals(scanResultType, "Malicious", StringComparison.OrdinalIgnoreCase))
            {
                verdict = "Malicious";
            }
            else if (string.Equals(scanResultType, "Not Scanned", StringComparison.OrdinalIgnoreCase))
            {
                verdict = "NotScanned";
            }
            else
            {
                verdict = "Error";
            }

            // F2: Terminal / rejected verdicts are sticky — a later "No threats found" must NOT clear a Rejected/Malicious/NotScanned/Error asset
            bool isStickyRejectedOrMalicious =
                string.Equals(asset.Status, "Rejected", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(asset.ScanVerdict, "Malicious", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(asset.ScanVerdict, "NotScanned", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(asset.ScanVerdict, "Error", StringComparison.OrdinalIgnoreCase);

            if (isStickyRejectedOrMalicious && verdict == "Clean")
            {
                _logger.LogWarning(
                    "Ignoring 'No threats found' scan result for MediaAsset {AssetId} because terminal state is sticky (Status={Status}, ScanVerdict={ScanVerdict})",
                    assetId, asset.Status, asset.ScanVerdict);
                return true;
            }

            // Extract sha256 and malwareNamesFound
            string? sha256 = null;
            string? malwareNamesJson = null;
            if (dataProp.TryGetProperty("scanResultDetails", out var detailsProp) && detailsProp.ValueKind == JsonValueKind.Object)
            {
                if (detailsProp.TryGetProperty("sha256", out var shaProp))
                {
                    sha256 = shaProp.GetString();
                }
                if (detailsProp.TryGetProperty("malwareNamesFound", out var mnProp) && mnProp.ValueKind == JsonValueKind.Array)
                {
                    malwareNamesJson = mnProp.GetRawText();
                }
            }

            // Persist scan results on MediaAsset
            asset.ScanVerdict = verdict;
            asset.ScannedAtUtc = DateTime.UtcNow;
            if (!string.IsNullOrWhiteSpace(sha256))
            {
                asset.Sha256 = sha256;
            }
            if (!string.IsNullOrWhiteSpace(malwareNamesJson))
            {
                asset.MalwareNamesFound = malwareNamesJson;
            }

            // FAIL-CLOSED status transition
            if (verdict == "Clean")
            {
                asset.Status = "Cleared";
            }
            else if (verdict == "Malicious")
            {
                asset.Status = "Rejected";
                asset.RejectReason = "Malware detected" + (!string.IsNullOrWhiteSpace(malwareNamesJson) ? $": {malwareNamesJson}" : "");
            }
            else
            {
                asset.Status = "Rejected";
                asset.RejectReason = $"Malware scanning failed: {verdict}";
            }

            await _db.SaveChangesAsync(cancellationToken);
            _logger.LogInformation("Recorded scan verdict '{Verdict}' for MediaAsset {AssetId} (Status: {Status})", verdict, assetId, asset.Status);

            // Raise external event to durable orchestrator if instance exists (use asset.SampleId as instance id)
            string orchestratorInstanceId = asset.SampleId;
            if (client != null)
            {
                try
                {
                    var metadata = await client.GetInstanceAsync(orchestratorInstanceId, getInputsAndOutputs: false, cancellationToken);
                    if (metadata != null)
                    {
                        var eventPayload = new ScanCompletedEvent(assetId, verdict);
                        await client.RaiseEventAsync(orchestratorInstanceId, WorkflowEvents.ScanCompleted(assetId), eventPayload, cancellationToken);
                        _logger.LogInformation("Raised ScanCompleted event for sample {SampleId}, asset {AssetId}", orchestratorInstanceId, assetId);
                    }
                    else
                    {
                        _logger.LogInformation("No active orchestration instance found for sample {SampleId}; verdict persisted to database row only", orchestratorInstanceId);
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to query or raise event to orchestration instance {SampleId}; verdict is safely persisted", orchestratorInstanceId);
                }
            }

            return true;
        }
        catch (JsonException ex)
        {
            _logger.LogError(ex, "Malformed JSON in ScanResult queue message: {Message}", messageText);
            throw; // Send to poison queue after maxDequeueCount
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error processing ScanResult queue message");
            throw;
        }
    }
}
