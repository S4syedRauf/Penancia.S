using System;

namespace Penancia.S.Domain.Workflow;

/// <summary>
/// Constants and event payloads for external events awaited or raised by the durable orchestrator.
/// </summary>
public static class WorkflowEvents
{
    public static string ScanCompleted(Guid assetId) => $"scan_completed:{assetId}";
    public static string ScanCompleted(string assetId) => $"scan_completed:{assetId}";
    public static string ModelDone(string service, string jobId) => $"model_done:{service}:{jobId}";
    public const string ManualEntryCompleted = "manual_entry_completed";
    public const string SampleSignedOff = "sample_signed_off";
}

public sealed record ScanCompletedEvent(Guid AssetId, string Verdict);
