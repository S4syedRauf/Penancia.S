using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Penancia.S.Data;
using Penancia.S.Data.Entities;

namespace Penancia.S.Api.Controllers.V1;

/// <summary>
/// Controller for Patient Lifestyle Questionnaires & Health Assessment Screening Runs.
/// Persists answers and evaluates risk band deterministically.
/// </summary>
[ApiController]
[Route("v1")]
[Authorize]
public class QuestionnaireController : ControllerBase
{
    private readonly PenanciaDbContext _db;
    private readonly ILogger<QuestionnaireController> _logger;

    public QuestionnaireController(PenanciaDbContext db, ILogger<QuestionnaireController> logger)
    {
        _db = db;
        _logger = logger;
    }

    // UserId is taken from the authenticated token, never from a
    // client-supplied value or a 'patient-web' fallback (#43).
    private string CurrentUserId() =>
        User.FindFirst("preferred_username")?.Value ?? User.Identity?.Name ?? "Unknown";

    /// <summary>
    /// Saves intake or lifestyle questionnaire responses.
    /// </summary>
    [HttpPost("questionnaire/answers")]
    public async Task<IActionResult> SaveAnswers([FromBody] QuestionnaireSubmissionDto? dto)
    {
        if (dto is null)
            return BadRequest(new { error = "Request body is required." });
        if (dto.Answers is null)
            return BadRequest(new { error = "Answers are required." });

        string id = $"qst_{Guid.NewGuid():N}".Substring(0, 16);
        string json = System.Text.Json.JsonSerializer.Serialize(dto.Answers);

        var entity = new QuestionnaireEntity
        {
            Id = id,
            UserId = CurrentUserId(),
            AnswersJson = json,
            SubmittedAtUtc = DateTime.UtcNow
        };

        await _db.Questionnaires.AddAsync(entity);
        await _db.SaveChangesAsync();

        _logger.LogInformation("Saved questionnaire answers {Id} for user {UserId}", id, entity.UserId);

        return Ok(new
        {
            id = entity.Id,
            savedAt = entity.SubmittedAtUtc.ToString("o"),
            status = "Saved"
        });
    }

    /// <summary>
    /// Executes deterministic health screening evaluation based on user inputs.
    /// hasSymptoms is read with TryGetProperty + a type check (#43): a
    /// non-boolean value is rejected (422) instead of throwing on GetBoolean().
    /// </summary>
    [HttpPost("screening/runs")]
    public async Task<IActionResult> CreateScreeningRun([FromBody] System.Text.Json.JsonElement payload)
    {
        if (payload.ValueKind is System.Text.Json.JsonValueKind.Undefined or System.Text.Json.JsonValueKind.Null)
            return BadRequest(new { error = "Request body is required." });

        string runId = $"scr_{Guid.NewGuid():N}".Substring(0, 16);

        // Deterministic risk band determination
        string riskBand = "LowRisk";
        if (payload.TryGetProperty("hasSymptoms", out var s))
        {
            if (s.ValueKind is not (System.Text.Json.JsonValueKind.True or System.Text.Json.JsonValueKind.False))
                return StatusCode(422, new { error = "hasSymptoms must be a boolean when supplied." });
            if (s.GetBoolean())
                riskBand = "ModerateRisk";
        }

        var entity = new ScreeningRunEntity
        {
            RunId = runId,
            UserId = CurrentUserId(),
            RiskBand = riskBand,
            RecommendationsJson = System.Text.Json.JsonSerializer.Serialize(new[]
            {
                "Maintain healthy sleep habits and Mediterranean diet",
                "Consider baseline WHO 2021 semen analysis if trying to conceive > 6 months",
                "Stay hydrated and avoid high testicular heat exposure (saunas/hot tubs)"
            }),
            CreatedAtUtc = DateTime.UtcNow
        };

        await _db.ScreeningRuns.AddAsync(entity);
        await _db.SaveChangesAsync();

        _logger.LogInformation("Generated screening run {RunId} with risk band {RiskBand}", runId, riskBand);

        return Ok(new
        {
            runId = entity.RunId,
            riskBand = entity.RiskBand,
            evaluatedAt = entity.CreatedAtUtc.ToString("o")
        });
    }

    /// <summary>
    /// Retrieves screening run details by ID. Unknown ids return 404 (#4) —
    /// the old fabricated 'LowRisk' fallback is removed.
    /// </summary>
    [HttpGet("screening/runs/{runId}")]
    public async Task<IActionResult> GetScreeningRun(string runId)
    {
        var run = await _db.ScreeningRuns.FirstOrDefaultAsync(r => r.RunId == runId);
        if (run == null)
            return NotFound(new { error = $"Screening run {runId} not found." });

        return Ok(new
        {
            runId = run.RunId,
            status = "Complete",
            riskBand = run.RiskBand,
            createdAt = run.CreatedAtUtc.ToString("o"),
            recommendations = !string.IsNullOrEmpty(run.RecommendationsJson)
                ? System.Text.Json.JsonSerializer.Deserialize<string[]>(run.RecommendationsJson)
                : Array.Empty<string>()
        });
    }
}

public class QuestionnaireSubmissionDto
{
    public string? UserId { get; set; }
    public object? Answers { get; set; }
}
