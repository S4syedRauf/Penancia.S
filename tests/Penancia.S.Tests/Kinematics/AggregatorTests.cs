using Penancia.S.Domain.Kinematics;
using Xunit;
using static Penancia.S.Tests.TestSupport;

namespace Penancia.S.Tests.Kinematics;

public sealed class AggregatorTests
{
    private static TrackResult Compute(TrackInput t) => KinematicsCalculator.Compute(t, Cal, P);

    [Fact]
    public void MeanMedianSd_AndExclusionTally()
    {
        var p = P with { MinCellsMotility = 2 };
        var stationary = FromUm(3, Enumerable.Repeat((1.0, 1.0), 10).ToArray());
        var s = KinematicsAggregator.Aggregate(
            new[] { Compute(Straight(1, 50)), Compute(Straight(2, 100)), Compute(stationary) }, p);

        Assert.Equal(2, s.TracksUsed);
        Assert.Equal(1, s.TracksExcluded);
        Assert.Equal(1, s.ExclusionCounts[ExclusionReason.ZeroPath]);
        Near(75, s.Vcl!.Mean, 1e-9);
        Near(75, s.Vcl.Median, 1e-9);
        Near(35.3553, s.Vcl.Sd, 1e-3);     // sqrt((25^2 + 25^2) / 1)
        Assert.False(s.LowCellCount);
    }

    [Fact]
    public void LowCellCount_WhenBelowMinimum()
    {
        var s = KinematicsAggregator.Aggregate(new[] { Compute(Straight(1, 50)) }, P);   // default min = 200
        Assert.True(s.LowCellCount);
        Assert.Equal(1, s.TracksUsed);
        Assert.Null(s.Vcl!.Sd);            // n = 1 -> no SD
    }

    [Fact]
    public void EvenCount_MedianIsAverageOfMiddleTwo()
    {
        var s = KinematicsAggregator.Aggregate(
            new[] { Compute(Straight(1, 40)), Compute(Straight(2, 60)),
                    Compute(Straight(3, 80)), Compute(Straight(4, 100)) }, P);
        Near(70, s.Vcl!.Median, 1e-9);
    }

    [Fact]
    public void Empty_GivesNullStats_AndLowCellCount()
    {
        var s = KinematicsAggregator.Aggregate(Array.Empty<TrackResult>(), P);
        Assert.Equal(0, s.TracksUsed);
        Assert.Null(s.Vcl);
        Assert.Null(s.BcfCrossingsPerSec);
        Assert.True(s.LowCellCount);
        Assert.Equal(0, KinematicsAggregator.Aggregate(null, P).TracksUsed);
    }

    [Fact]
    public void Bcf_ReasonReported_WhenFpsTooLow()
    {
        var p = P with { BcfMinFps = 60 };
        var r = KinematicsCalculator.Compute(Straight(1, 50), Cal, p);
        var s = KinematicsAggregator.Aggregate(new[] { r }, p);
        Assert.Null(s.BcfCrossingsPerSec);
        Assert.Equal("FPS_TOO_LOW", s.BcfCrossingsPerSecUnavailableReason);
        Assert.NotNull(s.Vcl);
    }
}
