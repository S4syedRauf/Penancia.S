namespace Penancia.S.Domain.Kinematics;

/// <summary>
/// Coordinates are in PIXELS, exactly as the tracker service returns them.
/// Conversion to µm happens only inside KinematicsCalculator, so the calibration is applied in one place.
/// </summary>
public sealed record TrackInput(int TrackId, int[] Frames, double[] XPx, double[] YPx);

public enum ExclusionReason
{
    None, InvalidInput, CalibrationInvalid, ParametersInvalid,
    TooShort, NonMonotonic, GapTooLarge, ZeroPath, RatioOutOfRange
}

public static class ExclusionReasonExtensions
{
    public static string ToCode(this ExclusionReason r) => r switch
    {
        ExclusionReason.None => "NONE",
        ExclusionReason.InvalidInput => "INVALID_INPUT",
        ExclusionReason.CalibrationInvalid => "CALIBRATION_INVALID",
        ExclusionReason.ParametersInvalid => "PARAMETERS_INVALID",
        ExclusionReason.TooShort => "TOO_SHORT",
        ExclusionReason.NonMonotonic => "NON_MONOTONIC",
        ExclusionReason.GapTooLarge => "GAP_TOO_LARGE",
        ExclusionReason.ZeroPath => "ZERO_PATH",
        ExclusionReason.RatioOutOfRange => "RATIO_OUT_OF_RANGE",
        _ => "UNKNOWN"
    };
}

/// <summary>
/// ALH and BCF here are the project's OWN conventions, NOT standard CASA values
/// (see KinematicsConventions). They are deliberately named so they cannot be
/// mistaken for standard CASA ALH / BCF: AlhTwoXMeanDeviationUm is 2x the mean
/// distance to the smoothed path, and BcfCrossingsPerSec counts smoothed-path
/// crossings per second (roughly 2x a conventional CASA BCF, since one beat cycle
/// produces two crossings). The computed VALUES are unchanged by this rename.
/// </summary>
public sealed record TrackMetrics(
    double Vcl, double Vsl, double Vap,
    double Lin, double Str, double Wob,
    double AlhTwoXMeanDeviationUm, double? BcfCrossingsPerSec, string? BcfCrossingsPerSecReason,
    int PointsUsed, int PointsInterpolated, double DurationS);

public sealed record TrackResult
{
    public int TrackId { get; init; }
    public TrackMetrics? Metrics { get; init; }
    public ExclusionReason Exclusion { get; init; }
    public bool IsIncluded => Metrics is not null;

    public static TrackResult Ok(int id, TrackMetrics m) =>
        new() { TrackId = id, Metrics = m, Exclusion = ExclusionReason.None };
    public static TrackResult Excluded(int id, ExclusionReason r) =>
        new() { TrackId = id, Metrics = null, Exclusion = r };
}

/// <summary>
/// Printed on the report so a reader knows which convention produced the ALH and
/// BCF outputs. These are NON-STANDARD conventions: do not compare the values
/// with reference CASA instruments or the literature. The output field names
/// (AlhTwoXMeanDeviationUm, BcfCrossingsPerSec) say so explicitly.
/// </summary>
public static class KinematicsConventions
{
    public const string AlgorithmVersion = "kin-1.0";
    public const string Alh = "NON-STANDARD ALH: 2 x mean Euclidean distance between each raw point and its smoothed point (not standard CASA ALH)";
    public const string Bcf = "NON-STANDARD BCF: sign changes of the signed lateral deviation from the smoothed path (dead band applied), per second — counts path crossings, roughly 2x standard CASA BCF";
    public const string Smoothing = "centered moving average; window shrinks symmetrically at track ends so endpoints are unchanged";
}
