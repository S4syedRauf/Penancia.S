using Azure.Messaging.ServiceBus;
using Microsoft.Azure.Functions.Worker;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Penancia.S.Data;
using Penancia.S.Data.Entities;

namespace Penancia.S.Workflow.Activities;

/// <summary>
/// Dispatches a model analysis job by sending a message to the appropriate Service Bus queue.
/// Each AI model (pycasa, banerjee, video-qc, image-analysis, etc.) has its own dedicated queue.
///
/// Ordering guarantee (send-first): the Service Bus message is sent FIRST and the ModelRuns
/// row is recorded as Dispatched ONLY after the send succeeds. Recording Dispatched before
/// the send could claim a dispatch that never happened. Remaining improvement (no outbox
/// yet): a crash between the successful send and the DB record would leave a dispatched job
/// with no ModelRuns row — an outbox pattern would close that window.
///
/// JobId is built from a GUID (not a 1-second-granularity timestamp), so two dispatches in
/// the same second can never collide. The ServiceBusSender is disposed after the send.
///
/// Design rationale:
/// - Queue-based dispatch decouples the orchestrator from model availability.
/// - Dead-lettering (maxDeliveryCount=5) handles transient model crashes without losing jobs.
/// - Message body includes the sample ID and storage URIs the model container needs.
/// </summary>
public class DispatchModelJobActivity
{
    private readonly PenanciaDbContext _db;
    private readonly ServiceBusClient _sbClient;
    private readonly ILogger<DispatchModelJobActivity> _logger;

    public DispatchModelJobActivity(
        PenanciaDbContext db,
        ServiceBusClient sbClient,
        ILogger<DispatchModelJobActivity> logger)
    {
        _db = db;
        _sbClient = sbClient;
        _logger = logger;
    }

    [Function(nameof(DispatchModelJobActivity))]
    public async Task Run(
        [ActivityTrigger] DispatchInput input,
        FunctionContext context)
    {
        _logger.LogInformation(
            "Dispatching model job '{Service}' for sample {SampleId} (media: {MediaType})",
            input.Service, input.SampleId, input.MediaType);

        var sample = await _db.Samples
            .AsNoTracking()
            .FirstOrDefaultAsync(s => s.SampleId == input.SampleId)
            ?? throw new InvalidOperationException($"Sample {input.SampleId} not found.");

        // Determine which media blob URI to use based on media type
        string mediaBlobUri = string.Equals(input.MediaType, "image", StringComparison.OrdinalIgnoreCase)
            ? sample.RawImageBlobUri ?? string.Empty
            : sample.RawVideoBlobUri ?? string.Empty;

        // GUID-based JobId: a 1-second-granularity timestamp could collide when two
        // dispatches for the same sample+service land in the same second.
        var jobId = $"{input.SampleId}_{input.Service}_{Guid.NewGuid():N}";

        string queueName = $"job-{input.Service}";
        var payload = System.Text.Json.JsonSerializer.Serialize(new
        {
            job_id = jobId,
            sample_id = input.SampleId,
            service = input.Service,
            schema_version = "1.0.0",
            media_type = input.MediaType,
            inputs = new Dictionary<string, string?>
            {
                ["media_blob_uri"] = mediaBlobUri
            },
            @params = new Dictionary<string, object?>
            {
                ["microns_per_pixel"] = sample.MicronsPerPixel,
                ["fps"] = sample.FramesPerSecond,
                ["frames_per_second"] = sample.FramesPerSecond,
                ["chamber_depth_microns"] = sample.ChamberDepthMicrons
            },
            // Legacy fields for backward compatibility
            video_uri = sample.RawVideoBlobUri,
            image_uri = sample.RawImageBlobUri,
            microns_per_pixel = sample.MicronsPerPixel,
            frames_per_second = sample.FramesPerSecond,
            chamber_depth = sample.ChamberDepthMicrons
        });

        // SEND FIRST: only record Dispatched after the send succeeds, so a failed send
        // can never leave a phantom "Dispatched" row behind.
        await using var sender = _sbClient.CreateSender(queueName);
        await sender.SendMessageAsync(new ServiceBusMessage(payload)
        {
            MessageId = jobId,
            ContentType = "application/json"
        });

        // Record the job in ModelRuns table for traceability (after the successful send).
        _db.ModelRuns.Add(new ModelRunEntity
        {
            JobId = jobId,
            SampleId = input.SampleId,
            Service = input.Service,
            ModelName = input.Service,
            RepoCommit = "PENDING",    // Set by model container on completion
            WeightsSha256 = "PENDING", // Set by model container on completion
            StartedAtUtc = DateTime.UtcNow,
            Status = "Dispatched"
        });
        await _db.SaveChangesAsync();

        _logger.LogInformation("Job {JobId} dispatched to queue '{Queue}' for {MediaType}.", jobId, queueName, input.MediaType);
    }
}

/// <summary>Input record for DispatchModelJobActivity.</summary>
public record DispatchInput(string SampleId, string Service, string MediaType = "video");
