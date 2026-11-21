using Penancia.S.Domain.Model;
using Penancia.S.Domain.Parameters;

namespace Penancia.S.Domain.Kinematics;

public static class KinematicsCalculator
{
    private const double RatioTolerance = 1e-9;     // floating-point noise allowed above 1.0
    private const double ZeroPathEpsilon = 1e-9;    // µm/s below which a path counts as zero

    /// <summary>
    /// Ratios must be within [0,1]. Noise up to 1e-9 above 1 is clamped to 1.
    /// Anything larger returns null (never silently clipped).
    /// </summary>
    public static double? NormalizeRatio(double value)
    {
        if (!double.IsFinite(value) || value < 0) return null;
        if (value > 1.0 + RatioTolerance) return null;
        return Math.Min(value, 1.0);
    }

    /// <summary>
    /// Never throws on bad data: every problem becomes an exclusion reason.
    /// No catch-all on purpose: a catch-all would hide real bugs. The orchestrator activity handles unexpected faults.
    /// </summary>
    public static TrackResult Compute(TrackInput? track, Calibration? cal, ParameterSet? p)
    {
        int id = track?.TrackId ?? -1;

        if (cal is null || !cal.IsValid) return TrackResult.Excluded(id, ExclusionReason.CalibrationInvalid);
        if (p is null || p.Validate().Count > 0) return TrackResult.Excluded(id, ExclusionReason.ParametersInvalid);
        if (track is null || track.Frames is null || track.XPx is null || track.YPx is null)
            return TrackResult.Excluded(id, ExclusionReason.InvalidInput);

        int n = track.Frames.Length;
        if (n == 0 || track.XPx.Length != n || track.YPx.Length != n)
            return TrackResult.Excluded(id, ExclusionReason.InvalidInput);
        for (int i = 0; i < n; i++)
            if (!double.IsFinite(track.XPx[i]) || !double.IsFinite(track.YPx[i]))
                return TrackResult.Excluded(id, ExclusionReason.InvalidInput);

        // K-1 eligibility (raw point count)
        if (n < p.MinTrackPoints) return TrackResult.Excluded(id, ExclusionReason.TooShort);

        // frames must strictly increase
        for (int i = 1; i < n; i++)
            if (track.Frames[i] <= track.Frames[i - 1])
                return TrackResult.Excluded(id, ExclusionReason.NonMonotonic);

        // K-2b gaps: a jump bigger than MaxFrameStep frame numbers is too large to interpolate
        for (int i = 1; i < n; i++)
            if ((long)track.Frames[i] - track.Frames[i - 1] > p.MaxFrameStep)
                return TrackResult.Excluded(id, ExclusionReason.GapTooLarge);

        // K-2: build a uniform per-frame path in µm, linearly interpolating small gaps
        int m = (int)((long)track.Frames[n - 1] - track.Frames[0] + 1);
        var xs = new double[m];
        var ys = new double[m];
        int k = 0;
        for (int i = 0; i < n - 1; i++)
        {
            int step = track.Frames[i + 1] - track.Frames[i];
            for (int j = 0; j < step; j++)
            {
                double f = (double)j / step;
                xs[k] = (track.XPx[i] + (track.XPx[i + 1] - track.XPx[i]) * f) * cal.UmPerPx;
                ys[k] = (track.YPx[i] + (track.YPx[i + 1] - track.YPx[i]) * f) * cal.UmPerPx;
                k++;
            }
        }
        xs[k] = track.XPx[n - 1] * cal.UmPerPx;
        ys[k] = track.YPx[n - 1] * cal.UmPerPx;

        double durationS = (m - 1) / cal.Fps;

        // K-3 smoothing: centered moving average, half-width min(h, i, m-1-i)
        int h = (p.SmoothingWindowPoints - 1) / 2;
        var sx = new double[m];
        var sy = new double[m];
        for (int i = 0; i < m; i++)
        {
            int hw = Math.Min(h, Math.Min(i, m - 1 - i));
            double ax = 0, ay = 0;
            for (int j = i - hw; j <= i + hw; j++) { ax += xs[j]; ay += ys[j]; }
            int cnt = 2 * hw + 1;
            sx[i] = ax / cnt;
            sy[i] = ay / cnt;
        }

        // K-4, K-5, K-5b
        double vcl = PathLength(xs, ys) / durationS;
        double vsl = Math.Sqrt(Sq(xs[m - 1] - xs[0]) + Sq(ys[m - 1] - ys[0])) / durationS;
        double vap = PathLength(sx, sy) / durationS;

        // K-6 ratios.
        // REMAINING VERIFICATION (do NOT change without evidence): a zero-path
        // (immotile) track is Excluded here. If downstream motility percentages
        // use included tracks only, immotile sperm would be undercounted. Confirm
        // with the clinical lead whether zero-path tracks must instead be counted
        // as immotile; until that is decided, exclusion is the recorded behaviour.
        if (vcl < ZeroPathEpsilon || vap < ZeroPathEpsilon)
            return TrackResult.Excluded(id, ExclusionReason.ZeroPath);
        double? lin = NormalizeRatio(vsl / vcl);
        double? str = NormalizeRatio(vsl / vap);
        double? wob = NormalizeRatio(vap / vcl);
        if (lin is null || str is null || wob is null)
            return TrackResult.Excluded(id, ExclusionReason.RatioOutOfRange);

        // K-7 ALH (project convention: 2x mean deviation — NOT standard CASA ALH;
        // see TrackMetrics / KinematicsConventions). Values unchanged by the rename.
        double devSum = 0;
        for (int i = 0; i < m; i++) devSum += Math.Sqrt(Sq(xs[i] - sx[i]) + Sq(ys[i] - sy[i]));
        double alhTwoXMeanDeviationUm = 2.0 * devSum / m;

        // K-7 / K-8 BCF (project convention: smoothed-path crossings per second —
        // NOT standard CASA BCF; see TrackMetrics / KinematicsConventions).
        var (bcfCrossingsPerSec, bcfCrossingsPerSecReason) = ComputeBcfCrossingsPerSec(xs, ys, sx, sy, durationS, cal, p);

        double[] check = { vcl, vsl, vap, lin.Value, str.Value, wob.Value, alhTwoXMeanDeviationUm };
        if (check.Any(v => !double.IsFinite(v)))
            return TrackResult.Excluded(id, ExclusionReason.InvalidInput);
        if (bcfCrossingsPerSec.HasValue && !double.IsFinite(bcfCrossingsPerSec.Value))
            return TrackResult.Excluded(id, ExclusionReason.InvalidInput);

        return TrackResult.Ok(id, new TrackMetrics(
            vcl, vsl, vap, lin.Value, str.Value, wob.Value, alhTwoXMeanDeviationUm, bcfCrossingsPerSec, bcfCrossingsPerSecReason,
            PointsUsed: m, PointsInterpolated: m - n, DurationS: durationS));
    }

