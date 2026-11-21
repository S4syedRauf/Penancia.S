using Penancia.S.Domain.Parameters;
using Penancia.S.Domain.Resolvers;
using Xunit;

namespace Penancia.S.Tests;

/// <summary>
/// Unit tests for MotilityResolver against the Section 9 decision table and sum validation.
/// </summary>
public class MotilityResolverTests
{
    private static TrackerResult CreateTracker(string name, bool succeeded, decimal pr, decimal np, decimal im, int nCells = 300) =>
        new(name, succeeded, succeeded ? new TrackerMotility(pr, np, im, nCells) : null, null, name, "1.0", "commit1");

    [Fact]
    public void Row1_BothUsableAndWithinTolerance_ProducesAgreed()
    {
        // Primary: PR 30, NP 15 -> TM 45
        var primary = CreateTracker("pycasa", true, 30m, 15m, 55m);
        // Fallback: PR 32, NP 14 -> TM 46 (DeltaPR = 2 <= 5, DeltaTM = 1 <= 5)
        var fallback = CreateTracker("banerjee", true, 32m, 14m, 54m);

        var outcome = MotilityResolver.Resolve(primary, fallback, ParameterSet.Placeholder);

        Assert.Equal(MotilityAgreementStatus.Agreed, outcome.Status);
        Assert.True(outcome.IsReportable);
        Assert.Equal(30m, outcome.PrPct);
        Assert.Equal(15m, outcome.NpPct);
        Assert.Equal(45m, outcome.TotalMotilityPct);
        Assert.Null(outcome.ReviewTaskRequired);
    }

    [Fact]
    public void Row2_BothUsableOutsideTolerance_ProducesDisagree_AndReviewTask()
    {
        // Primary: PR 30, NP 15
        var primary = CreateTracker("pycasa", true, 30m, 15m, 55m);
        // Fallback: PR 40, NP 15 (DeltaPR = 10 > 5)
        var fallback = CreateTracker("banerjee", true, 40m, 15m, 45m);

        var outcome = MotilityResolver.Resolve(primary, fallback, ParameterSet.Placeholder);

        Assert.Equal(MotilityAgreementStatus.Disagree, outcome.Status);
        Assert.False(outcome.IsReportable);
        Assert.Contains("TRACKERS_DISAGREE", outcome.Flags);
        Assert.Equal("MotilityDisagreement", outcome.ReviewTaskRequired);
    }

    [Fact]
    public void Row3_PrimaryUsableFallbackFailed_ProducesSingleTracker()
    {
        var primary = CreateTracker("pycasa", true, 35m, 15m, 50m);
        var fallback = CreateTracker("banerjee", false, 0m, 0m, 0m);

        var outcome = MotilityResolver.Resolve(primary, fallback, ParameterSet.Placeholder);

        Assert.Equal(MotilityAgreementStatus.SingleTracker, outcome.Status);
        Assert.False(outcome.IsReportable);
        Assert.Contains("SINGLE_TRACKER", outcome.Flags);
        Assert.Equal("MotilityConfirm", outcome.ReviewTaskRequired);
    }

    [Fact]
    public void Row4_PrimaryFailedFallbackUsable_ProducesSingleTrackerAndFallbackFlag()
    {
        var primary = CreateTracker("pycasa", false, 0m, 0m, 0m);
        var fallback = CreateTracker("banerjee", true, 28m, 14m, 58m);

        var outcome = MotilityResolver.Resolve(primary, fallback, ParameterSet.Placeholder);

        Assert.Equal(MotilityAgreementStatus.SingleTracker, outcome.Status);
        Assert.False(outcome.IsReportable);
        Assert.Contains("SINGLE_TRACKER", outcome.Flags);
        Assert.Contains("MODEL_FALLBACK_USED", outcome.Flags);
        Assert.Equal("MotilityConfirm", outcome.ReviewTaskRequired);
    }

    [Fact]
    public void Row5_BothFailed_ProducesFailedStatus()
    {
        var primary = CreateTracker("pycasa", false, 0m, 0m, 0m);
        var fallback = CreateTracker("banerjee", false, 0m, 0m, 0m);

        var outcome = MotilityResolver.Resolve(primary, fallback, ParameterSet.Placeholder);

        Assert.Equal(MotilityAgreementStatus.Failed, outcome.Status);
        Assert.False(outcome.IsReportable);
        Assert.Contains("INCOMPLETE", outcome.Flags);
    }

    [Fact]
    public void PercentSumNot100_TreatedAsUnusable()
    {
        // 40 + 20 + 30 = 90% != 100%
        var primary = CreateTracker("pycasa", true, 40m, 20m, 30m);
        var fallback = CreateTracker("banerjee", false, 0m, 0m, 0m);

        var outcome = MotilityResolver.Resolve(primary, fallback, ParameterSet.Placeholder);

        // Primary is unusable, fallback is failed -> Both unusable/failed
        Assert.Equal(MotilityAgreementStatus.Failed, outcome.Status);
    }

    [Fact]
    public void NegativeComponent_TreatedAsUnusable_DespiteSummingTo100()
    {
        // PR=-10, NP=60, IM=50 sums to 100 but PR is out of range.
        var primary = CreateTracker("pycasa", true, -10m, 60m, 50m);
        var fallback = CreateTracker("banerjee", false, 0m, 0m, 0m);

        var outcome = MotilityResolver.Resolve(primary, fallback, ParameterSet.Placeholder);

        Assert.Equal(MotilityAgreementStatus.Failed, outcome.Status);
    }

    [Fact]
    public void ApplyReview_AcceptPrimary_PreservesOriginalFlags()
    {
        // Primary usable but with too few cells -> LOW_CELL_COUNT; fallback failed.
        var primary = CreateTracker("pycasa", true, 35m, 15m, 50m, nCells: 100);
        var fallback = CreateTracker("banerjee", false, 0m, 0m, 0m);

        var original = MotilityResolver.Resolve(primary, fallback, ParameterSet.Placeholder);
        Assert.Equal(MotilityAgreementStatus.SingleTracker, original.Status);
        Assert.Contains("LOW_CELL_COUNT", original.Flags);
        Assert.Contains("SINGLE_TRACKER", original.Flags);

        var reviewed = MotilityResolver.ApplyReview(
            original,
            new ReviewDecision("AcceptPrimary", "reviewer-1"),
            primary,
            fallback);

        Assert.Equal(MotilityAgreementStatus.Agreed, reviewed.Status);
        Assert.True(reviewed.IsReportable);
        Assert.Contains("LOW_CELL_COUNT", reviewed.Flags);
        Assert.Contains("SINGLE_TRACKER", reviewed.Flags);
    }

    [Fact]
    public void ApplyReview_ManualValue_OutOfRange_IsRejected()
    {
        var primary = CreateTracker("pycasa", true, 30m, 15m, 55m);
        var fallback = CreateTracker("banerjee", true, 40m, 15m, 45m);
        var original = MotilityResolver.Resolve(primary, fallback, ParameterSet.Placeholder);
        Assert.Equal(MotilityAgreementStatus.Disagree, original.Status);

        var reviewed = MotilityResolver.ApplyReview(
            original,
            new ReviewDecision("ManualValue", "reviewer-1", ManualPrPct: -5m, ManualNpPct: 55m, ManualImPct: 50m),
            primary,
            fallback);

        Assert.Equal(MotilityAgreementStatus.Disagree, reviewed.Status);
        Assert.Contains("OUT_OF_RANGE", reviewed.Flags);
    }
}
