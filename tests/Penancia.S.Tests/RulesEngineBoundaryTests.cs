using Penancia.S.Domain.Model;
using Penancia.S.Domain.Parameters;
using Penancia.S.Domain.Rules;
using Xunit;

namespace Penancia.S.Tests;

/// <summary>
/// Unit tests for clinical limit boundaries and rounding rules from Section 18.
/// Rule: Round half away from zero to display precision, then compare to limit.
/// </summary>
public class RulesEngineBoundaryTests
{
    private static readonly Provenance DummyProv = Provenance.Manual("Tester", DateTimeOffset.UtcNow);

    [Theory]
    [InlineData(41.4, ResultState.BelowReference)]  // 41.4 -> rounds to 41 -> Below (< 42)
    [InlineData(41.5, ResultState.WithinReference)] // 41.5 -> rounds to 42 -> Within (>= 42)
    [InlineData(42.0, ResultState.WithinReference)] // 42.0 -> Within
    public void TotalMotilityRoundingBoundary_JudgedCorrectly(decimal rawMotility, ResultState expectedState)
    {
        var measurements = new Dictionary<string, Measurement>
        {
            ["D.pr_pct"] = Measurement.Numeric("D.pr_pct", rawMotility, "%", DummyProv),
            ["D.np_pct"] = Measurement.Numeric("D.np_pct", 0m, "%", DummyProv), // PR + NP = rawMotility
            ["F.vitality_pct"] = Measurement.Numeric("F.vitality_pct", 60m, "%", DummyProv)
        };

        var result = RulesEngine.Evaluate(measurements, ParameterSet.Placeholder);
        var row = result.Rows.First(r => r.FieldId == "D.total_motility_pct");

        Assert.Equal(expectedState, row.ResultState);
    }

    [Theory]
    [InlineData(7.19, ResultState.WithinReference)] // 7.19 -> rounds to 7.2 -> Within (>= 7.2)
    [InlineData(7.14, ResultState.BelowReference)]  // 7.14 -> rounds to 7.1 -> Below (< 7.2)
    public void PhRoundingBoundary_JudgedCorrectly(decimal rawPh, ResultState expectedState)
    {
        var measurements = new Dictionary<string, Measurement>
        {
            ["B.ph"] = Measurement.Numeric("B.ph", rawPh, "", DummyProv)
        };

        var result = RulesEngine.Evaluate(measurements, ParameterSet.Placeholder);
        var row = result.Rows.First(r => r.FieldId == "B.ph");

        Assert.Equal(expectedState, row.ResultState);
    }

    [Theory]
    [InlineData(1.35, ResultState.WithinReference)] // 1.35 -> rounds to 1.4 -> Within (>= 1.4)
    [InlineData(1.34, ResultState.BelowReference)]  // 1.34 -> rounds to 1.3 -> Below (< 1.4)
    public void VolumeRoundingBoundary_JudgedCorrectly(decimal rawVol, ResultState expectedState)
    {
        var measurements = new Dictionary<string, Measurement>
        {
            ["B.volume_ml"] = Measurement.Numeric("B.volume_ml", rawVol, "mL", DummyProv)
        };

        var result = RulesEngine.Evaluate(measurements, ParameterSet.Placeholder);
        var row = result.Rows.First(r => r.FieldId == "B.volume_ml");

        Assert.Equal(expectedState, row.ResultState);
    }

    // DECISION PIN (round-then-compare, deliberate — see RulesEngine comment):
    // 15.96 displays as 16.0 and therefore PASSES >= 16, while 15.94 displays
    // as 15.9 and FAILS. If the clinical lead requires raw-value comparison,
    // this test must be updated with the decision.
    [Fact]
    public void Concentration15Point96_RoundsTo16Point0_Passes()
    {
        var measurements = new Dictionary<string, Measurement>
        {
            ["C.conc_reported_mpml"] = Measurement.Numeric("C.conc_reported_mpml", 15.96m, "million/mL", DummyProv)
        };

        var result = RulesEngine.Evaluate(measurements, ParameterSet.Placeholder);
        var row = result.Rows.First(r => r.FieldId == "C.conc_reported_mpml");

        Assert.Equal(ResultState.WithinReference, row.ResultState);
        Assert.Equal("16.0", row.DisplayValue);
    }

    [Fact]
    public void Concentration15Point94_RoundsTo15Point9_IsBelowReference()
    {
        // 15.94 -> rounds to 15.9 -> Below (< 16.0)
        var measurements = new Dictionary<string, Measurement>
        {
            ["C.conc_reported_mpml"] = Measurement.Numeric("C.conc_reported_mpml", 15.94m, "million/mL", DummyProv)
        };

        var result = RulesEngine.Evaluate(measurements, ParameterSet.Placeholder);
        var row = result.Rows.First(r => r.FieldId == "C.conc_reported_mpml");

        Assert.Equal(ResultState.BelowReference, row.ResultState);
    }

    [Fact]
    public void MissingField_ProducesIncompleteStatus_NeverWithinReference()
    {
        var measurements = new Dictionary<string, Measurement>(); // Empty
        var result = RulesEngine.Evaluate(measurements, ParameterSet.Placeholder);

        var volRow = result.Rows.First(r => r.FieldId == "B.volume_ml");
        Assert.Equal(ResultState.Incomplete, volRow.ResultState);
        Assert.Contains("INCOMPLETE", volRow.Flags);
    }

