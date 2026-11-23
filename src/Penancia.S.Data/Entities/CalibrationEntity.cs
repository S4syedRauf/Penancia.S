using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Penancia.S.Data.Entities;

[Table("Calibrations")]
public class CalibrationEntity
{
    [Key]
    public Guid CalibrationId { get; set; } = Guid.NewGuid();

    [MaxLength(64)]
    public string SampleId { get; set; } = string.Empty;

    [MaxLength(64)]
    public string TargetId { get; set; } = string.Empty;

    public double ReferencePitchUm { get; set; }
    public double MeasuredPitchPx { get; set; }
    public double MicronsPerPixel { get; set; }
    public int LinesDetected { get; set; }
    public double SpacingCvPct { get; set; }
    public int ImageWidthPx { get; set; }
    public int ImageHeightPx { get; set; }

    public Guid AssetId { get; set; }

    [MaxLength(32)]
    public string Status { get; set; } = "Pending";

    [MaxLength(256)]
    public string? RejectReason { get; set; }

    [MaxLength(32)]
    public string ToolVersion { get; set; } = "1.0.0";

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? ExpiresAtUtc { get; set; }
}
