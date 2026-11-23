using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Penancia.S.Data;
using Penancia.S.Data.Entities;
using Penancia.S.Domain.Model;
using Penancia.S.Domain.Workflow;

namespace Penancia.S.Api.Controllers.V1;

/// <summary>
/// Controller for semen analysis microscope optical micrometer calibration.
/// Computes physical pixel pitch (µm/px) following WHO 2021 laboratory manual standards.
/// </summary>
[ApiController]
[Route("v1/semen")]
[Authorize]
public class CalibrationController : ControllerBase
{
    private readonly ILogger<CalibrationController> _logger;
    private readonly PenanciaDbContext _db;
    private readonly IConfiguration _configuration;
    private readonly Services.ICalibrationResultService? _resultService;

    public CalibrationController(
        ILogger<CalibrationController> logger,
        PenanciaDbContext db,
        IConfiguration configuration,
        Services.ICalibrationResultService? resultService = null)
    {
        _logger = logger;
        _db = db;
        _configuration = configuration;
        _resultService = resultService;
    }

    private string CallerObjectId() =>
        User.FindFirst("oid")?.Value
        ?? User.FindFirst("http://schemas.microsoft.com/identity/claims/objectidentifier")?.Value
        ?? User.Identity?.Name
        ?? "system";

    private bool IsStaffCaller() =>
        User.IsInRole("Technician") || User.IsInRole("Signer")
        || User.IsInRole("ClinicalDirector") || User.IsInRole("LabAdmin");

    /// <summary>
    /// Initiates a pre-screening pipeline analysis run for an EXISTING sample,
    /// through the state machine (#9, #43). Unknown sessions return 404.
    /// </summary>
    [HttpPost("analyze")]
    [Authorize(Policy = "StaffOnly")]
    public async Task<IActionResult> PostAnalyze([FromBody] System.Text.Json.JsonElement payload)
    {
        if (payload.ValueKind is System.Text.Json.JsonValueKind.Undefined or System.Text.Json.JsonValueKind.Null)
            return BadRequest(new { ok = false, error = "Request body is required." });
        if (!payload.TryGetProperty("sessionId", out var s) || s.ValueKind != System.Text.Json.JsonValueKind.String
            || string.IsNullOrWhiteSpace(s.GetString()))
            return BadRequest(new { ok = false, error = "sessionId (string) is required." });
        string sessionId = s.GetString()!;

        var sample = await _db.Samples.FirstOrDefaultAsync(x => x.SampleId == sessionId && !x.IsDeleted);
        if (sample == null)
            return NotFound(new { ok = false, error = $"Sample {sessionId} not found." });

        if (!Enum.TryParse<SampleState>(sample.State, ignoreCase: true, out var current))
            return StatusCode(422, new { ok = false, error = $"Sample {sessionId} has an unrecognised stored state '{sample.State}'." });

        if (sample.IsLocked || SampleStateMachine.IsTerminal(current))
            return StatusCode(409, new { ok = false, error = $"TERMINAL_STATE: Sample {sessionId} is in state '{current}' and cannot be (re)started." });

        string actorId = User.FindFirst("preferred_username")?.Value ?? User.Identity?.Name ?? "Unknown";
        string actorRole = User.IsInRole("ClinicalDirector") ? "ClinicalDirector"
            : User.IsInRole("Signer") ? "Signer"
            : User.IsInRole("LabAdmin") ? "LabAdmin" : "Technician";
        bool calibrationPresent = sample.MicronsPerPixel > 0 && sample.FramesPerSecond > 0
            && sample.ChamberDepthMicrons > 0 && !string.IsNullOrWhiteSpace(sample.RawVideoBlobUri);

        var evt = current == SampleState.Validating ? SampleEvent.FilesValidated : SampleEvent.Submit;
        var ctx = new TransitionContext(actorId, actorRole, Array.Empty<string>(),
            FilesAndCalibrationPresent: calibrationPresent);
        var result = SampleStateMachine.Apply(current, evt, ctx);
        if (!result.Success)
            return StatusCode(409, new { ok = false, error = result.FailureReason });

        sample.State = result.NewState.ToString();
        await _db.SaveChangesAsync();

        _logger.LogInformation("Initiated semen analysis pipeline for session {SessionId}: {From} -> {To}", sessionId, current, result.NewState);

        return Ok(new
        {
            ok = true,
            sessionId = sessionId,
            status = result.NewState.ToString(),
            state = result.NewState.ToString(),
            message = "Semen pre-screening pipeline triggered successfully."
        });
    }

