using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Penancia.S.Domain.Workflow;

namespace Penancia.S.Api.Controllers.V1;

/// <summary>
/// Controller for semen analysis microscope optical micrometer calibration.
/// Computes physical pixel pitch (µm/px) following WHO 2021 laboratory manual standards.
/// </summary>
[ApiController]
[Route("v1/semen")]
[Authorize(Policy = "StaffOnly")]
public class CalibrationController : ControllerBase
{
    private readonly ILogger<CalibrationController> _logger;
    private readonly Penancia.S.Data.PenanciaDbContext _db;

    public CalibrationController(ILogger<CalibrationController> logger, Penancia.S.Data.PenanciaDbContext db)
    {
        _logger = logger;
        _db = db;
    }

    /// <summary>
    /// Initiates a pre-screening pipeline analysis run for an EXISTING sample,
    /// through the state machine (#9, #43). Unknown sessions return 404 — a
    /// sample is never auto-created here, and no calibration values are ever
    /// written: the old code created samples with MicronsPerPixel=1.0 /
    /// FramesPerSecond=30.0 / ChamberDepthMicrons=10.0 as if measured.
    /// Calibration presence is read from what is actually stored; if it is
    /// absent the machine fails the Submit with PREREQUISITES_MISSING.
    /// </summary>
    [HttpPost("analyze")]
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
    /// Computes microscope scale factor from user-verified grid line count across calibrated graticule.
    /// WHO 2021 Reference: 10 µm standard Neubauer grid spacing.
    /// All three inputs are required (#43): no fabricated defaults are
    /// substituted when a field is missing. A failed calibration returns
    /// 422, not 200-with-failure.
    /// </summary>
    [HttpPost("calibration")]
    public IActionResult PostCalibration([FromBody] CalibrationRequest? request)
    {
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

        // Standard WHO 2021 calibration: known width / detected resolution
        double umPerPx = Math.Round(fieldWidth / (lines.Value * 50.0), 3);
        if (umPerPx <= 0) umPerPx = Math.Round(10.0 / lines.Value, 3);

        _logger.LogInformation("Calibrated optical micrometer: {Lines} lines -> {UmPerPx:F3} µm/px", lines.Value, umPerPx);

        return Ok(new
        {
            ok = true,
            scaleFactor = umPerPx,
            umPerPx = umPerPx,
            linesDetected = lines.Value,
            spacingVariancePct = variance,
            unit = "µm/px",
            calibratedAt = DateTime.UtcNow.ToString("o"),
            messageEn = $"Micrometer Verified: {umPerPx} µm/px ({lines.Value} even lines)",
            messageAr = $"نجحت المعايرة: {umPerPx} µm/px ({lines.Value} خطوط)"
        });
    }
}

public class CalibrationRequest
{
    public int? GridLineCount { get; set; }
    public int? DetectedLinesCount { get; set; }
    public double? SpacingVariancePct { get; set; }
    public double? FieldWidthUm { get; set; }
}
