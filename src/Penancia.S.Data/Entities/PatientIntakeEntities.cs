using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Penancia.S.Data.Entities;

/// <summary>
/// Patient questionnaire answers entity.
/// </summary>
[Table("Questionnaires")]
public class QuestionnaireEntity
{
    [Key]
    [MaxLength(64)]
    public string Id { get; set; } = string.Empty;

    [MaxLength(128)]
    public string UserId { get; set; } = string.Empty;

    public string AnswersJson { get; set; } = "{}";

    public DateTime SubmittedAtUtc { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// Deterministic screening calculation outcome and risk stratification.
/// </summary>
[Table("ScreeningRuns")]
public class ScreeningRunEntity
{
    [Key]
    [MaxLength(64)]
    public string RunId { get; set; } = string.Empty;

    [MaxLength(128)]
    public string UserId { get; set; } = string.Empty;

    [MaxLength(64)]
    public string RiskBand { get; set; } = "LowRisk";

    public string? RecommendationsJson { get; set; }

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// Recovery pathway and lifestyle follow-up task.
/// </summary>
[Table("FollowUpTasks")]
public class FollowUpTaskEntity
{
    [Key]
    [MaxLength(64)]
    public string TaskId { get; set; } = string.Empty;

    [MaxLength(128)]
    public string UserId { get; set; } = string.Empty;

    [MaxLength(256)]
    public string Title { get; set; } = string.Empty;

    public bool IsCompleted { get; set; } = false;

    public bool IsSkipped { get; set; } = false;

    public DateTime? DueDateUtc { get; set; }

    [MaxLength(1024)]
    public string? Notes { get; set; }
}

/// <summary>
/// Patient-reported daily symptom entry.
/// </summary>
[Table("SymptomLogs")]
public class SymptomLogEntity
{
    [Key]
    [MaxLength(64)]
    public string LogId { get; set; } = string.Empty;

    [MaxLength(128)]
    public string UserId { get; set; } = string.Empty;

    [MaxLength(128)]
    public string SymptomType { get; set; } = string.Empty;

    public int Severity { get; set; } = 1;

    [MaxLength(1024)]
    public string? Notes { get; set; }

    public DateTime LoggedAtUtc { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// Daily holistic wellness check-in record.
/// </summary>
[Table("DailyCheckIns")]
public class DailyCheckInEntity
{
    [Key]
    [MaxLength(64)]
    public string CheckInId { get; set; } = string.Empty;

    [MaxLength(128)]
    public string UserId { get; set; } = string.Empty;

    [MaxLength(64)]
    public string? Mood { get; set; }

    public int? EnergyLevel { get; set; }

    public double? SleepHours { get; set; }

    [MaxLength(1024)]
    public string? Notes { get; set; }

    public DateTime LoggedAtUtc { get; set; } = DateTime.UtcNow;
}
