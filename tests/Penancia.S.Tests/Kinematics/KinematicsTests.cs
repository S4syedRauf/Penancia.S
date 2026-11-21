using Penancia.S.Domain.Kinematics;
using Penancia.S.Domain.Model;
using Penancia.S.Domain.Parameters;
using Xunit;
using static Penancia.S.Tests.TestSupport;

namespace Penancia.S.Tests.Kinematics;

public sealed class KinematicsTests
{
    [Fact]
    public void Kin1_StraightLine()
    {
        var r = KinematicsCalculator.Compute(
            FromUm(1, new[] { (0.0, 0.0), (5.0, 0.0), (10.0, 0.0), (15.0, 0.0), (20.0, 0.0) }), Cal, P);

        Assert.True(r.IsIncluded);
        var m = r.Metrics!;
        Near(50, m.Vcl, 1e-9); Near(50, m.Vsl, 1e-9); Near(50, m.Vap, 1e-9);
        Near(1, m.Lin, 1e-9); Near(1, m.Str, 1e-9); Near(1, m.Wob, 1e-9);
        Near(0, m.AlhTwoXMeanDeviationUm, 1e-9);
        Near(0, m.BcfCrossingsPerSec, 1e-9);
        Near(0.4, m.DurationS, 1e-9);
    }

    [Fact]
    public void Kin2_ZigZag_Window3()
    {
        var p = P with { SmoothingWindowPoints = 3 };
        var r = KinematicsCalculator.Compute(
            FromUm(2, new[] { (0.0, 0.0), (10.0, 3.0), (20.0, 0.0), (30.0, -3.0), (40.0, 0.0) }), Cal, p);

        Assert.True(r.IsIncluded);
        var m = r.Metrics!;
        Near(104.403, m.Vcl);      // 4*sqrt(109)/0.4
        Near(100.0, m.Vsl, 1e-9);
        Near(100.499, m.Vap);      // 4*sqrt(101)/0.4
        Near(0.9578, m.Lin);
        Near(0.9950, m.Str);
        Near(0.9626, m.Wob);
        Near(1.6, m.AlhTwoXMeanDeviationUm, 1e-9);
        Near(2.5, m.BcfCrossingsPerSec, 1e-9);    // 1 sign change / 0.4 s
    }

    [Fact]
    public void Kin3_TooShort()
    {
        var r = KinematicsCalculator.Compute(
            FromUm(3, new[] { (0.0, 0.0), (5.0, 0.0), (10.0, 0.0), (15.0, 0.0) }), Cal, P);
        Assert.False(r.IsIncluded);
        Assert.Equal(ExclusionReason.TooShort, r.Exclusion);
    }

    [Fact]
    public void Kin4_Stationary_ExcludedZeroPath_NoCrash()
    {
        var pts = Enumerable.Repeat((3.0, 4.0), 10).ToArray();
        var r = KinematicsCalculator.Compute(FromUm(4, pts), Cal, P);
        Assert.False(r.IsIncluded);
        Assert.Equal(ExclusionReason.ZeroPath, r.Exclusion);
    }

    [Theory]
    [InlineData(new[] { 0, 1, 1, 2, 3, 4, 5, 6, 7, 8 })]   // duplicate frame
    [InlineData(new[] { 0, 1, 2, 3, 2, 4, 5, 6, 7, 8 })]   // goes backwards
    public void Kin5_NonMonotonicFrames(int[] frames)
    {
        var xs = frames.Select(f => f * 5.0).ToArray();
        var ys = new double[frames.Length];
        var r = KinematicsCalculator.Compute(new TrackInput(5, frames, xs, ys), Cal, P);
        Assert.False(r.IsIncluded);
        Assert.Equal(ExclusionReason.NonMonotonic, r.Exclusion);
    }

    [Fact]
    public void Kin6_LowFps_BcfNull_ButOtherMetricsComputed()
    {
        var p = P with { SmoothingWindowPoints = 3, BcfMinFps = 60 };   // fps in Cal is 10
        var r = KinematicsCalculator.Compute(
            FromUm(6, new[] { (0.0, 0.0), (10.0, 3.0), (20.0, 0.0), (30.0, -3.0), (40.0, 0.0) }), Cal, p);

        Assert.True(r.IsIncluded);
        Assert.Null(r.Metrics!.BcfCrossingsPerSec);
        Assert.Equal("FPS_TOO_LOW", r.Metrics.BcfCrossingsPerSecReason);
        Near(104.403, r.Metrics.Vcl);
    }

    [Fact]
    public void SmallGap_IsInterpolated()
    {
        // frames 0,1,3,4,5 at 5 µm per frame; frame 2 is missing (x = 10)
        var t = new TrackInput(7, new[] { 0, 1, 3, 4, 5 },
            new[] { 0.0, 5.0, 15.0, 20.0, 25.0 }, new double[5]);
        var r = KinematicsCalculator.Compute(t, Cal, P);

        Assert.True(r.IsIncluded);
        Assert.Equal(1, r.Metrics!.PointsInterpolated);
        Assert.Equal(6, r.Metrics.PointsUsed);
        Near(50, r.Metrics.Vcl, 1e-6);   // 25 µm / 0.5 s
    }

    [Fact]
    public void LargeGap_Excluded()
    {
        var t = new TrackInput(8, new[] { 0, 1, 2, 6, 7 },
            new[] { 0.0, 5.0, 10.0, 30.0, 35.0 }, new double[5]);
        var r = KinematicsCalculator.Compute(t, Cal, P);
        Assert.False(r.IsIncluded);
        Assert.Equal(ExclusionReason.GapTooLarge, r.Exclusion);
    }

