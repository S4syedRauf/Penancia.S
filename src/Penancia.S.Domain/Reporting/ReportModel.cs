using System.Text.Json.Serialization;
using Penancia.S.Domain.Model;

// CANONICAL REPORT MODEL (2026-11-21 decision): this Reporting.ReportModel is the
// canonical versioned report — the JSON record that is hashed (content hash +
// separate sign-off hash), signed and released. Domain/Report/SemenAnalysisReport
// (file renamed to SemenAnalysisReport.cs) is a separate render model used only to
// render HTML/PDF and to feed the narrative guardrail; it is NOT the canonical
// record. Deduplicating the two models into one remains an open item — do not
// delete either type: both are referenced (ReportBuilder uses this one;
// ReportHtmlTemplate and NarrativeLlmGuardrail use SemenAnalysisReport).
namespace Penancia.S.Domain.Reporting;

public sealed record ReportHeader(
    [property: JsonPropertyName("report_id")] string ReportId,
    [property: JsonPropertyName("sample_id")] string SampleId,
    [property: JsonPropertyName("version")] int Version,
    [property: JsonPropertyName("status")] string Status,
    [property: JsonPropertyName("generated_at")] DateTimeOffset GeneratedAt,
    [property: JsonPropertyName("content_sha256")] string? ContentSha256,
    [property: JsonPropertyName("signoff_sha256")] string? SignoffSha256,
    [property: JsonPropertyName("supersedes_report_id")] string? SupersedesReportId);

public sealed record ReportSectionRow(
    [property: JsonPropertyName("field_id")] string FieldId,
    [property: JsonPropertyName("label")] string Label,
    [property: JsonPropertyName("value")] decimal? Value,
    [property: JsonPropertyName("text_value")] string? TextValue,
    [property: JsonPropertyName("unit")] string Unit,
    [property: JsonPropertyName("display")] string? Display,
    [property: JsonPropertyName("reference")] string? Reference,
    [property: JsonPropertyName("result_state")] string ResultState,
    [property: JsonPropertyName("flags")] IReadOnlyList<string> Flags,
    [property: JsonPropertyName("source")] Provenance? Source);

public sealed record ReportSection(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("title")] string Title,
    [property: JsonPropertyName("rows")] IReadOnlyList<ReportSectionRow> Rows);

public sealed record ReportFlag(
    [property: JsonPropertyName("code")] string Code,
    [property: JsonPropertyName("severity")] string Severity,
    [property: JsonPropertyName("field_id")] string? FieldId,
    [property: JsonPropertyName("detail")] string Detail);

public sealed record ReportNarrative(
    [property: JsonPropertyName("template_text")] string TemplateText,
    [property: JsonPropertyName("llm_text")] string? LlmText,
    [property: JsonPropertyName("final_text")] string FinalText,
    [property: JsonPropertyName("llm_rejected_reason")] string? LlmRejectedReason);

public sealed record ReportSignoff(
    [property: JsonPropertyName("signer_id")] string SignerId,
    [property: JsonPropertyName("role")] string Role,
    [property: JsonPropertyName("signed_at")] DateTimeOffset SignedAt,
    [property: JsonPropertyName("statement")] string Statement);

public sealed record ReportProvenance(
    [property: JsonPropertyName("calibration")] Calibration Calibration,
    [property: JsonPropertyName("kinematics_conventions")] IReadOnlyDictionary<string, string> KinematicsConventions);

public sealed record ReportModel(
    [property: JsonPropertyName("schema_version")] string SchemaVersion,
    [property: JsonPropertyName("report")] ReportHeader Report,
    [property: JsonPropertyName("banners")] IReadOnlyList<string> Banners,
    [property: JsonPropertyName("parameter_set")] ParameterInfo ParameterSet,
    [property: JsonPropertyName("sections")] IReadOnlyList<ReportSection> Sections,
    [property: JsonPropertyName("flags")] IReadOnlyList<ReportFlag> Flags,
    [property: JsonPropertyName("narrative")] ReportNarrative Narrative,
    [property: JsonPropertyName("signoff")] ReportSignoff? Signoff,
    [property: JsonPropertyName("provenance")] ReportProvenance Provenance);

public sealed record ParameterInfo(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("validated")] bool Validated,
    [property: JsonPropertyName("manifest_id")] string? ManifestId);
