using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Penancia.S.Data;
using Penancia.S.Data.Entities;
using Penancia.S.Domain.Model;

namespace Penancia.S.Api.Services;

public class CalibrationResultDto
{
    public string Status { get; set; } = string.Empty;
    public string? RejectReason { get; set; }
    public double? MeasuredPitchPx { get; set; }
    public double? MicronsPerPixel { get; set; }
    public int? LinesDetected { get; set; }
    public double? SpacingCvPct { get; set; }
    public int? ImageWidthPx { get; set; }
    public int? ImageHeightPx { get; set; }
    public string? ToolVersion { get; set; }
}

public class CalibrationApplyResult
{
    public bool Success { get; set; }
    public string Status { get; set; } = string.Empty;
    public string? ErrorMessage { get; set; }

    public static CalibrationApplyResult Ok(string status) => new() { Success = true, Status = status };
    public static CalibrationApplyResult Fail(string error) => new() { Success = false, ErrorMessage = error };
}

public interface ICalibrationResultService
{
    Task<CalibrationApplyResult> ApplyAsync(Guid calibrationId, CalibrationResultDto result, CancellationToken cancellationToken = default);
}

public class CalibrationResultService : ICalibrationResultService
{
    private readonly PenanciaDbContext _db;
    private readonly IConfiguration _configuration;
    private readonly ILogger<CalibrationResultService> _logger;

    public CalibrationResultService(
        PenanciaDbContext db,
        IConfiguration configuration,
        ILogger<CalibrationResultService> logger)
    {
        _db = db;
        _configuration = configuration;
        _logger = logger;
    }