    [Fact]
    public void FrameOffset_DoesNotChangeResult()
    {
        var pts = new[] { (0.0, 0.0), (10.0, 3.0), (20.0, 0.0), (30.0, -3.0), (40.0, 0.0) };
        var p = P with { SmoothingWindowPoints = 3 };
        var a = KinematicsCalculator.Compute(FromUm(9, pts, 0), Cal, p).Metrics!;
        var b = KinematicsCalculator.Compute(FromUm(9, pts, 1000), Cal, p).Metrics!;
        Near(a.Vcl, b.Vcl, 1e-9); Near(a.Vap, b.Vap, 1e-9); Near(a.AlhTwoXMeanDeviationUm, b.AlhTwoXMeanDeviationUm, 1e-9);
    }

    [Fact]
    public void PixelToMicrometreConversion_IsApplied()
    {
        // 10 px steps at 0.5 µm/px = 5 µm per frame, fps 10 -> 50 µm/s
        var cal = new Calibration(0.5, 10.0, 20.0);
        var t = new TrackInput(10, new[] { 0, 1, 2, 3, 4 },
            new[] { 0.0, 10.0, 20.0, 30.0, 40.0 }, new double[5]);
        Near(50, KinematicsCalculator.Compute(t, cal, P).Metrics!.Vcl, 1e-9);
    }

    [Theory]
    [InlineData(0.0, 10.0, 20.0)]
    [InlineData(-1.0, 10.0, 20.0)]
    [InlineData(1.0, 0.0, 20.0)]
    [InlineData(1.0, 10.0, 0.0)]
    [InlineData(double.NaN, 10.0, 20.0)]
    public void InvalidCalibration_IsExcluded_NotThrown(double umPerPx, double fps, double depth)
    {
        var r = KinematicsCalculator.Compute(Straight(11, 50), new Calibration(umPerPx, fps, depth), P);
        Assert.Equal(ExclusionReason.CalibrationInvalid, r.Exclusion);
    }

    [Fact]
    public void InvalidParameters_AreExcluded()
    {
        var r = KinematicsCalculator.Compute(Straight(12, 50), Cal, P with { SmoothingWindowPoints = 4 });
        Assert.Equal(ExclusionReason.ParametersInvalid, r.Exclusion);
    }

    [Fact]
    public void MismatchedArraysAndNaN_AreInvalidInput()
    {
        var bad1 = new TrackInput(13, new[] { 0, 1, 2, 3, 4 }, new double[5], new double[4]);
        var bad2 = new TrackInput(14, new[] { 0, 1, 2, 3, 4 },
            new[] { 0.0, 1.0, double.NaN, 3.0, 4.0 }, new double[5]);
        Assert.Equal(ExclusionReason.InvalidInput, KinematicsCalculator.Compute(bad1, Cal, P).Exclusion);
        Assert.Equal(ExclusionReason.InvalidInput, KinematicsCalculator.Compute(bad2, Cal, P).Exclusion);
        Assert.Equal(ExclusionReason.InvalidInput, KinematicsCalculator.Compute(null, Cal, P).Exclusion);
    }

    [Theory]
    [InlineData(1.0, 1.0)]
    [InlineData(0.5, 0.5)]
    [InlineData(0.0, 0.0)]
    public void NormalizeRatio_AcceptsValid(double input, double expected) =>
        Near(expected, KinematicsCalculator.NormalizeRatio(input), 1e-12);

    [Fact]
    public void NormalizeRatio_ClampsNoise_RejectsReal()
    {
        Near(1.0, KinematicsCalculator.NormalizeRatio(1.0 + 1e-12), 1e-15);
        Assert.Null(KinematicsCalculator.NormalizeRatio(1.01));
        Assert.Null(KinematicsCalculator.NormalizeRatio(-0.1));
        Assert.Null(KinematicsCalculator.NormalizeRatio(double.NaN));
    }

    [Fact]
    public void RandomTracks_NeverThrow_AndKeepInvariants()
    {
        var rng = new Random(12345);   // seeded: reproducible
        int included = 0;
        for (int t = 0; t < 500; t++)
        {
            int n = rng.Next(0, 80);
            var frames = new int[n];
            var xs = new double[n];
            var ys = new double[n];
            int f = rng.Next(-5, 5);
            for (int i = 0; i < n; i++)
            {
                f += rng.Next(100) < 5 ? rng.Next(-2, 8) : rng.Next(1, 4);
                frames[i] = f;
                xs[i] = rng.NextDouble() * 1000 - 500;
                ys[i] = rng.NextDouble() * 1000 - 500;
                if (rng.Next(500) == 0) xs[i] = double.NaN;
            }

            var r = KinematicsCalculator.Compute(new TrackInput(t, frames, xs, ys), Cal, P);

            Assert.Equal(r.IsIncluded, r.Exclusion == ExclusionReason.None);
            if (!r.IsIncluded) continue;
            included++;
            var m = r.Metrics!;
            foreach (var v in new[] { m.Vcl, m.Vsl, m.Vap, m.AlhTwoXMeanDeviationUm })
            { Assert.True(double.IsFinite(v)); Assert.True(v >= 0); }
            if (m.BcfCrossingsPerSec.HasValue)
            { Assert.True(double.IsFinite(m.BcfCrossingsPerSec.Value)); Assert.True(m.BcfCrossingsPerSec.Value >= 0); }
            foreach (var v in new[] { m.Lin, m.Str, m.Wob })
            { Assert.True(v >= 0 && v <= 1); }
            Assert.True(m.PointsUsed >= P.MinTrackPoints);
        }
        Assert.True(included > 10, $"random test exercised only {included} included tracks");
    }
}
