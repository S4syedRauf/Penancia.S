using Penancia.S.Domain.Model;
using Penancia.S.Domain.Narrative;
using Penancia.S.Domain.Parameters;
using Penancia.S.Domain.Report;
using Penancia.S.Domain.Rules;
using Xunit;

namespace Penancia.S.Tests;

public class NarrativeGuardrailTests
{
    private static SemenAnalysisReport CreateSampleReport()
    {
        return new SemenAnalysisReport
        {
            Header = new PatientSampleHeader
            {
                SampleId = "TEST-001",
                AbstinenceDays = 3.0
            },
            Items = new List<ReportItem>
            {
                new()
                {
                    Parameter = "Sperm Concentration",
                    NumericValue = 12.5,
                    Unit = "M/mL",
                    WhoReference = ">= 16.0 M/mL",
                    Flag = "Below Reference"
                },
                new()
                {
                    Parameter = "Total Motility",
                    NumericValue = 35.0,
                    Unit = "%",
                    WhoReference = ">= 42.0 %",
                    Flag = "Below Reference"
                }
            }
        };
    }

    [Fact]
    public void LlmWithBannedPhrase_IsRejectedAndFallsBackToDeterministicTemplate()
    {
        var report = CreateSampleReport();
        string maliciousLlmText = "The patient suffers from infertile condition and requires hormone treatment.";

        var result = NarrativeLlmGuardrail.Validate(maliciousLlmText, report);

        Assert.False(result.IsValid);
        Assert.Contains("LLM_REJECTED", result.RejectionReason);
        Assert.Contains("Sperm Concentration", result.Text); // Fallback text contains actual findings
    }

    [Fact]
    public void LlmWithHallucinatedNumbers_IsRejectedAndFallsBack()
    {
        var report = CreateSampleReport();
        // 99.9 was never in the input!
        string hallucinatedLlmText = "Sperm concentration is 12.5 M/mL with abnormal motility of 99.9%.";

        var result = NarrativeLlmGuardrail.Validate(hallucinatedLlmText, report);

        Assert.False(result.IsValid);
        Assert.Contains("Hallucinated number '99.9'", result.RejectionReason);
    }

    [Fact]
    public void ValidLlmText_WithExactInputNumbers_PassesValidation()
    {
        var report = CreateSampleReport();
        string validLlmText = "Observed sperm concentration was 12.5 M/mL and total motility was 35.0%, both below WHO 2021 limits.";

        var result = NarrativeLlmGuardrail.Validate(validLlmText, report);

        Assert.True(result.IsValid);
        Assert.Null(result.RejectionReason);
        Assert.Equal(validLlmText, result.Text);
    }

    [Fact]
    public void LlmQuotingWhoLimitNumber_PassesValidation()
    {
        var report = CreateSampleReport();
        // 42 is a WHO 2021 reference limit from RuleTable, not a measured value —
        // quoting it must not be rejected as a hallucination.
        string text = "Total motility was 35.0%, below the 42% reference.";

        var result = NarrativeLlmGuardrail.Validate(text, report);

        Assert.True(result.IsValid);
        Assert.Null(result.RejectionReason);
    }

    [Fact]
    public void LlmWithHallucinatedOne_IsRejected()
    {
        var report = CreateSampleReport();
        // "1" was previously blanket-allowed, so any hallucinated 1 passed.
        string text = "The analysis took 1 hour and sperm concentration was 12.5 M/mL.";

        var result = NarrativeLlmGuardrail.Validate(text, report);

        Assert.False(result.IsValid);
        Assert.Contains("Hallucinated number '1'", result.RejectionReason);
    }

    [Fact]
    public void Validator_AllNormalReport_AcceptsAllNormalSentence()
    {
        var prov = Provenance.Manual("tech-1", new DateTimeOffset(2026, 11, 20, 12, 0, 0, TimeSpan.Zero));
        var measurements = new Dictionary<string, Measurement>
        {
            ["B.volume_ml"] = Measurement.Numeric("B.volume_ml", 2.5m, "mL", prov),
            ["C.conc_reported_mpml"] = Measurement.Numeric("C.conc_reported_mpml", 25.0m, "million/mL", prov)
        };
        var eval = RulesEngine.Evaluate(measurements, ParameterSet.Placeholder);
        // No abnormal flags: only the NOT_VALIDATED banner (excluded from sentences).
        Assert.DoesNotContain(eval.Flags, f => f.Code == "BELOW_REFERENCE");

        var result = NarrativeValidator.Validate(
            new NarrativeInput(eval.Rows, eval.Flags),
            new NarrativeOutput(
                new[] { new NarrativeSentenceItem("ALL_NORMAL", "All examined seminal parameters meet or exceed the WHO 2021 6th Edition lower reference limits.") },
                "All examined seminal parameters meet or exceed the WHO 2021 6th Edition lower reference limits."));

        Assert.True(result.IsValid);
        Assert.Null(result.RejectionReason);
    }

    [Fact]
    public void Validator_AllNormalSentence_RejectedWhenFlagsExist()
    {
        var prov = Provenance.Manual("tech-1", new DateTimeOffset(2026, 11, 20, 12, 0, 0, TimeSpan.Zero));
        var measurements = new Dictionary<string, Measurement>
        {
            ["B.volume_ml"] = Measurement.Numeric("B.volume_ml", 1.0m, "mL", prov)
        };
        var eval = RulesEngine.Evaluate(measurements, ParameterSet.Placeholder);
        Assert.Contains(eval.Flags, f => f.Code == "BELOW_REFERENCE");

        var result = NarrativeValidator.Validate(
            new NarrativeInput(eval.Rows, eval.Flags),
            new NarrativeOutput(
                new[] { new NarrativeSentenceItem("ALL_NORMAL", "All examined seminal parameters meet or exceed the WHO 2021 6th Edition lower reference limits.") },
                "All examined seminal parameters meet or exceed the WHO 2021 6th Edition lower reference limits."));

        Assert.False(result.IsValid);
    }
}
