using Penancia.S.Domain.Parameters;

namespace Penancia.S.Domain.Kinematics;

public sealed record MetricStats(int N, double Mean, double? Sd, double Median);

public sealed record KinematicsSummary(
    int TracksUsed,
    int TracksExcluded,
    IReadOnlyDictionary<ExclusionReason, int> ExclusionCounts,
    MetricStats? Vcl, MetricStats? Vsl, MetricStats? Vap,
    MetricStats? Lin, MetricStats? Str, MetricStats? Wob,
    MetricStats? AlhTwoXMeanDeviationUm, MetricStats? BcfCrossingsPerSec,
    string? BcfCrossingsPerSecUnavailableReason,
    bool LowCellCount);

public static class KinematicsAggregator
{
    /// <summary>
    /// Each included track counts once (equal weighting). SD is the sample SD (n-1), null when n = 1.
    /// </summary>
    public static KinematicsSummary Aggregate(IEnumerable<TrackResult>? results, ParameterSet p)
    {
        ArgumentNullException.ThrowIfNull(p);

        var list = (results ?? Enumerable.Empty<TrackResult>()).ToList();
        var included = list.Where(r => r.IsIncluded).Select(r => r.Metrics!).ToList();

        var counts = list.Where(r => !r.IsIncluded)
            .GroupBy(r => r.Exclusion)
            .OrderBy(g => g.Key)
            .ToDictionary(g => g.Key, g => g.Count());

        var bcfValues = included.Where(t => t.BcfCrossingsPerSec.HasValue).Select(t => t.BcfCrossingsPerSec!.Value).ToList();
        string? bcfReason = null;
        if (bcfValues.Count == 0 && included.Count > 0)
            bcfReason = included.Select(t => t.BcfCrossingsPerSecReason).FirstOrDefault(r => r is not null) ?? "NO_BCF_VALUES";

        return new KinematicsSummary(
            TracksUsed: included.Count,
            TracksExcluded: list.Count - included.Count,
            ExclusionCounts: counts,
            Vcl: Stats(included.Select(t => t.Vcl).ToList()),
            Vsl: Stats(included.Select(t => t.Vsl).ToList()),
            Vap: Stats(included.Select(t => t.Vap).ToList()),
            Lin: Stats(included.Select(t => t.Lin).ToList()),
            Str: Stats(included.Select(t => t.Str).ToList()),
            Wob: Stats(included.Select(t => t.Wob).ToList()),
            AlhTwoXMeanDeviationUm: Stats(included.Select(t => t.AlhTwoXMeanDeviationUm).ToList()),
            BcfCrossingsPerSec: Stats(bcfValues),
            BcfCrossingsPerSecUnavailableReason: bcfReason,
            LowCellCount: included.Count < p.MinCellsMotility);
    }

    private static MetricStats? Stats(IReadOnlyList<double> v)
    {
        if (v.Count == 0) return null;
        double mean = v.Average();
        double? sd = null;
        if (v.Count > 1) sd = Math.Sqrt(v.Sum(x => (x - mean) * (x - mean)) / (v.Count - 1));

        var sorted = v.OrderBy(x => x).ToList();
        int mid = sorted.Count / 2;
        double median = sorted.Count % 2 == 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2.0;
        return new MetricStats(v.Count, mean, sd, median);
    }
}
