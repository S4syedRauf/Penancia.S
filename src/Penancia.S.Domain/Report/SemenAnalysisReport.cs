// NOTE (2026-11-21 fix): this file is renamed to SemenAnalysisReport.cs — it
// contains no class named ReportModel. It defines the RENDER model
// (SemenAnalysisReport) used by ReportHtmlTemplate and NarrativeLlmGuardrail.
// The CANONICAL versioned report model is Penancia.S.Domain.Reporting.ReportModel;
// see the header comment there. Both types are referenced, so neither is deleted;
// deduplication remains an open item.
namespace Penancia.S.Domain.Report;

/// <summary>
/// Origin source of a clinical measurement.
/// Distinguishes automated computer vision inference from manual technician observation.
/// </summary>
public sealed record ResultSource
{
    public bool IsAutomated { get; init; }
    public string Name { get; init; } = string.Empty;       // e.g. "pycasa v1.2" or "Jane Doe (Technician)"
    public string? Version { get; init; }                   // e.g. "sha:7f8d2b1"
    public string? Method { get; init; }                    // e.g. "Digital CASA / Makler Chamber"

    public static ResultSource Automated(string modelName, string version, string method) =>
        new() { IsAutomated = true, Name = modelName, Version = version, Method = method };

    public static ResultSource Manual(string staffName, string role, string method) =>
        new() { IsAutomated = false, Name = $"{staffName} ({role})", Version = null, Method = method };

    public override string ToString() => IsAutomated ? $"Automated ({Name}, {Version})" : $"Manual ({Name})";
}

/// <summary>
/// Individual clinical parameter entry in the A-J report tables.
/// Columns: Parameter | Result | Unit | WHO 2021 Reference | Flag | Source
/// </summary>
public sealed record ReportItem
{
    public string Section { get; init; } = string.Empty;     // e.g. "B. Macroscopic", "C. Motility"
    public string Parameter { get; init; } = string.Empty;   // e.g. "Sperm Concentration"
    public double? NumericValue { get; init; }
    public string? TextValue { get; init; }
    public string Unit { get; init; } = string.Empty;        // e.g. "M/mL", "%", "mL"
    public string WhoReference { get; init; } = string.Empty;// e.g. ">= 16.0 M/mL"
    public string? Flag { get; init; }                       // "Below Reference", "Incomplete", "Normal"
    public ResultSource Source { get; init; } = ResultSource.Manual("Unknown", "Staff", "Visual");
}

/// <summary>
/// Section A: Patient & Sample Metadata Block.
/// Anonymized for LLM prompts; full for internal clinical reports.
/// </summary>
public sealed record PatientSampleHeader
{
    public string SampleId { get; init; } = string.Empty;
    public string VerificationId { get; init; } = string.Empty; // SHA-256 audit anchor
    public DateTime CollectionDateTimeUtc { get; init; }
    public DateTime AnalysisDateTimeUtc { get; init; }
    public double AbstinenceDays { get; init; }
    public string CollectionLocation { get; init; } = "On-site Lab";
    public bool SpillageReported { get; init; } = false;
    public int ReportVersion { get; init; } = 1;
}

/// <summary>
/// Section J: Narrative, Sign-off & Audit Verification Block.
/// </summary>
public sealed record ReportFooter
{
    public string NarrativeText { get; init; } = string.Empty;
    public bool IsLlmGenerated { get; init; } = false;
    public string? LlmModelName { get; init; }
    public string Limitations { get; init; } =
        "Semen analysis results exhibit significant biological variation. Results must be interpreted in clinical correlation with reproductive history by a qualified medical professional.";
    public string SignerName { get; init; } = string.Empty;
    public string SignerRole { get; init; } = string.Empty;
    public DateTime? SignedAtUtc { get; init; }
    public string ElectronicSignatureStatement { get; init; } = string.Empty;
}

/// <summary>
/// Master Clinical Semen Analysis Report (Sections A to J).
/// Used uniformly by the HTML/PDF template renderer, the Web Portal, and the versioned API.
/// </summary>
public sealed record SemenAnalysisReport
{
    public PatientSampleHeader Header { get; init; } = new();
    public List<ReportItem> Items { get; init; } = new();
    public ReportFooter Footer { get; init; } = new();

    /// <summary>
    /// Status control banners:
    /// - IsValidatedClinicalUse = false -> "DRAFT: Not validated for clinical use"
    /// - IsSigned = false -> "DRAFT: Awaiting sign-off"
    /// </summary>
    public bool IsValidatedClinicalUse { get; init; } = false;
    public bool IsSigned => Footer.SignedAtUtc.HasValue;
}
