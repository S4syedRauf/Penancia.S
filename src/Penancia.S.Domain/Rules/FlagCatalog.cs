using Penancia.S.Domain.Model;

namespace Penancia.S.Domain.Rules;

public sealed record ClinicalFlag(
    string Code,
    Severity Severity,
    string? FieldId,
    string Detail);

public static class FlagCatalog
{
    public static ClinicalFlag MotilityExceedsVitality(string detail = "Total motility exceeds vitality.") =>
        new("MOTILITY_EXCEEDS_VITALITY", Severity.Warning, "D.total_motility_pct", detail);

    public static ClinicalFlag ConcentrationMismatch(string detail = "Manual vs video concentration gap exceeds threshold.") =>
        new("CONCENTRATION_MISMATCH", Severity.Warning, "C.conc_reported_mpml", detail);

    public static ClinicalFlag PercentSumInvalid(string fieldId, string detail = "Percentage sum PR+NP+IM differs from 100%.") =>
        new("PERCENT_SUM_INVALID", Severity.Blocking, fieldId, detail);

    public static ClinicalFlag LowCellCount(string fieldId, string detail = "Counted cells below minimum WHO standard.") =>
        new("LOW_CELL_COUNT", Severity.Warning, fieldId, detail);

    public static ClinicalFlag SingleTracker(string detail = "Single tracker used; requires manual review.") =>
        new("SINGLE_TRACKER", Severity.Blocking, "D.pr_pct", detail);

    public static ClinicalFlag TrackersDisagree(string detail = "Independent motility trackers disagree beyond tolerance.") =>
        new("TRACKERS_DISAGREE", Severity.Blocking, "D.pr_pct", detail);

    public static ClinicalFlag DebrisHigh(string detail = "Debris fraction elevated; visual inspection advised.") =>
        new("DEBRIS_HIGH", Severity.Warning, "C.debris_fraction", detail);

    public static ClinicalFlag Unverified(string fieldId, string detail = "Value unverified pending full clinical validation.") =>
        new("UNVERIFIED", Severity.Info, fieldId, detail);

    public static ClinicalFlag ManualReviewRequired(string fieldId, string detail = "Morphology defect requires morphologist sign-off.") =>
        new("MANUAL_REVIEW_REQUIRED", Severity.Blocking, fieldId, detail);

    public static ClinicalFlag NotValidated() =>
        new("NOT_VALIDATED", Severity.Banner, null, "Report generated under unvalidated parameters.");

    public static ClinicalFlag ModelFallbackUsed(string service) =>
        new("MODEL_FALLBACK_USED", Severity.Info, null, $"Fallback model used for {service}.");

    /// <summary>
    /// A measured value failed a lower reference limit rule. Added to
    /// <see cref="EvaluationResult.Flags"/> (not just the row's string list) so
    /// narrative generation cannot claim all parameters meet the limits.
    /// </summary>
    public static ClinicalFlag BelowReference(string fieldId, string? detail = null) =>
        new("BELOW_REFERENCE", Severity.Warning, fieldId,
            detail ?? "Value is below the WHO 2021 6th Edition lower reference limit.");

    /// <summary>
    /// A measured value failed an upper reference limit rule (e.g. leukocytes).
    /// </summary>
    public static ClinicalFlag AboveReference(string fieldId, string? detail = null) =>
        new("ABOVE_REFERENCE", Severity.Warning, fieldId,
            detail ?? "Value is above the WHO 2021 6th Edition upper reference limit.");

    /// <summary>
    /// Defined "no abnormal flags" outcome: emitted when an evaluation has no
    /// abnormal flags, so an all-normal report has a passable narrative outcome
    /// instead of an empty flag set that no sentence set can satisfy.
    /// </summary>
    public static ClinicalFlag AllNormal(string detail = "No abnormal flags: all examined parameters meet the reference limits.") =>
        new("ALL_NORMAL", Severity.Info, null, detail);
}
