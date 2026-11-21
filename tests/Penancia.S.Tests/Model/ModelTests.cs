using Penancia.S.Domain.Model;
using Penancia.S.Domain.Parameters;
using Xunit;

namespace Penancia.S.Tests.Model;

public sealed class ModelTests
{
    private static readonly DateTimeOffset T = new(2026, 11, 19, 0, 0, 0, TimeSpan.Zero);

    [Fact]
    public void Factories_ProduceConsistentMeasurements()
    {
        var auto = Provenance.Automated("pycasa", "x", "abc123", unverified: true);
        var man = Provenance.Manual("tech-1", T);

        Assert.True(Measurement.Numeric("B.ph", 7.4m, "", man).IsConsistent);
        Assert.True(Measurement.Numeric("C.conc_video_mpml", 18.2m, "million/mL", auto).IsConsistent);
        Assert.True(Measurement.Text("A.patient_ref", "P-1", man).IsConsistent);
        Assert.True(Measurement.Missing("B.ph", "").IsConsistent);
        Assert.True(Measurement.Failed("D.vcl", "µm/s", "TRACKERS_FAILED").IsConsistent);
        Assert.True(Measurement.NotPerformed("G.dna_fragmentation_pct", "%", "NO_KIT", man).IsConsistent);
        Assert.True(Measurement.NotApplicable("F.vitality_pct", "%", "NO_SPERM_SEEN", man).IsConsistent);
    }

    [Fact]
    public void MissingOrFailed_CanNeverCarryANumber()
    {
        Assert.False(new Measurement("B.ph", 7.4m, null, "", FieldStatus.Missing, null, null).IsConsistent);
        Assert.False(new Measurement("D.vcl", 0m, null, "µm/s", FieldStatus.Failed, "X", null).IsConsistent);
        Assert.False(new Measurement("D.vcl", null, null, "µm/s", FieldStatus.Failed, null, null).IsConsistent); // no reason
    }

    [Fact]
    public void PresentWithoutSource_OrWithoutValue_IsInconsistent()
    {
        Assert.False(new Measurement("B.ph", 7.4m, null, "", FieldStatus.Present, null, null).IsConsistent);
        Assert.False(new Measurement("B.ph", null, null, "", FieldStatus.Present, null, Provenance.Manual("t", T)).IsConsistent);
        Assert.False(new Measurement("B.ph", 7m, "7", "", FieldStatus.Present, null, Provenance.Manual("t", T)).IsConsistent);
    }

    [Fact]
    public void Provenance_RequiresItsKindFields()
    {
        Assert.False(new Provenance(SourceKind.Automated).IsConsistent);
        Assert.False(new Provenance(SourceKind.Manual, EnteredBy: "x").IsConsistent);      // no timestamp
        Assert.False(new Provenance(SourceKind.Derived).IsConsistent);
        Assert.True(Provenance.Derived(new[] { "D.pr_pct", "D.np_pct" }).IsConsistent);
        Assert.False((Provenance.Manual("t", T) with { ConfirmedByReviewer = true }).IsConsistent); // no reviewer id
        Assert.True((Provenance.Manual("t", T) with { ConfirmedByReviewer = true, ReviewerId = "r1" }).IsConsistent);
    }

    // CANONICAL calibration-validity test (merged from CalibrationTests.cs, which
    // is deleted — one canonical test, covering depth 0, fps 0, NaN and infinity).
    [Fact]
    public void Calibration_ValidParameters_IsValidIsTrue()
    {
        var cal = new Calibration(1.0, 30.0, 10.0);
        Assert.True(cal.IsValid);
        Assert.Equal(1.0, cal.UmPerPx);
        Assert.Equal(30.0, cal.Fps);
        Assert.Equal(10.0, cal.ChamberDepthUm);
        Assert.True(new Calibration(0.7, 60, 20).IsValid);
    }

    [Theory]
    [InlineData(0, 30, 10)]
    [InlineData(-1, 30, 10)]
    [InlineData(1, 0, 10)]
    [InlineData(1, 30, -5)]
    [InlineData(1, 30, 0)]
    [InlineData(double.NaN, 30, 10)]
    [InlineData(1, double.NaN, 10)]
    [InlineData(1, 30, double.NaN)]
    [InlineData(1, double.PositiveInfinity, 10)]
    [InlineData(double.PositiveInfinity, 30, 10)]
    [InlineData(1, 30, double.PositiveInfinity)]
    [InlineData(0.7, double.PositiveInfinity, 20)]
    [InlineData(0.7, 60, -1)]
    public void Calibration_InvalidParameters_IsValidIsFalse(double um, double fps, double depth)
    {
        var cal = new Calibration(um, fps, depth);
        Assert.False(cal.IsValid);
    }

    [Fact]
    public void ParameterSet_DefaultsAreUsable_ButNotValidated()
    {
        var p = ParameterSet.Placeholder;
        Assert.Empty(p.Validate());
        Assert.False(p.Validated);
    }

    [Fact]
    public void ParameterSet_RejectsBadValues()
    {
        Assert.Contains("SMOOTHING_WINDOW_MUST_BE_ODD_AND_POSITIVE",
            (ParameterSet.Placeholder with { SmoothingWindowPoints = 4 }).Validate());
        Assert.Contains("VALIDATED_WITHOUT_MANIFEST_ID",
            (ParameterSet.Placeholder with { Validated = true }).Validate());
        Assert.Empty((ParameterSet.Placeholder with { Validated = true, ManifestId = "m-1" }).Validate());
        Assert.Contains("MOTILITY_AGREEMENT_NEGATIVE",
            (ParameterSet.Placeholder with { MotilityAgreementPp = -1m }).Validate());
        Assert.Contains("DEBRIS_WARN_OUT_OF_RANGE",
            (ParameterSet.Placeholder with { DebrisFractionWarn = 1.5m }).Validate());
    }
}