    private static (double? Value, string? Reason) ComputeBcfCrossingsPerSec(
        double[] xs, double[] ys, double[] sx, double[] sy,
        double durationS, Calibration cal, ParameterSet p)
    {
        if (cal.Fps < p.BcfMinFps) return (null, "FPS_TOO_LOW");   // K-8

        int m = xs.Length;
        int crossings = 0;
        int lastSign = 0;
        for (int i = 0; i < m; i++)
        {
            // tangent of the smoothed path: central difference, one-sided at the ends
            int a = i == 0 ? 0 : i - 1;
            int b = i == m - 1 ? m - 1 : i + 1;
            double tx = sx[b] - sx[a], ty = sy[b] - sy[a];
            double norm = Math.Sqrt(tx * tx + ty * ty);
            if (norm < ZeroPathEpsilon) continue;

            double vx = xs[i] - sx[i], vy = ys[i] - sy[i];
            double d = (tx * vy - ty * vx) / norm;           // signed lateral deviation (µm)
            if (Math.Abs(d) < p.BcfDeadBandUm) continue;     // inside dead band: keep previous sign

            int sign = d > 0 ? 1 : -1;
            if (lastSign != 0 && sign != lastSign) crossings++;
            lastSign = sign;
        }
        return (crossings / durationS, null);
    }

    private static double Sq(double v) => v * v;

    private static double PathLength(double[] x, double[] y)
    {
        double sum = 0;
        for (int i = 0; i < x.Length - 1; i++)
            sum += Math.Sqrt(Sq(x[i + 1] - x[i]) + Sq(y[i + 1] - y[i]));
        return sum;
    }
}
