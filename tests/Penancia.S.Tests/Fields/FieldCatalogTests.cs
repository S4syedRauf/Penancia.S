using System.Globalization;
using Penancia.S.Domain.Fields;
using Xunit;

namespace Penancia.S.Tests.Fields;

public sealed class FieldCatalogTests
{
    private static decimal D(string s) => decimal.Parse(s, CultureInfo.InvariantCulture);

    [Fact]
    public void Ids_AreUnique_AndPrefixedBySection()
    {
        Assert.Equal(FieldCatalog.All.Count, FieldCatalog.All.Select(f => f.Id).Distinct().Count());
        foreach (var f in FieldCatalog.All)
            Assert.StartsWith(f.Section + ".", f.Id);
    }

    [Fact]
    public void EverySection_AtoJ_HasFields()
    {
        foreach (var s in Enum.GetValues<Section>())
            Assert.NotEmpty(FieldCatalog.InSection(s));
    }

    [Theory]
    [InlineData("B.volume_ml")] [InlineData("B.ph")] [InlineData("C.conc_reported_mpml")]
    [InlineData("C.total_number_million")] [InlineData("D.total_motility_pct")]
    [InlineData("D.pr_pct")] [InlineData("E.normal_forms_pct")] [InlineData("F.vitality_pct")]
    [InlineData("H.leukocytes_mpml")] // upper-limit rule (RuleTable R-H1)
    public void FieldsUsedByReferenceLimits_Exist_AndHaveDisplayPrecision(string id)
    {
        Assert.True(FieldCatalog.TryGet(id, out var def));
        Assert.NotNull(def.DisplayDecimals);
    }

    [Fact]
    public void SectionH_AlwaysUnverified_SectionG_AllowsNotPerformed()
    {
        foreach (var f in FieldCatalog.InSection(Section.H)) Assert.True(f.AlwaysUnverified);
        Assert.Equal(Requirement.RequiredOrNotPerformed, FieldCatalog.Get("G.dna_fragmentation_pct").Requirement);
    }

    [Theory]
    [InlineData("B.ph", "7.0", true, null)]
    [InlineData("B.ph", "14", true, null)]
    [InlineData("B.ph", "14.1", false, "OUT_OF_HARD_RANGE")]
    [InlineData("B.ph", "-0.1", false, "OUT_OF_HARD_RANGE")]
    [InlineData("B.ph", "20", false, "OUT_OF_HARD_RANGE")]
    [InlineData("B.volume_ml", "0", true, null)]
    [InlineData("B.volume_ml", "20", true, null)]
    [InlineData("B.volume_ml", "20.1", false, "OUT_OF_HARD_RANGE")]
    [InlineData("B.volume_ml", "-1", false, "OUT_OF_HARD_RANGE")]
    [InlineData("I.calibration_um_per_px", "0", false, "OUT_OF_HARD_RANGE")]
    [InlineData("I.calibration_um_per_px", "0.001", true, null)]
    [InlineData("D.lin", "1", true, null)]
    [InlineData("D.lin", "1.01", false, "OUT_OF_HARD_RANGE")]
    [InlineData("A.abstinence_days", "60", true, null)]
    [InlineData("A.abstinence_days", "61", false, "OUT_OF_HARD_RANGE")]
    [InlineData("A.abstinence_days", "3.5", false, "NOT_INTEGER")]
    [InlineData("A.patient_ref", "1", false, "NOT_NUMERIC_FIELD")]
    [InlineData("Z.unknown", "1", false, "UNKNOWN_FIELD")]
    public void ValidateNumber(string id, string value, bool ok, string? reason)
    {
        var r = FieldValidator.ValidateNumber(id, D(value));
        Assert.Equal(ok, r.IsValid);
        Assert.Equal(reason, r.ReasonCode);
    }

    [Theory]
    [InlineData("A.collection_complete", "Yes", true, null)]
    [InlineData("A.collection_complete", "Maybe", false, "NOT_ALLOWED_VALUE")]
    [InlineData("A.collection_complete", "", false, "EMPTY")]
    [InlineData("A.patient_ref", "   ", false, "EMPTY")]
    [InlineData("A.patient_ref", null, false, "EMPTY")]
    [InlineData("A.patient_ref", "P-001", true, null)]
    [InlineData("B.ph", "7", false, "NOT_TEXT_FIELD")]
    public void ValidateText(string id, string? text, bool ok, string? reason)
    {
        var r = FieldValidator.ValidateText(id, text);
        Assert.Equal(ok, r.IsValid);
        Assert.Equal(reason, r.ReasonCode);
    }

    [Fact]
    public void FutureCollectionDate_IsRejected()
    {
        var now = new DateTimeOffset(2026, 11, 19, 12, 0, 0, TimeSpan.Zero);
        var clock = new FixedClock(now);
        Assert.True(FieldValidator.ValidateNotFuture(now, clock).IsValid);
        Assert.True(FieldValidator.ValidateNotFuture(now.AddMinutes(-1), clock).IsValid);
        Assert.Equal("FUTURE_DATE", FieldValidator.ValidateNotFuture(now.AddMinutes(1), clock).ReasonCode);
    }

    // Rounding rule: half away from zero, then compare. These pin the boundary values in the spec.
    [Theory]
    [InlineData("B.ph", "7.15", "7.2")]
    [InlineData("B.ph", "7.19", "7.2")]
    [InlineData("B.ph", "7.14", "7.1")]
    [InlineData("B.volume_ml", "1.35", "1.4")]
    [InlineData("B.volume_ml", "1.34", "1.3")]
    [InlineData("C.conc_reported_mpml", "15.94", "15.9")]
    [InlineData("D.total_motility_pct", "41.4", "41")]
    [InlineData("D.total_motility_pct", "41.5", "42")]
    [InlineData("D.total_motility_pct", "42", "42")]
    public void RoundForDisplay(string id, string input, string expected) =>
        Assert.Equal(D(expected), FieldCatalog.RoundForDisplay(id, D(input)));

    [Fact]
    public void UnknownField_Get_Throws() =>
        Assert.Throws<KeyNotFoundException>(() => FieldCatalog.Get("Z.nope"));
}