    /// <summary>
    /// Starts asynchronous optical calibration for a sample using a verified calibration media asset.
    /// Inserts CalibrationEntity in 'Pending' state and registers an outbox dispatch message.
    /// Returns 202 Accepted.
    /// </summary>
    [HttpPost("samples/{sampleId}/calibration")]
    public async Task<IActionResult> PostSampleCalibration(string sampleId, [FromBody] StartCalibrationRequest? request)
    {
        if (request is null)
            return BadRequest(new { ok = false, error = "Request body is required." });

        if (request.AssetId == Guid.Empty || string.IsNullOrWhiteSpace(request.TargetId))
            return BadRequest(new { ok = false, error = "Both assetId (Guid) and targetId (string) are required." });

        var sample = await _db.Samples.FirstOrDefaultAsync(s => s.SampleId == sampleId && !s.IsDeleted);
        if (sample == null)
            return NotFound(new { ok = false, error = $"Sample {sampleId} not found." });

        string callerId = CallerObjectId();
        if (!IsStaffCaller() && !string.Equals(sample.CreatedBy, callerId, StringComparison.OrdinalIgnoreCase))
            return Forbid();

        if (!PhysicalCatalogues.TryGetTarget(request.TargetId, out var target))
        {
            return StatusCode(422, new
            {
                ok = false,
                error = "UNKNOWN_CALIBRATION_TARGET",
                message = $"Target ID '{request.TargetId}' is not recognized in the physical catalogue."
            });
        }

        var asset = await _db.MediaAssets.FirstOrDefaultAsync(a => a.AssetId == request.AssetId && a.SampleId == sampleId);
        if (asset == null)
        {
            return NotFound(new { ok = false, error = $"Media asset {request.AssetId} not found for sample {sampleId}." });
        }

        if (!string.Equals(asset.Kind, "calibration", StringComparison.OrdinalIgnoreCase))
        {
            return StatusCode(422, new
            {
                ok = false,
                error = "ASSET_NOT_CALIBRATION_IMAGE",
                message = $"Asset {asset.AssetId} has kind '{asset.Kind}'; only 'calibration' assets can be used for optical calibration."
            });
        }

        if (!string.Equals(asset.Status, "Verified", StringComparison.OrdinalIgnoreCase))
        {
            return StatusCode(422, new
            {
                ok = false,
                error = "ASSET_NOT_VERIFIED",
                message = $"Asset {asset.AssetId} has status '{asset.Status}'; only 'Verified' assets can be calibrated."
            });
        }

        var calibration = new CalibrationEntity
        {
            CalibrationId = Guid.NewGuid(),
            SampleId = sampleId,
            TargetId = target.Id,
            ReferencePitchUm = target.PitchUm,
            AssetId = asset.AssetId,
            Status = "Pending",
            CreatedAtUtc = DateTime.UtcNow
        };
        _db.Calibrations.Add(calibration);

        sample.CalibrationId = calibration.CalibrationId;

        var jobId = Guid.NewGuid();
        var outbox = new OutboxMessageEntity
        {
            Id = jobId,
            Type = "job-calibration",
            PayloadJson = System.Text.Json.JsonSerializer.Serialize(new
            {
                job_id = jobId.ToString(),
                sample_id = sampleId,
                service = "calibration",
                schema_version = "1.0.0",
                inputs = new
                {
                    calibration_image_uri = $"{asset.Container}/{asset.BlobName}"
                },
                @params = new
                {
                    reference_pitch_um = target.PitchUm,
                    calibration_id = calibration.CalibrationId.ToString()
                }
            }),
            CreatedAtUtc = DateTime.UtcNow,
            Attempts = 0
        };
        _db.OutboxMessages.Add(outbox);

        await _db.SaveChangesAsync();

        _logger.LogInformation("Enqueued calibration {CalibrationId} for sample {SampleId} using target {TargetId}",
            calibration.CalibrationId, sampleId, target.Id);

        return Accepted(
            $"/v1/semen/samples/{sampleId}/calibration/{calibration.CalibrationId}",
            new
            {
                ok = true,
                calibrationId = calibration.CalibrationId,
                status = calibration.Status,
                targetId = target.Id,
                referencePitchUm = target.PitchUm
            });
    }

    /// <summary>
    /// Retrieves calibration record for a sample.
    /// </summary>
    [HttpGet("samples/{sampleId}/calibration/{calibrationId}")]
    public async Task<IActionResult> GetSampleCalibration(string sampleId, Guid calibrationId)
    {
        var sample = await _db.Samples.FirstOrDefaultAsync(s => s.SampleId == sampleId && !s.IsDeleted);
        if (sample == null)
            return NotFound(new { ok = false, error = $"Sample {sampleId} not found." });

        string callerId = CallerObjectId();
        if (!IsStaffCaller() && !string.Equals(sample.CreatedBy, callerId, StringComparison.OrdinalIgnoreCase))
            return Forbid();

        var cal = await _db.Calibrations.FirstOrDefaultAsync(c => c.CalibrationId == calibrationId && c.SampleId == sampleId);
        if (cal == null)
            return NotFound(new { ok = false, error = $"Calibration {calibrationId} not found for sample {sampleId}." });

        return Ok(new
        {
            ok = true,
            calibrationId = cal.CalibrationId,
            sampleId = cal.SampleId,
            assetId = cal.AssetId,
            targetId = cal.TargetId,
            referencePitchUm = cal.ReferencePitchUm,
            status = cal.Status,
            rejectReason = cal.RejectReason,
            measuredPitchPx = cal.MeasuredPitchPx,
            micronsPerPixel = cal.MicronsPerPixel,
            linesDetected = cal.LinesDetected,
            spacingCvPct = cal.SpacingCvPct,
            imageWidthPx = cal.ImageWidthPx,
            imageHeightPx = cal.ImageHeightPx,
            toolVersion = cal.ToolVersion,
            createdAtUtc = cal.CreatedAtUtc,
            expiresAtUtc = cal.ExpiresAtUtc
        });
    }

