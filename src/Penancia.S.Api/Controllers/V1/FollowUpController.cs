using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Penancia.S.Data;
using Penancia.S.Data.Entities;

namespace Penancia.S.Api.Controllers.V1;

/// <summary>
/// Controller for Follow-Up recovery pathways, task tracking, symptom logging, and daily check-ins.
/// </summary>
[ApiController]
[Route("v1")]
[Authorize]
public class FollowUpController : ControllerBase
{
    private readonly PenanciaDbContext _db;
    private readonly ILogger<FollowUpController> _logger;

    public FollowUpController(PenanciaDbContext db, ILogger<FollowUpController> logger)
    {
        _db = db;
        _logger = logger;
    }

    // The caller is always the authenticated user: UserId is taken from the
    // token (preferred_username / Name), never from a client-supplied value
    // or a 'patient-web' fallback, so one user cannot read or write
    // another user's tasks, symptoms or check-ins.
    private string CurrentUserId() =>
        User.FindFirst("preferred_username")?.Value ?? User.Identity?.Name ?? "Unknown";

    /// <summary>
    /// Retrieves active recovery tasks for the authenticated patient.
    /// No seeded fallback tasks (#4): when nothing is stored, the stored
    /// list is empty and an empty list is returned.
    /// </summary>
    [HttpGet("followup/tasks")]
    public async Task<IActionResult> GetTasks()
    {
        var tasks = await _db.FollowUpTasks
            .Where(t => t.UserId == CurrentUserId())
            .OrderBy(t => t.DueDateUtc)
            .ToListAsync();

        return Ok(new { tasks = tasks });
    }

    /// <summary>
    /// Updates status of a recovery task.
    /// </summary>
    [HttpPatch("followup/tasks/{taskId}")]
    public async Task<IActionResult> UpdateTask(string taskId, [FromBody] TaskUpdateDto? dto)
    {
        if (dto is null)
            return BadRequest(new { error = "Request body is required." });

        var task = await _db.FollowUpTasks.FirstOrDefaultAsync(t => t.TaskId == taskId && t.UserId == CurrentUserId());
        if (task == null)
            return NotFound(new { error = $"Task {taskId} not found." });

        if (dto.Completed.HasValue) task.IsCompleted = dto.Completed.Value;
        if (dto.Skipped.HasValue) task.IsSkipped = dto.Skipped.Value;
        if (dto.Notes != null) task.Notes = dto.Notes;
        await _db.SaveChangesAsync();

        return Ok(new
        {
            success = true,
            taskId = taskId,
            updatedAt = DateTime.UtcNow.ToString("o")
        });
    }

    /// <summary>
    /// Logs daily symptom entry. SymptomType and a positive Severity are
    /// required (#43): no fabricated 'GeneralDiscomfort' default and no
    /// silent clamp of an invalid severity to 1.
    /// </summary>
    [HttpPost("symptoms")]
    public async Task<IActionResult> LogSymptom([FromBody] SymptomLogDto? dto)
    {
        if (dto is null)
            return BadRequest(new { error = "Request body is required." });
        if (string.IsNullOrWhiteSpace(dto.SymptomType))
            return BadRequest(new { error = "SymptomType is required." });
        if (dto.Severity <= 0)
            return StatusCode(422, new { error = "Severity must be a positive number." });

        string logId = $"sym_{Guid.NewGuid():N}".Substring(0, 16);

        var entity = new SymptomLogEntity
        {
            LogId = logId,
            UserId = CurrentUserId(),
            SymptomType = dto.SymptomType,
            Severity = dto.Severity,
            Notes = dto.Notes,
            LoggedAtUtc = DateTime.UtcNow
        };

        await _db.SymptomLogs.AddAsync(entity);
        await _db.SaveChangesAsync();

        _logger.LogInformation("Logged symptom {LogId} for user {UserId}", logId, entity.UserId);

        return Ok(new
        {
            id = entity.LogId,
            status = "Logged",
            loggedAt = entity.LoggedAtUtc.ToString("o")
        });
    }

    /// <summary>
    /// Logs daily holistic wellness check-in. Mood is required; EnergyLevel
    /// and SleepHours are stored as supplied (null when not supplied) — no
    /// fabricated 'Calm' / 4 / 7.5 defaults (#4, #43).
    /// </summary>
    [HttpPost("checkins")]
    public async Task<IActionResult> LogCheckIn([FromBody] CheckInDto? dto)
    {
        if (dto is null)
            return BadRequest(new { error = "Request body is required." });
        if (string.IsNullOrWhiteSpace(dto.Mood))
            return BadRequest(new { error = "Mood is required." });

        string checkInId = $"chk_{Guid.NewGuid():N}".Substring(0, 16);

        var entity = new DailyCheckInEntity
        {
            CheckInId = checkInId,
            UserId = CurrentUserId(),
            Mood = dto.Mood,
            EnergyLevel = dto.EnergyLevel,
            SleepHours = dto.SleepHours,
            Notes = dto.Notes,
            LoggedAtUtc = DateTime.UtcNow
        };

        await _db.DailyCheckIns.AddAsync(entity);
        await _db.SaveChangesAsync();

        _logger.LogInformation("Logged daily check-in {CheckInId} for user {UserId}", checkInId, entity.UserId);

        return Ok(new
        {
            id = entity.CheckInId,
            status = "Recorded",
            loggedAt = entity.LoggedAtUtc.ToString("o")
        });
    }
}

public class TaskUpdateDto
{
    public bool? Completed { get; set; }
    public bool? Skipped { get; set; }
    public string? Notes { get; set; }
}

public class SymptomLogDto
{
    public string? UserId { get; set; }
    public string? SymptomType { get; set; }
    public int Severity { get; set; } = 1;
    public string? Notes { get; set; }
}

public class CheckInDto
{
    public string? UserId { get; set; }
    public string? Mood { get; set; }
    public int? EnergyLevel { get; set; }
    public double? SleepHours { get; set; }
    public string? Notes { get; set; }
}
