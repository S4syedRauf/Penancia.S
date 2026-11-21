using Penancia.S.Domain.Kinematics;
using Penancia.S.Domain.Model;
using Penancia.S.Domain.Parameters;
using Xunit;

namespace Penancia.S.Tests;

internal sealed class FixedClock : IClock
{
    public FixedClock(DateTimeOffset now) => UtcNow = now;
    public DateTimeOffset UtcNow { get; }
}

internal static class TestSupport
{
    // µm per px = 1, fps = 10, chamber depth 20 µm (the spec's test settings)
    public static readonly Calibration Cal = new(1.0, 10.0, 20.0);

    // spec settings: min_track_points = 5, bcf_min_fps = 10
    public static readonly ParameterSet P = ParameterSet.Placeholder with { MinTrackPoints = 5, BcfMinFps = 10 };

    /// <summary>
    /// Track from µm points (valid because UmPerPx = 1), frames start at startFrame.
    /// </summary>
    public static TrackInput FromUm(int id, (double X, double Y)[] pts, int startFrame = 0) =>
        new(id,
            Enumerable.Range(startFrame, pts.Length).ToArray(),
            pts.Select(q => q.X).ToArray(),
            pts.Select(q => q.Y).ToArray());

    /// <summary>
    /// Straight line at a given speed (µm/s) at fps = 10.
    /// </summary>
    public static TrackInput Straight(int id, double speedUmPerS, int n = 10)
    {
        double step = speedUmPerS / 10.0;
        return FromUm(id, Enumerable.Range(0, n).Select(i => (i * step, 0.0)).ToArray());
    }

    public static void Near(double expected, double? actual, double tol = 1e-3)
    {
        Assert.NotNull(actual);
        Assert.True(Math.Abs(expected - actual!.Value) <= tol,
            $"expected {expected} but got {actual} (tolerance {tol})");
    }
}
