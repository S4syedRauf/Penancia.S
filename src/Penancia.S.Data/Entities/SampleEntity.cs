using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Penancia.S.Data.Entities;

/// <summary>
/// Core Clinical Sample entity (System of Record).
/// Tracks overall lifecycle, optical calibration, and outcome state.
/// </summary>
[Table("Samples")]
public class SampleEntity
{
    [Key]
    [MaxLength(64)]
    public string SampleId { get; set; } = string.Empty;

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    [MaxLength(128)]
    public string CreatedBy { get; set; } = string.Empty;

    [MaxLength(16)]
    public string WorkflowVersion { get; set; } = "1.0.0";

    [MaxLength(32)]
    public string State { get; set; } = "Draft";

    [MaxLength(32)]
    public string WorkflowMode { get; set; } = "prescreen";

    [MaxLength(64)]
    public string? ParentSampleId { get; set; }

    [MaxLength(64)]
    public string? ChamberTypeId { get; set; }

    public DateTime? ConsentAtUtc { get; set; }

    public Guid? CalibrationId { get; set; }

    [ForeignKey(nameof(CalibrationId))]
    public CalibrationEntity? Calibration { get; set; }

    // --- Optical Calibration ---
    public double? MicronsPerPixel { get; set; }
    public double? FramesPerSecond { get; set; }
    public double? ChamberDepthMicrons { get; set; }

    // --- Storage URIs ---
    [MaxLength(1024)]
    public string? RawVideoBlobUri { get; set; }

    [MaxLength(1024)]
    public string? RawImageBlobUri { get; set; }

    [MaxLength(1024)]
    public string? DraftReportPdfUri { get; set; }

    [MaxLength(1024)]
    public string? FinalReportPdfUri { get; set; }

    public bool IsLocked { get; set; } = false;

    // Soft-delete flag (#21). No global query filter is configured in
    // PenanciaDbContext: every query must filter on IsDeleted == false
    // explicitly (the Api layer owns that filtering).
    public bool IsDeleted { get; set; } = false;

    // --- Release (sign-off) inputs ---
    // Populated at draft generation (Stage S5): the current draft report
    // version and the SHA-256 of the draft report content. ValidateSignoff
    // compares these "current" values against the version/hash the signer
    // signed; a mismatch fails sign-off closed (STALE_VERSION /
    // STALE_HASH). Until draft generation populates them they stay null,
    // so sign-off cannot succeed — by design. All three fields are
    // nullable because existing rows have no values.
    // Maps to TransitionContext.CurrentReportVersion (int?).
    public int? ReportVersion { get; set; }

    // Maps to TransitionContext.CurrentContentSha256 (string?). SHA-256
    // hex is 64 characters; compared case-insensitively by ValidateSignoff.
    [MaxLength(64)]
    public string? ContentSha256 { get; set; }

    // JSON array of the actor ids that entered or edited data for this
    // sample, e.g. ["tech-01","qc-02"]. Stored as one nvarchar(max)
    // column holding JSON (no new table); deserialise to
    // IReadOnlyList<string> for TransitionContext.DataEnterers.
    // ValidateSignoff fails closed when the list is missing (null) and
    // rejects a signer who appears in it, so the list must contain EVERY
    // data enterer before sign-off is attempted. Null until populated.
    public string? DataEnterersJson { get; set; }

    // Navigation collections
    public ICollection<ModelRunEntity> ModelRuns { get; set; } = new List<ModelRunEntity>();
    public ICollection<AuditEventEntity> AuditEvents { get; set; } = new List<AuditEventEntity>();
}

/// <summary>
/// Individual model execution run result.
/// Pinned to exact model commit, weights hash, and runtime parameters.
/// </summary>
[Table("ModelRuns")]
public class ModelRunEntity
{
    [Key]
    [MaxLength(128)]
    public string JobId { get; set; } = string.Empty;

    [MaxLength(64)]
    public string SampleId { get; set; } = string.Empty;

    [ForeignKey(nameof(SampleId))]
    public SampleEntity? Sample { get; set; }

    [MaxLength(64)]
    public string Service { get; set; } = string.Empty;

    [MaxLength(64)]
    public string ModelName { get; set; } = string.Empty;

    [MaxLength(64)]
    public string RepoCommit { get; set; } = string.Empty;

    [MaxLength(64)]
    public string WeightsSha256 { get; set; } = string.Empty;

    public DateTime StartedAtUtc { get; set; }
    public DateTime? EndedAtUtc { get; set; }

    [MaxLength(32)]
    public string Status { get; set; } = "Pending";

    [MaxLength(1024)]
    public string? ResultUri { get; set; }

    public string? ErrorCode { get; set; }
}

/// <summary>
/// Append-only audit log table.
/// Direct UPDATE and DELETE permissions are revoked in production.
/// </summary>
[Table("AuditEvents")]
public class AuditEventEntity
{
    [Key]
    public long Id { get; set; }

    [MaxLength(64)]
    public string SampleId { get; set; } = string.Empty;

    // Real navigation to the owning sample (#19). Previously this class had
    // no navigation, so EF invented the nullable shadow FK column
    // AuditEvents.SampleEntitySampleId; that column is removed by migration
    // 20261121010311_FixAuditAndBookingConstraints. Delete behaviour is
    // Restrict, configured in PenanciaDbContext.OnModelCreating.
    [ForeignKey(nameof(SampleId))]
    public SampleEntity? Sample { get; set; }

    public DateTime TimestampUtc { get; set; } = DateTime.UtcNow;

    [MaxLength(128)]
    public string Actor { get; set; } = string.Empty;

    [MaxLength(64)]
    public string Action { get; set; } = string.Empty;

    public string? DetailsJson { get; set; }
}
