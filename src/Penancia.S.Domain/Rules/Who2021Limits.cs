namespace Penancia.S.Domain.Rules;

/// <summary>
/// Clinical reference limits based on the WHO Laboratory Manual for the Examination
/// and Processing of Human Semen (6th Edition, 2021).
/// 
/// All values represent lower reference limits (5th centile, 95% CI).
///
/// Limits are decimal literals, not doubles: a (decimal) cast of a double constant
/// does NOT round-trip to the intended value — it carries the double's binary
/// expansion (e.g. (decimal)7.2d == 7.2000000000000001776m). That made pH 7.19
/// (rounded to 7.2) fail against a 7.2 limit. Never store these as double.
/// </summary>
public static class Who2021Limits
{
    public const decimal MinVolumeMl = 1.4m;                  // WHO 2021 Table 2.1 (p. 115)
    public const decimal MinPh = 7.2m;                        // WHO 2021 Table 2.1 (p. 115)
    public const decimal MinConcentrationMillionPerMl = 16.0m;// 16 million/mL (5th centile)
    public const decimal MinTotalSpermCountMillion = 39.0m;   // 39 million/ejaculate
    public const decimal MinTotalMotilityPercent = 42.0m;     // PR + NP >= 42%
    public const decimal MinProgressiveMotilityPercent = 30.0m;// PR >= 30%
    public const decimal MinVitalityPercent = 54.0m;          // Vitality (dye exclusion / hypo-osmotic) >= 54%
    public const decimal MinNormalFormsPercent = 4.0m;        // Strict Kruger criteria >= 4.0%
    public const decimal MaxLeukocytesMillionPerMl = 1.0m;    // Leukocytospermia threshold > 1.0 M/mL
}

// NOTE (2026-11-21 fix): the dead types ClinicalStatus and ParameterEvaluation that
// used to live here were deleted — no Domain, Api, Workflow, Data or test code
// referenced them. Do not reintroduce a second evaluation model; the canonical
// per-field outcome is RulesEngine.EvaluationRow / ResultState.