    public async Task<CalibrationApplyResult> ApplyAsync(Guid calibrationId, CalibrationResultDto result, CancellationToken cancellationToken = default)
    {
        if (result == null)
            return CalibrationApplyResult.Fail("Result body is required.");

        var cal = await _db.Calibrations.FirstOrDefaultAsync(c => c.CalibrationId == calibrationId, cancellationToken);
        if (cal == null)
            return CalibrationApplyResult.Fail($"Calibration {calibrationId} not found.");

        // Idempotency: terminal states
        if (string.Equals(cal.Status, "Valid", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(cal.Status, "Rejected", StringComparison.OrdinalIgnoreCase))
        {
            if (string.Equals(cal.Status, result.Status, StringComparison.OrdinalIgnoreCase))
            {
                _logger.LogInformation("Idempotent replay for calibration {CalibrationId} with status {Status}", calibrationId, cal.Status);
                return CalibrationApplyResult.Ok(cal.Status);
            }

            return CalibrationApplyResult.Fail($"Calibration {calibrationId} is already terminal ({cal.Status}) and cannot be changed to {result.Status}.");
        }

        if (!string.Equals(cal.Status, "Pending", StringComparison.OrdinalIgnoreCase))
        {
            return CalibrationApplyResult.Fail($"Calibration {calibrationId} has invalid status '{cal.Status}'; must be 'Pending'.");
        }

        if (string.Equals(result.Status, "Valid", StringComparison.OrdinalIgnoreCase))
        {
            // Server-side re-checks per F2(b) before marking Valid
            string? rejectReason = null;

            if (!result.MeasuredPitchPx.HasValue || result.MeasuredPitchPx.Value <= 0 ||
                !result.MicronsPerPixel.HasValue || result.MicronsPerPixel.Value <= 0)
            {
                rejectReason = "INVALID_MEASUREMENT";
            }
            else if (cal.ReferencePitchUm <= 0)
            {
                rejectReason = "INVALID_REFERENCE_PITCH";
            }
            else if (!result.LinesDetected.HasValue || result.LinesDetected.Value < ProvisionalCalibrationConstants.MinLinesDetected)
            {
                rejectReason = "INSUFFICIENT_LINES_DETECTED";
            }
            else if (!result.SpacingCvPct.HasValue || result.SpacingCvPct.Value > ProvisionalCalibrationConstants.MaxSpacingCvPct)
            {
                rejectReason = "SPACING_VARIATION_EXCEEDED";
            }
            else if (string.IsNullOrWhiteSpace(result.ToolVersion))
            {
                rejectReason = "MISSING_TOOL_VERSION";
            }
            else
            {
                // Relative tolerance check: |µm/px − (ReferencePitchUm / MeasuredPitchPx)| / expected <= RelativeScaleTolerance (0.1%)
                double expectedUmPerPx = cal.ReferencePitchUm / result.MeasuredPitchPx.Value;
                double relativeError = Math.Abs(result.MicronsPerPixel.Value - expectedUmPerPx) / expectedUmPerPx;
                if (relativeError > ProvisionalCalibrationConstants.RelativeScaleTolerance)
                {
                    rejectReason = "SCALE_FACTOR_MISMATCH";
                }
            }

            if (rejectReason != null)
            {
                _logger.LogWarning("Calibration {CalibrationId} failed server validation and was marked Rejected: {Reason}", calibrationId, rejectReason);
                cal.Status = "Rejected";
                cal.RejectReason = rejectReason;
                cal.MeasuredPitchPx = result.MeasuredPitchPx;
                cal.MicronsPerPixel = result.MicronsPerPixel;
                cal.LinesDetected = result.LinesDetected;
                cal.SpacingCvPct = result.SpacingCvPct;
                cal.ImageWidthPx = result.ImageWidthPx;
                cal.ImageHeightPx = result.ImageHeightPx;
                cal.ToolVersion = result.ToolVersion;
                cal.ExpiresAtUtc = null;

                await _db.SaveChangesAsync(cancellationToken);
                return CalibrationApplyResult.Ok("Rejected");
            }

            int validityDays = _configuration.GetValue<int?>("Calibration:ValidityDays") ?? ProvisionalCalibrationConstants.DefaultValidityDays;

            cal.Status = "Valid";
            cal.MeasuredPitchPx = result.MeasuredPitchPx;
            cal.MicronsPerPixel = result.MicronsPerPixel;
            cal.LinesDetected = result.LinesDetected;
            cal.SpacingCvPct = result.SpacingCvPct;
            cal.ImageWidthPx = result.ImageWidthPx;
            cal.ImageHeightPx = result.ImageHeightPx;
            cal.ToolVersion = result.ToolVersion;
            cal.RejectReason = null;
            cal.ExpiresAtUtc = DateTime.UtcNow.AddDays(validityDays);

            // If the sample currently links to this calibration, update sample's MicronsPerPixel
            var sample = await _db.Samples.FirstOrDefaultAsync(s => s.SampleId == cal.SampleId && !s.IsDeleted, cancellationToken);
            if (sample != null && sample.CalibrationId == cal.CalibrationId)
            {
                sample.MicronsPerPixel = result.MicronsPerPixel;
            }
        }
        else if (string.Equals(result.Status, "Rejected", StringComparison.OrdinalIgnoreCase))
        {
            cal.Status = "Rejected";
            cal.RejectReason = string.IsNullOrWhiteSpace(result.RejectReason) ? "CALIBRATION_REJECTED" : result.RejectReason;
            cal.MeasuredPitchPx = result.MeasuredPitchPx;
            cal.MicronsPerPixel = result.MicronsPerPixel;
            cal.LinesDetected = result.LinesDetected;
            cal.SpacingCvPct = result.SpacingCvPct;
            cal.ImageWidthPx = result.ImageWidthPx;
            cal.ImageHeightPx = result.ImageHeightPx;
            cal.ToolVersion = result.ToolVersion;
            cal.ExpiresAtUtc = null;
        }
        else
        {
            return CalibrationApplyResult.Fail($"Invalid status '{result.Status}'. Expected 'Valid' or 'Rejected'.");
        }

        await _db.SaveChangesAsync(cancellationToken);
        _logger.LogInformation("Applied calibration result {CalibrationId} -> {Status}", calibrationId, cal.Status);
        return CalibrationApplyResult.Ok(cal.Status);
    }
}
