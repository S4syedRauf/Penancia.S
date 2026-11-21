using Penancia.S.Domain.Model;
using Penancia.S.Domain.Parameters;

namespace Penancia.S.Domain.Resolvers;

public enum CanonicalHeadClass
{
    Normal,
    Abnormal,
    Unusable
}

public sealed record CellResult(
    int CellId,
    string MadrnetLabel,
    string CbamLabel,
    string? MorphologistLabel = null);

public sealed record MorphologyOutcome(
    decimal? NormalFormsPct,
    FieldStatus Status,
    int TotalClassified,
    int TotalNormal,
    int TotalAbnormal,
    int TotalUnusable,
    int TotalReviewRequired,
    IReadOnlyList<string> Flags,
    bool RequiresReview);

public static class MorphologyResolver
{
    // MAPPING STATUS — UNVERIFIED (2026-11-21): the MADRNet / CBAM model class
    // lists are NOT in this repo (models/ contains only shared/contract.py and
    // video-qc/worker.py; no morphology model worker or class list). The mappings
    // below are conservative: only the classes named here map to Normal/Abnormal
    // and every other label maps to Unusable (excluded from the percentage, never
    // counted as abnormal). VERIFY both mappings against the real model class
    // lists before relying on them — see the remaining item in the fix report.
    // Labels are null-tolerant: a null/blank label maps to Unusable, never throws.
    public static CanonicalHeadClass MapMadrnet(string? label) => string.IsNullOrWhiteSpace(label) ? CanonicalHeadClass.Unusable : label.ToLowerInvariant() switch
    {
        "normal" => CanonicalHeadClass.Normal,
        "tapered" or "pyriform" or "amorphous" => CanonicalHeadClass.Abnormal,
        _ => CanonicalHeadClass.Unusable
    };

    public static CanonicalHeadClass MapCbam(string? label) => string.IsNullOrWhiteSpace(label) ? CanonicalHeadClass.Unusable : label.ToLowerInvariant() switch
    {
        "normal" => CanonicalHeadClass.Normal,
        "abnormal" => CanonicalHeadClass.Abnormal,
        _ => CanonicalHeadClass.Unusable
    };

    public static MorphologyOutcome Resolve(IEnumerable<CellResult> cells, ParameterSet parameters)
    {
        ArgumentNullException.ThrowIfNull(cells);
        ArgumentNullException.ThrowIfNull(parameters);
        var flags = new List<string>();
        int normal = 0;
        int abnormal = 0;
        int unusable = 0;
        int reviewRequired = 0;

        foreach (var cell in cells)
        {
            // A null cell entry carries no classification; count it unusable.
            if (cell is null)
            {
                unusable++;
                continue;
            }

            if (!string.IsNullOrWhiteSpace(cell.MorphologistLabel))
            {
                var morphDecision = cell.MorphologistLabel.ToLowerInvariant() switch
                {
                    "normal" => CanonicalHeadClass.Normal,
                    "abnormal" => CanonicalHeadClass.Abnormal,
                    _ => CanonicalHeadClass.Unusable
                };

                if (morphDecision == CanonicalHeadClass.Normal) normal++;
                else if (morphDecision == CanonicalHeadClass.Abnormal) abnormal++;
                else unusable++;
                continue;
            }

            var cMadr = MapMadrnet(cell.MadrnetLabel);
            var cCbam = MapCbam(cell.CbamLabel);

            if (cMadr == CanonicalHeadClass.Unusable || cCbam == CanonicalHeadClass.Unusable)
            {
                unusable++;
            }
            else if (cMadr == CanonicalHeadClass.Normal && cCbam == CanonicalHeadClass.Normal)
            {
                normal++;
            }
            else if (cMadr == CanonicalHeadClass.Abnormal && cCbam == CanonicalHeadClass.Abnormal)
            {
                abnormal++;
            }
            else
            {
                reviewRequired++;
            }
        }

        // The review flag is scoped to the cells it applies to: it is emitted
        // ONLY when at least one cell disagrees between the models, so a flag
        // named "review required" never appears on a result with
        // RequiresReview == false. (Midpiece/tail review is a separate manual
        // field, E.midpiece_tail_review — it is not this flag.)
        if (reviewRequired > 0)
            flags.Add("MANUAL_REVIEW_REQUIRED");

        int classified = normal + abnormal;

        // A minority of disagreeing cells no longer blocks the whole result:
        // the agreed percentage is reported over the agreed cells, with the
        // review flag and RequiresReview == true. Only when NOTHING was agreed
        // (classified == 0) is the result Missing.
        if (classified < parameters.MinCellsMorphology)
        {
            flags.Add("LOW_CELL_COUNT");
        }

        if (classified == 0)
        {
            flags.Add("INCOMPLETE");
            return new MorphologyOutcome(null, FieldStatus.Missing, 0, 0, 0, unusable, reviewRequired, flags, reviewRequired > 0);
        }

        decimal pct = Math.Round(((decimal)normal / classified) * 100m, 1, MidpointRounding.AwayFromZero);
        return new MorphologyOutcome(pct, FieldStatus.Present, classified, normal, abnormal, unusable, reviewRequired, flags, reviewRequired > 0);
    }
}