    /// <summary>
    /// Deprecated legacy calibration endpoint.
    /// Returns 410 Gone unless DEMO_MODE is active.
    /// </summary>
    [HttpPost("calibration")]
    public IActionResult PostCalibration([FromBody] CalibrationRequest? request)
    {
        bool isDemo = _configuration.GetValue<bool>("DEMO_MODE")
            || string.Equals(Environment.GetEnvironmentVariable("DEMO_MODE"), "true", StringComparison.OrdinalIgnoreCase);

        if (!isDemo)
        {
            return StatusCode(410, new
            {
                ok = false,
                error = "ENDPOINT_GONE",
                message = "Legacy calibration endpoint has been retired. Use POST /v1/semen/samples/{sampleId}/calibration"
            });
        }

        if (request is null)
            return BadRequest(new { ok = false, error = "Request body is required." });

        int? lines = request.DetectedLinesCount ?? request.GridLineCount;
        if (lines is null || request.SpacingVariancePct is null || request.FieldWidthUm is null)
            return BadRequest(new { ok = false, error = "DetectedLinesCount (or GridLineCount), SpacingVariancePct and FieldWidthUm are all required." });
        if (lines.Value <= 0 || request.FieldWidthUm.Value <= 0 || request.SpacingVariancePct.Value < 0)
            return StatusCode(422, new { ok = false, error = "Calibration inputs must be positive (variance must not be negative)." });

        double variance = request.SpacingVariancePct.Value;
        double fieldWidth = request.FieldWidthUm.Value;

        if (lines.Value < 6 || variance > 5.0)
        {
            _logger.LogWarning("Calibration rejected: {Lines} lines with {Variance}% variance exceeds WHO 2021 tolerance.", lines.Value, variance);
            return StatusCode(422, new
            {
                ok = false,
                linesDetected = lines.Value,
                spacingVariancePct = variance,
                messageEn = "Calibration failed: Grid lines uneven or insufficient. Re-focus eyepiece.",
                messageAr = "فشلت المعايرة: خطوط الشبكة غير متساوية أو غير كافية. يرجى إعادة ضبط العدسة."
            });
        }

        double umPerPx = Math.Round(fieldWidth / (lines.Value * 50.0), 3);
        if (umPerPx <= 0) umPerPx = Math.Round(10.0 / lines.Value, 3);

        _logger.LogInformation("Calibrated optical micrometer (demo): {Lines} lines -> {UmPerPx:F3} µm/px", lines.Value, umPerPx);

        return Ok(new
        {
            ok = true,
            demo = true,
            status = "DEMO_NOT_MEASURED",
            scaleFactor = umPerPx,
            umPerPx = umPerPx,
            linesDetected = lines.Value,
            spacingVariancePct = variance,
            unit = "µm/px",
            calibratedAt = DateTime.UtcNow.ToString("o"),
            messageEn = $"Demo calibration: {umPerPx} µm/px ({lines.Value} lines, not physically measured)",
            messageAr = $"معايرة تجريبية: {umPerPx} µm/px ({lines.Value} خطوط، غير مقاسة فعلياً)"
        });
    }

    /// <summary>
    /// Applies worker calibration measurement result to calibration record and sample.
    /// Internal/Staff only.
    /// </summary>
    [HttpPost("samples/{sampleId}/calibration/{calibrationId}/result")]
    [Authorize(Policy = "StaffOnly")]
    public async Task<IActionResult> ApplyCalibrationResult(string sampleId, Guid calibrationId, [FromBody] Services.CalibrationResultDto result)
    {
        if (_resultService == null)
            return StatusCode(500, new { ok = false, error = "CalibrationResultService not configured." });

        var sample = await _db.Samples.FirstOrDefaultAsync(s => s.SampleId == sampleId && !s.IsDeleted);
        if (sample == null)
            return NotFound(new { ok = false, error = $"Sample {sampleId} not found." });

        var cal = await _db.Calibrations.FirstOrDefaultAsync(c => c.CalibrationId == calibrationId && c.SampleId == sampleId);
        if (cal == null)
            return NotFound(new { ok = false, error = $"Calibration {calibrationId} not found for sample {sampleId}." });

        var applyRes = await _resultService.ApplyAsync(calibrationId, result);
        if (!applyRes.Success)
            return StatusCode(422, new { ok = false, error = applyRes.ErrorMessage });

        return Ok(new { ok = true, status = applyRes.Status });
    }
}

public class StartCalibrationRequest
{
    public Guid AssetId { get; set; }
    public string TargetId { get; set; } = string.Empty;
}

public class CalibrationRequest
{
    public int? GridLineCount { get; set; }
    public int? DetectedLinesCount { get; set; }
    public double? SpacingVariancePct { get; set; }
    public double? FieldWidthUm { get; set; }
}
