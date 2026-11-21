using System.Globalization;
using System.Text.RegularExpressions;
using Penancia.S.Domain.Rules;

namespace Penancia.S.Domain.Narrative;

public sealed record NarrativeInput(
    IReadOnlyList<EvaluationRow> Rows,
    IReadOnlyList<ClinicalFlag> Flags);

public sealed record NarrativeSentenceItem(string FlagCode, string Sentence);

public sealed record NarrativeOutput(
    IReadOnlyList<NarrativeSentenceItem> Sentences,
    string? CombinedText);

public sealed record NarrativeValidationResult(
    bool IsValid,
    string? RejectionReason);

public static class NarrativeValidator
{
    private static readonly string[] BannedSubstrings =
    {
        "diagnos", "infertil", "sterile", "treatment", "you should", "pregnan", "cure", "prescription"
    };

    public static NarrativeValidationResult Validate(NarrativeInput input, NarrativeOutput output)
    {
        ArgumentNullException.ThrowIfNull(input);
        ArgumentNullException.ThrowIfNull(output);
        ArgumentNullException.ThrowIfNull(input.Rows);
        ArgumentNullException.ThrowIfNull(input.Flags);
        if (output.Sentences == null || output.Sentences.Count == 0)
        {
            return new NarrativeValidationResult(false, "LLM_REJECTED: Output contains no structured sentences.");
        }

        var inputFlags = input.Flags.Select(f => f.Code).ToHashSet();
        var outputFlags = new HashSet<string>();

        // Flags that never require a sentence: unverified/validation banners.
        var effectiveInputFlags = inputFlags.Where(f => f != "UNVERIFIED" && f != "NOT_VALIDATED").ToHashSet();

        // Build valid numbers set from input rows (rounded display precision and raw values)
        var validNumbers = new HashSet<double>();
        foreach (var row in input.Rows)
        {
            if (row.Value.HasValue)
            {
                validNumbers.Add((double)Math.Round(row.Value.Value, 2));
            }
        }
        // WHO 2021 reference limits from RuleTable: quoting a limit ("42%") is
        // legitimate, not a hallucination.
        foreach (var rule in RuleTable.LowerReferenceLimits)
            validNumbers.Add(Math.Round((double)rule.Limit, 2));
        // Allow only the reference year 2021 and the edition number 6.
        validNumbers.Add(2021);
        validNumbers.Add(6);

        foreach (var item in output.Sentences)
        {
            if (item is null || string.IsNullOrWhiteSpace(item.Sentence))
            {
                return new NarrativeValidationResult(false, "LLM_REJECTED: Output contains an empty sentence.");
            }

            // ALL_NORMAL is the defined "no abnormal flags" outcome: it is only
            // valid when the input has no effective (abnormal) flags, and it is
            // the only sentence an all-normal report may carry. Previously an
            // all-normal report was unpassable (empty flag set, yet every input
            // flag had to appear in the output).
            if (item.FlagCode == "ALL_NORMAL")
            {
                if (effectiveInputFlags.Count != 0)
                    return new NarrativeValidationResult(false, "LLM_REJECTED: 'ALL_NORMAL' sentence supplied for a report with abnormal flags.");
                outputFlags.Add(item.FlagCode);
            }
            // Rule 2: Every sentence maps to exactly one flag code from input
            else if (!inputFlags.Contains(item.FlagCode))
            {
                return new NarrativeValidationResult(false, $"LLM_REJECTED: Output flag '{item.FlagCode}' was not in input flags.");
            }
            else
            {
                outputFlags.Add(item.FlagCode);
            }

            // Rule 3: No banned phrase appears
            string lower = item.Sentence.ToLowerInvariant();
            foreach (var banned in BannedSubstrings)
            {
                if (lower.Contains(banned))
                {
                    return new NarrativeValidationResult(false, $"LLM_REJECTED: Contains banned word '{banned}'.");
                }
            }

            // Rule 1: Every number in output appears in input
            var matches = Regex.Matches(item.Sentence, @"\b\d+(\.\d+)?\b");
            foreach (Match m in matches)
            {
                if (double.TryParse(m.Value, NumberStyles.Number, CultureInfo.InvariantCulture, out double val))
                {
                    double rounded = Math.Round(val, 2);
                    if (!validNumbers.Contains(rounded))
                    {
                        return new NarrativeValidationResult(false, $"LLM_REJECTED: Hallucinated number '{m.Value}' not found in input data.");
                    }
                }
            }
        }

        // Rule 4: No flag from input is missing. (An ALL_NORMAL output satisfies
        // this vacuously because effectiveInputFlags is empty in that case.)
        foreach (var flag in effectiveInputFlags)
        {
            if (!outputFlags.Contains(flag))
            {
                return new NarrativeValidationResult(false, $"LLM_REJECTED: Missing input flag '{flag}' in output.");
            }
        }

        return new NarrativeValidationResult(true, null);
    }
}
