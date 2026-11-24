using Penancia.S.Domain.Model;

namespace Penancia.S.Domain.Workflow;

/// <summary>
/// Registry of reason codes for sample submission and readiness checks.
/// Aligned with Appendix A and Step 1.5 of docs/BLUEPRINT.md.
/// </summary>
public static class PrerequisiteReasonCodes
{
    public const string PrerequisitesMissing = "PREREQUISITES_MISSING";
    public const string MissingConsent = "MISSING_CONSENT";
    public const string MissingCalibration = "MISSING_CALIBRATION";
    public const string CalibrationNotValid = "CALIBRATION_NOT_VALID";
    public const string CalibrationExpired = "CALIBRATION_EXPIRED";
    public const string MissingMedia = "MISSING_MEDIA";
    public const string MediaNotUploadedOrVerified = "MEDIA_NOT_UPLOADED_OR_VERIFIED";
    public const string MissingChamber = "MISSING_CHAMBER";
    public const string InvalidWorkflowMode = "INVALID_WORKFLOW_MODE";
}

public sealed record CalibrationReadinessSnapshot(
    string Status,
    DateTime? ExpiresAtUtc,
    double? MicronsPerPixel);

public sealed record MediaAssetReadinessSnapshot(
    Guid AssetId,
    string Status,
    string Kind);

public sealed record SampleReadinessSnapshot(
    string SampleId,
    string WorkflowMode,
    DateTime? ConsentAtUtc,
    string? ChamberTypeId,
    double? ChamberDepthMicrons,
    CalibrationReadinessSnapshot? Calibration);

public sealed record ReadinessResult(
    bool IsReady,
    IReadOnlyList<string> MissingReasons);

/// <summary>
/// Verifies sample readiness strictly against real stored facts (Step 1.5).
/// A sample can become ready only through real stored facts:
/// - Valid, unexpired optical calibration.
/// - Media asset in (Uploaded, Verified).
/// - Patient consent timestamp present.
/// - For clinical workflow: certified chamber specification present.
/// </summary>
public static class SampleReadiness
{
    public static ReadinessResult Check(
        SampleReadinessSnapshot sample,
        IReadOnlyList<MediaAssetReadinessSnapshot> mediaAssets,
        DateTime? nowUtc = null)
    {
        var now = nowUtc ?? DateTime.UtcNow;
        var missing = new List<string>();

        // 1. Consent check
        if (!sample.ConsentAtUtc.HasValue)
        {
            missing.Add(PrerequisiteReasonCodes.MissingConsent);
        }

        // 2. Optical calibration check
        if (sample.Calibration == null)
        {
            missing.Add(PrerequisiteReasonCodes.MissingCalibration);
        }
        else if (!string.Equals(sample.Calibration.Status, "Valid", StringComparison.OrdinalIgnoreCase) ||
                 !sample.Calibration.MicronsPerPixel.HasValue ||
                 sample.Calibration.MicronsPerPixel.Value <= 0)
        {
            missing.Add(PrerequisiteReasonCodes.CalibrationNotValid);
        }
        else if (!sample.Calibration.ExpiresAtUtc.HasValue || sample.Calibration.ExpiresAtUtc.Value <= now)
        {
            missing.Add(PrerequisiteReasonCodes.CalibrationExpired);
        }

        // 3. Media asset check (must be semen video or semen image, not calibration image)
        if (mediaAssets == null || mediaAssets.Count == 0)
        {
            missing.Add(PrerequisiteReasonCodes.MissingMedia);
        }
        else
        {
            bool hasAnyMediaAsset = mediaAssets.Any(a =>
                string.Equals(a.Kind, "video", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(a.Kind, "image", StringComparison.OrdinalIgnoreCase));

            if (!hasAnyMediaAsset)
            {
                missing.Add(PrerequisiteReasonCodes.MissingMedia);
            }
            else
            {
                bool hasReadyAsset = mediaAssets.Any(a =>
                    (string.Equals(a.Kind, "video", StringComparison.OrdinalIgnoreCase) ||
                     string.Equals(a.Kind, "image", StringComparison.OrdinalIgnoreCase)) &&
                    (string.Equals(a.Status, "Uploaded", StringComparison.OrdinalIgnoreCase) ||
                     string.Equals(a.Status, "Verified", StringComparison.OrdinalIgnoreCase)));

                if (!hasReadyAsset)
                {
                    missing.Add(PrerequisiteReasonCodes.MediaNotUploadedOrVerified);
                }
            }
        }

        // 4. Chamber depth specification for clinical mode
        var mode = (sample.WorkflowMode ?? "").Trim().ToLowerInvariant();
        if (mode != "prescreen" && mode != "clinical")
        {
            missing.Add(PrerequisiteReasonCodes.InvalidWorkflowMode);
        }
        else if (mode == "clinical")
        {
            if (string.IsNullOrWhiteSpace(sample.ChamberTypeId) ||
                !sample.ChamberDepthMicrons.HasValue ||
                sample.ChamberDepthMicrons <= 0)
            {
                missing.Add(PrerequisiteReasonCodes.MissingChamber);
            }
        }

        return new ReadinessResult(missing.Count == 0, missing);
    }
}
