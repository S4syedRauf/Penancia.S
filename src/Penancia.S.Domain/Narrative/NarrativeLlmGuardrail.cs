using System.Globalization;
using System.Text.RegularExpressions;
using Penancia.S.Domain.Report;
using Penancia.S.Domain.Rules;

namespace Penancia.S.Domain.Narrative;

/// <summary>
/// Deterministic template generator for Section J narrative.
/// Guarantees that in the absence of LLM or upon LLM guardrail rejection,
/// clear, clinically accurate text is produced without hallucination.
/// </summary>
public static class NarrativeTemplateEngine
{
    public static string GenerateDeterministicNarrative(SemenAnalysisReport report)
    {
        var abnormalItems = report.Items
            .Where(i => i.Flag is "Below Reference" or "Abnormal")
            .ToList();

        if (!abnormalItems.Any())
        {
            return "All examined seminal parameters (macroscopic characteristics, sperm motility, concentration, and morphology) meet or exceed the WHO 2021 lower reference limits.";
        }

        var lines = new List<string>
        {
            "Semen analysis indicates deviations from the WHO 2021 6th Edition lower reference limits in the following parameters:"
        };

        foreach (var item in abnormalItems)
        {
            string val = item.NumericValue.HasValue ? $"{item.NumericValue.Value.ToString(CultureInfo.InvariantCulture)} {item.Unit}" : item.TextValue ?? "Not recorded";
            lines.Add($"- {item.Parameter}: observed {val} (reference: {item.WhoReference}).");
        }

        return string.Join("\n", lines);
    }
}

/// <summary>
/// Strict guardrail validator for Foundry LLM narrative outputs.
///
/// Enforces 3 Clinical Safety Rules on free LLM text:
/// 1. Number integrity: Every numeric value in the LLM text must exist in the input report items
///    or be a WHO 2021 reference limit from RuleTable (so quoting a limit such as "42%" is allowed).
/// 2. Banned phrases: Prohibits diagnostic claims, medical advice, or inferring fertility.
/// 3. Silent fallback: If any check fails, system reverts to deterministic template.
/// NOTE (2026-11-21 fix): the previous comment claimed a 4th rule (sentence-to-flag
/// alignment) that was never implemented for free text — alignment cannot be checked
/// reliably on unstructured prose. Sentence-to-flag alignment IS implemented for
/// structured output in NarrativeValidator; this guardrail enforces the 3 rules above.
/// </summary>
public static class NarrativeLlmGuardrail
{
    private static readonly string[] BannedPhrases =
    {
        "diagnosis", "diagnose", "infertile", "sterility", "sterile",
        "treatment", "treat", "prescription", "cure", "you should",
        "recommended therapy", "patient has", "patient suffers"
    };

    public record ValidationResult(bool IsValid, string Text, string? RejectionReason = null);

    public static ValidationResult Validate(string llmOutput, SemenAnalysisReport inputReport)
    {
        ArgumentNullException.ThrowIfNull(inputReport);
        if (string.IsNullOrWhiteSpace(llmOutput))
        {
            return new ValidationResult(false, NarrativeTemplateEngine.GenerateDeterministicNarrative(inputReport), "LLM_EMPTY_OUTPUT");
        }

        // Rule 1: Check Banned Phrases
        string lower = llmOutput.ToLowerInvariant();
        foreach (var banned in BannedPhrases)
        {
            if (lower.Contains(banned))
            {
                return new ValidationResult(
                    false,
                    NarrativeTemplateEngine.GenerateDeterministicNarrative(inputReport),
                    $"LLM_REJECTED: Contains banned phrase '{banned}'"
                );
            }
        }

        // Rule 2: Numeric Verification
        // Extract all numbers from LLM output (integers and decimals)
        var matches = Regex.Matches(llmOutput, @"\b\d+(\.\d+)?\b");
        var inputNumbers = inputReport.Items
            .Where(i => i.NumericValue.HasValue)
            .Select(i => Math.Round(i.NumericValue!.Value, 2))
            .ToHashSet();

        // Also add header numbers like abstinence days or volume
        if (inputReport.Header.AbstinenceDays > 0)
            inputNumbers.Add(Math.Round(inputReport.Header.AbstinenceDays, 2));

        // WHO 2021 lower reference limits from RuleTable: an LLM sentence quoting
        // a limit ("below the 42% reference") must not be rejected as hallucinated.
        // Only lower limits (>=) are quotable. The leukocytes UPPER limit (1.0)
        // is deliberately excluded: a bare "1" in free text ("took 1 hour") is
        // numerically identical to 1.0, so including it let any hallucinated "1"
        // pass. The number-only check cannot tell "1 hour" from the limit, so it
        // fails closed; quoting "1.0" for leukocytes also falls back to the
        // deterministic template (safe direction). Pinned by
        // NarrativeGuardrailTests.LlmWithHallucinatedOne_IsRejected.
        foreach (var rule in RuleTable.LowerReferenceLimits.Where(r => r.Op == ComparisonOp.GreaterThanOrEqual))
            inputNumbers.Add(Math.Round((double)rule.Limit, 2));

        foreach (Match match in matches)
        {
            if (double.TryParse(match.Value, NumberStyles.Number, CultureInfo.InvariantCulture, out double num))
            {
                double rounded = Math.Round(num, 2);
                // Allow only the reference year 2021 and the edition number 6.
                // The previous blanket allowlist also included 1 and 2, so any
                // hallucinated "1" or "2" passed; those are removed.
                if (rounded is 2021 or 6)
                    continue;

                if (!inputNumbers.Contains(rounded))
                {
                    return new ValidationResult(
                        false,
                        NarrativeTemplateEngine.GenerateDeterministicNarrative(inputReport),
                        $"LLM_REJECTED: Hallucinated number '{match.Value}' not present in input data."
                    );
                }
            }
        }

        return new ValidationResult(true, llmOutput.Trim());
    }

    /// <summary>
    /// Prepares an anonymized JSON payload for the LLM prompt.
    /// Strictly excludes patient names, IDs, dates of birth, and staff free text.
    /// </summary>
    public static object BuildAnonymizedPromptPayload(SemenAnalysisReport report)
    {
        return new
        {
            abstinence_days = report.Header.AbstinenceDays,
            parameters = report.Items.Select(i => new
            {
                parameter = i.Parameter,
                value = i.NumericValue,
                unit = i.Unit,
                reference = i.WhoReference,
                flag = i.Flag
            }).ToList()
        };
    }
}