    [Fact]
    public void LeukocytesAboveLimit_IsAboveReference_NotBelow()
    {
        var measurements = new Dictionary<string, Measurement>
        {
            ["H.leukocytes_mpml"] = Measurement.Numeric("H.leukocytes_mpml", 2.0m, "million/mL", DummyProv)
        };

        var result = RulesEngine.Evaluate(measurements, ParameterSet.Placeholder);
        var row = result.Rows.First(r => r.FieldId == "H.leukocytes_mpml");

        Assert.Equal(ResultState.AboveReference, row.ResultState);
        Assert.Equal("≤ 1.0 million/mL", row.ReferenceText);
        Assert.Contains("ABOVE_REFERENCE", row.Flags);
        Assert.Contains(result.Flags, f => f.Code == "ABOVE_REFERENCE" && f.FieldId == "H.leukocytes_mpml");
    }

    [Fact]
    public void LeukocytesAtLimit_Passes()
    {
        var measurements = new Dictionary<string, Measurement>
        {
            ["H.leukocytes_mpml"] = Measurement.Numeric("H.leukocytes_mpml", 1.0m, "million/mL", DummyProv)
        };

        var result = RulesEngine.Evaluate(measurements, ParameterSet.Placeholder);
        var row = result.Rows.First(r => r.FieldId == "H.leukocytes_mpml");
        Assert.Equal(ResultState.WithinReference, row.ResultState);
    }

    [Fact]
    public void BelowReference_FailureAddsClinicalFlag_NotJustRowString()
    {
        var measurements = new Dictionary<string, Measurement>
        {
            ["B.volume_ml"] = Measurement.Numeric("B.volume_ml", 1.0m, "mL", DummyProv)
        };

        var result = RulesEngine.Evaluate(measurements, ParameterSet.Placeholder);
        Assert.Contains(result.Flags, f => f.Code == "BELOW_REFERENCE" && f.FieldId == "B.volume_ml");
        // And the template narrative must not claim all parameters meet limits.
        Assert.DoesNotContain(
            "All examined seminal parameters meet or exceed",
            Penancia.S.Domain.Narrative.TemplateNarrative.BuildFullNarrative(result));
    }

    [Fact]
    public void TextOnlyPresentValue_IsNoReferenceLimit_NeverWithinReference()
    {
        var measurements = new Dictionary<string, Measurement>
        {
            ["B.viscosity"] = Measurement.Text("B.viscosity", "Increased", DummyProv)
        };

        var result = RulesEngine.Evaluate(measurements, ParameterSet.Placeholder);
        var row = result.Rows.First(r => r.FieldId == "B.viscosity");
        Assert.Equal(ResultState.NoReferenceLimit, row.ResultState);
    }

    [Fact]
    public void PercentSumMismatch_EmitsBlockingFlag()
    {
        var measurements = new Dictionary<string, Measurement>
        {
            ["D.pr_pct"] = Measurement.Numeric("D.pr_pct", 40m, "%", DummyProv),
            ["D.np_pct"] = Measurement.Numeric("D.np_pct", 20m, "%", DummyProv),
            ["D.im_pct"] = Measurement.Numeric("D.im_pct", 30m, "%", DummyProv) // sums to 90
        };

        var result = RulesEngine.Evaluate(measurements, ParameterSet.Placeholder);
        Assert.Contains(result.Flags, f => f.Code == "PERCENT_SUM_INVALID" && f.Severity == Severity.Blocking);
        Assert.False(result.IsComplete);
    }

    [Fact]
    public void CallerSuppliedDerivedValue_IsPreserved_NotOverwritten()
    {
        var measurements = new Dictionary<string, Measurement>
        {
            ["D.pr_pct"] = Measurement.Numeric("D.pr_pct", 35m, "%", DummyProv),
            ["D.np_pct"] = Measurement.Numeric("D.np_pct", 15m, "%", DummyProv),
            ["D.total_motility_pct"] = Measurement.Numeric("D.total_motility_pct", 52m, "%", DummyProv)
        };

        var result = RulesEngine.Evaluate(measurements, ParameterSet.Placeholder);
        var row = result.Rows.First(r => r.FieldId == "D.total_motility_pct");
        Assert.Equal(52m, row.Value); // caller value kept, not recomputed as 50
    }

    [Fact]
    public void DerivedTotalNumber_IsCalculatedCorrectly()
    {
        // Volume 2.0 mL * Conc 20.0 M/mL = 40.0 million (>= 39.0 -> WithinReference)
        var measurements = new Dictionary<string, Measurement>
        {
            ["B.volume_ml"] = Measurement.Numeric("B.volume_ml", 2.0m, "mL", DummyProv),
            ["C.conc_reported_mpml"] = Measurement.Numeric("C.conc_reported_mpml", 20.0m, "million/mL", DummyProv)
        };

        var result = RulesEngine.Evaluate(measurements, ParameterSet.Placeholder);
        var totalRow = result.Rows.First(r => r.FieldId == "C.total_number_million");

        Assert.Equal(40.0m, totalRow.Value);
        Assert.Equal(ResultState.WithinReference, totalRow.ResultState);
    }
}
