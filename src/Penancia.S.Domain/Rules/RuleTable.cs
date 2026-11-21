namespace Penancia.S.Domain.Rules;

public sealed record Rule(
    string Id,
    string FieldId,
    ComparisonOp Op,
    decimal Limit,
    string Unit,
    string FlagCode,
    string WhoSource);

public static class RuleTable
{
    // All limits are derived from Who2021Limits (single source of truth) — no
    // hardcoded literals here. Who2021Limits stores decimal literals: a (decimal)
    // cast of a double constant does NOT round-trip (e.g. (decimal)7.2d ==
    // 7.2000000000000001776m), which made pH 7.19 fail a 7.2 limit. Never
    // reintroduce double limits with casts.
    public static readonly IReadOnlyList<Rule> LowerReferenceLimits = new List<Rule>
    {
        new("R-B1", "B.volume_ml", ComparisonOp.GreaterThanOrEqual, Who2021Limits.MinVolumeMl, "mL", "BELOW_REFERENCE", "WHO 6th Ed Table 2.1"),
        new("R-B2", "B.ph", ComparisonOp.GreaterThanOrEqual, Who2021Limits.MinPh, "", "BELOW_REFERENCE", "WHO 6th Ed Table 2.1"),
        new("R-C1", "C.conc_reported_mpml", ComparisonOp.GreaterThanOrEqual, Who2021Limits.MinConcentrationMillionPerMl, "million/mL", "BELOW_REFERENCE", "WHO 6th Ed Table 2.1"),
        new("R-C2", "C.total_number_million", ComparisonOp.GreaterThanOrEqual, Who2021Limits.MinTotalSpermCountMillion, "million", "BELOW_REFERENCE", "WHO 6th Ed Table 2.1"),
        new("R-D1", "D.total_motility_pct", ComparisonOp.GreaterThanOrEqual, Who2021Limits.MinTotalMotilityPercent, "%", "BELOW_REFERENCE", "WHO 6th Ed Table 2.1"),
        new("R-D2", "D.pr_pct", ComparisonOp.GreaterThanOrEqual, Who2021Limits.MinProgressiveMotilityPercent, "%", "BELOW_REFERENCE", "WHO 6th Ed Table 2.1"),
        new("R-E1", "E.normal_forms_pct", ComparisonOp.GreaterThanOrEqual, Who2021Limits.MinNormalFormsPercent, "%", "BELOW_REFERENCE", "WHO 6th Ed Table 2.1"),
        new("R-F1", "F.vitality_pct", ComparisonOp.GreaterThanOrEqual, Who2021Limits.MinVitalityPercent, "%", "BELOW_REFERENCE", "WHO 6th Ed Table 2.1"),
        // Upper limit (not a lower limit): leukocytes above 1.0 million/mL is
        // leukocytospermia. Kept in this table so the engine enforces it; the
        // flag code and ResultState are AboveReference, never BelowReference.
        new("R-H1", "H.leukocytes_mpml", ComparisonOp.LessThanOrEqual, Who2021Limits.MaxLeukocytesMillionPerMl, "million/mL", "ABOVE_REFERENCE", "WHO 6th Ed Table 2.1")
    };
}
