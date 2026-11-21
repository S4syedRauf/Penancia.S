using Penancia.S.Domain.Model;
using Penancia.S.Domain.Parameters;
using Penancia.S.Domain.Resolvers;
using Xunit;

namespace Penancia.S.Tests;

/// <summary>
/// Unit tests for MorphologyResolver against Section 11 specifications.
/// </summary>
public class MorphologyResolverTests
{
    [Theory]
    [InlineData("normal", CanonicalHeadClass.Normal)]
    [InlineData("tapered", CanonicalHeadClass.Abnormal)]
    [InlineData("pyriform", CanonicalHeadClass.Abnormal)]
    [InlineData("amorphous", CanonicalHeadClass.Abnormal)]
    [InlineData("debris", CanonicalHeadClass.Unusable)]
    public void MadrnetMapping_MapsCorrectly(string label, CanonicalHeadClass expected)
    {
        Assert.Equal(expected, MorphologyResolver.MapMadrnet(label));
    }

    [Theory]
    [InlineData("normal", CanonicalHeadClass.Normal)]
    [InlineData("abnormal", CanonicalHeadClass.Abnormal)]
    [InlineData("non-sperm", CanonicalHeadClass.Unusable)]
    public void CbamMapping_MapsCorrectly(string label, CanonicalHeadClass expected)
    {
        Assert.Equal(expected, MorphologyResolver.MapCbam(label));
    }

    [Fact]
    public void BothAgree_ClassifiesCleanly_AndCalculatesPercentage()
    {
        // 10 Normal, 190 Abnormal = 200 total cells (5% normal)
        var cells = new List<CellResult>();
        for (int i = 0; i < 10; i++)
            cells.Add(new CellResult(i, "normal", "normal"));
        for (int i = 10; i < 200; i++)
            cells.Add(new CellResult(i, "tapered", "abnormal"));

        var outcome = MorphologyResolver.Resolve(cells, ParameterSet.Placeholder);

        Assert.False(outcome.RequiresReview);
        Assert.Equal(FieldStatus.Present, outcome.Status);
        Assert.Equal(5.0m, outcome.NormalFormsPct);
        Assert.Equal(200, outcome.TotalClassified);
        Assert.Equal(10, outcome.TotalNormal);
        Assert.Equal(190, outcome.TotalAbnormal);
        // The review flag is scoped to disagreeing cells: with no disagreement
        // it must NOT appear on a result with RequiresReview == false.
        Assert.DoesNotContain("MANUAL_REVIEW_REQUIRED", outcome.Flags);
    }

    [Fact]
    public void NullLabels_MapToUnusable_NeverThrow()
    {
        Assert.Equal(CanonicalHeadClass.Unusable, MorphologyResolver.MapMadrnet(null));
        Assert.Equal(CanonicalHeadClass.Unusable, MorphologyResolver.MapCbam(null));
        Assert.Equal(CanonicalHeadClass.Unusable, MorphologyResolver.MapMadrnet(""));
        Assert.Equal(CanonicalHeadClass.Unusable, MorphologyResolver.MapCbam("  "));
    }

    [Fact]
    public void Disagreement_ReportsAgreedPercentage_WithReviewFlag()
    {
        // One agreed cell (normal) + one disagreeing cell: the minority
        // disagreement no longer blocks the whole result. The agreed percentage
        // (1 of 1 agreed = 100%) is reported, with review required.
        var cells = new List<CellResult>
        {
            new(1, "normal", "normal"),
            new(2, "normal", "abnormal") // Disagreement!
        };

        var outcome = MorphologyResolver.Resolve(cells, ParameterSet.Placeholder);

        Assert.True(outcome.RequiresReview);
        Assert.Equal(FieldStatus.Present, outcome.Status);
        Assert.Equal(100.0m, outcome.NormalFormsPct);
        Assert.Equal(1, outcome.TotalClassified);
        Assert.Equal(1, outcome.TotalReviewRequired);
        Assert.Contains("MANUAL_REVIEW_REQUIRED", outcome.Flags);
    }

    [Fact]
    public void NoAgreedCells_IsMissing_WithReviewFlag()
    {
        var cells = new List<CellResult>
        {
            new(1, "normal", "abnormal") // Disagreement, nothing agreed
        };

        var outcome = MorphologyResolver.Resolve(cells, ParameterSet.Placeholder);

        Assert.True(outcome.RequiresReview);
        Assert.Null(outcome.NormalFormsPct);
        Assert.Equal(FieldStatus.Missing, outcome.Status);
        Assert.Equal(1, outcome.TotalReviewRequired);
    }

    [Fact]
    public void MorphologistOverride_ResolvesReviewRequiredCell()
    {
        var cells = new List<CellResult>
        {
            new(1, "normal", "normal"),
            new(2, "normal", "abnormal", MorphologistLabel: "normal") // Overridden by human
        };

        var outcome = MorphologyResolver.Resolve(cells, ParameterSet.Placeholder with { MinCellsMorphology = 2 });

        Assert.False(outcome.RequiresReview);
        Assert.Equal(100.0m, outcome.NormalFormsPct);
        Assert.Equal(2, outcome.TotalNormal);
        Assert.Equal(0, outcome.TotalReviewRequired);
    }

    [Fact]
    public void LowCellCount_FlagsWarning()
    {
        // Only 5 cells < default 200 min
        var cells = Enumerable.Range(1, 5).Select(i => new CellResult(i, "normal", "normal"));

        var outcome = MorphologyResolver.Resolve(cells, ParameterSet.Placeholder);

        Assert.Contains("LOW_CELL_COUNT", outcome.Flags);
    }
}
