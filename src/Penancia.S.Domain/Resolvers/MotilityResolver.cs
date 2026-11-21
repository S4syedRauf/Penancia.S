using Penancia.S.Domain.Fields;
using Penancia.S.Domain.Model;
using Penancia.S.Domain.Parameters;

namespace Penancia.S.Domain.Resolvers;

public sealed record TrackerMotility(decimal PrPct, decimal NpPct, decimal ImPct, int NCells);

public sealed record TrackerResult(
    string TrackerName,
    bool Succeeded,
    TrackerMotility? Motility,
    string? ErrorCode,
    string? ModelName,
    string? ModelVersion,
    string? RepoCommit);

public enum MotilityAgreementStatus
{
    Agreed,
    Disagree,
    SingleTracker,
    Failed
}

public sealed record ReviewDecision(
    string Action,                     // "AcceptPrimary" | "AcceptFallback" | "ManualValue"
    string ReviewerId,
    decimal? ManualPrPct = null,
    decimal? ManualNpPct = null,
    decimal? ManualImPct = null);

public sealed record MotilityOutcome(
    MotilityAgreementStatus Status,
    bool IsReportable,
    decimal? PrPct,
    decimal? NpPct,
    decimal? ImPct,
    decimal? TotalMotilityPct,
    Provenance? Provenance,
    IReadOnlyList<string> Flags,
    string? ReviewTaskRequired);

public static class MotilityResolver
{
    public static MotilityOutcome Resolve(TrackerResult? primary, TrackerResult? fallback, ParameterSet parameters)
    {
        ArgumentNullException.ThrowIfNull(parameters);
        var flags = new List<string>();

        bool primaryUsable = IsTrackerUsable(primary, parameters, out string? primaryErr);
        bool fallbackUsable = IsTrackerUsable(fallback, parameters, out string? fallbackErr);

        if (primaryUsable && primary?.Motility != null && primary.Motility.NCells < parameters.MinCellsMotility)
        {
            flags.Add("LOW_CELL_COUNT");
        }

        // Case 1: Both usable
        if (primaryUsable && fallbackUsable && primary?.Motility != null && fallback?.Motility != null)
        {
            decimal deltaPr = Math.Abs(primary.Motility.PrPct - fallback.Motility.PrPct);
            decimal deltaTm = Math.Abs((primary.Motility.PrPct + primary.Motility.NpPct) - (fallback.Motility.PrPct + fallback.Motility.NpPct));

            if (deltaPr <= parameters.MotilityAgreementPp && deltaTm <= parameters.MotilityAgreementPp)
            {
                // Agreed: report primary values. No invented defaults: model
                // name / version / commit are passed through as supplied (null
                // when unknown); a missing value makes the provenance
                // inconsistent and is flagged UNVERIFIED below. The previous
                // "pycasa" / "1.0" / "head" defaults were fictional.
                var prov = Provenance.Automated(primary.ModelName, primary.ModelVersion, primary.RepoCommit, unverified: false);
                if (!prov.IsConsistent && !flags.Contains("UNVERIFIED"))
                    flags.Add("UNVERIFIED");
                decimal tm = primary.Motility.PrPct + primary.Motility.NpPct;
                return new MotilityOutcome(MotilityAgreementStatus.Agreed, true, primary.Motility.PrPct, primary.Motility.NpPct, primary.Motility.ImPct, tm, prov, flags, null);
            }

            // Disagree
            flags.Add("TRACKERS_DISAGREE");
            return new MotilityOutcome(MotilityAgreementStatus.Disagree, false, null, null, null, null, null, flags, "MotilityDisagreement");
        }

        // Case 2: Primary usable, fallback failed/unusable
        if (primaryUsable && primary?.Motility != null)
        {
            flags.Add("SINGLE_TRACKER");
            return new MotilityOutcome(MotilityAgreementStatus.SingleTracker, false, null, null, null, null, null, flags, "MotilityConfirm");
        }

        // Case 3: Primary failed, fallback usable
        if (fallbackUsable && fallback?.Motility != null)
        {
            flags.Add("SINGLE_TRACKER");
            flags.Add("MODEL_FALLBACK_USED");
            return new MotilityOutcome(MotilityAgreementStatus.SingleTracker, false, null, null, null, null, null, flags, "MotilityConfirm");
        }

        // Case 4: Both failed
        flags.Add("INCOMPLETE");
        return new MotilityOutcome(MotilityAgreementStatus.Failed, false, null, null, null, null, null, flags, null);
    }

    public static MotilityOutcome ApplyReview(MotilityOutcome original, ReviewDecision decision, TrackerResult? primary, TrackerResult? fallback, IClock? clock = null, ParameterSet? parameters = null)
    {
        ArgumentNullException.ThrowIfNull(original);
        ArgumentNullException.ThrowIfNull(decision);

        // Accepting a value on review must NOT drop the original flags
        // (previously every accept returned Array.Empty<string>(), silently
        // discarding e.g. LOW_CELL_COUNT). Accepted outcomes keep the original
        // flags; the review itself is recorded in the provenance.
        if (decision.Action == "AcceptPrimary" && primary?.Motility != null)
        {
            var prov = new Provenance(SourceKind.Automated, primary.ModelName, primary.ModelVersion, primary.RepoCommit, null, null, null, true, decision.ReviewerId, false);
            decimal tm = primary.Motility.PrPct + primary.Motility.NpPct;
            return new MotilityOutcome(MotilityAgreementStatus.Agreed, true, primary.Motility.PrPct, primary.Motility.NpPct, primary.Motility.ImPct, tm, prov, original.Flags, null);
        }

        if (decision.Action == "AcceptFallback" && fallback?.Motility != null)
        {
            var prov = new Provenance(SourceKind.Automated, fallback.ModelName, fallback.ModelVersion, fallback.RepoCommit, null, null, null, true, decision.ReviewerId, false);
            decimal tm = fallback.Motility.PrPct + fallback.Motility.NpPct;
            return new MotilityOutcome(MotilityAgreementStatus.Agreed, true, fallback.Motility.PrPct, fallback.Motility.NpPct, fallback.Motility.ImPct, tm, prov, original.Flags, null);
        }

        if (decision.Action == "ManualValue" && decision.ManualPrPct.HasValue && decision.ManualNpPct.HasValue && decision.ManualImPct.HasValue)
        {
            // Range-check each manual component (0–100); the sum check alone
            // cannot catch e.g. PR=-10, NP=60, IM=50.
            bool inRange =
                FieldValidator.ValidateNumber("D.pr_pct", decision.ManualPrPct.Value).IsValid &&
                FieldValidator.ValidateNumber("D.np_pct", decision.ManualNpPct.Value).IsValid &&
                FieldValidator.ValidateNumber("D.im_pct", decision.ManualImPct.Value).IsValid;
            if (!inRange)
            {
                return original with { Flags = new List<string>(original.Flags) { "OUT_OF_RANGE" } };
            }

            decimal sum = decision.ManualPrPct.Value + decision.ManualNpPct.Value + decision.ManualImPct.Value;
            decimal tolerance = parameters?.PercentSumTolerancePp ?? ParameterSet.Placeholder.PercentSumTolerancePp;
            if (Math.Abs(sum - 100m) > tolerance)
            {
                return original with { Flags = new List<string>(original.Flags) { "PERCENT_SUM_INVALID" } };
            }

            // The review happens now: prefer the injected clock; the wall clock
            // is only a last resort when no clock was injected.
            var prov = new Provenance(SourceKind.Manual, null, null, null, decision.ReviewerId, clock?.UtcNow ?? DateTimeOffset.UtcNow, null, true, decision.ReviewerId, false);
            decimal tm = decision.ManualPrPct.Value + decision.ManualNpPct.Value;
            return new MotilityOutcome(MotilityAgreementStatus.Agreed, true, decision.ManualPrPct.Value, decision.ManualNpPct.Value, decision.ManualImPct.Value, tm, prov, original.Flags, null);
        }

        return original;
    }

    private static bool IsTrackerUsable(TrackerResult? result, ParameterSet parameters, out string? reason)
    {
        if (result == null || !result.Succeeded || result.Motility == null)
        {
            reason = result?.ErrorCode ?? "TRACKER_FAILED";
            return false;
        }

        // Range-check every component (0–100) and the cell count (>= 0). The sum
        // check alone cannot catch e.g. PR=-10, NP=60, IM=50, which sums to 100.
        var m = result.Motility;
        if (m.NCells < 0 ||
            !FieldValidator.ValidateNumber("D.pr_pct", m.PrPct).IsValid ||
            !FieldValidator.ValidateNumber("D.np_pct", m.NpPct).IsValid ||
            !FieldValidator.ValidateNumber("D.im_pct", m.ImPct).IsValid)
        {
            reason = "OUT_OF_RANGE";
            return false;
        }

        decimal sum = m.PrPct + m.NpPct + m.ImPct;
        if (Math.Abs(sum - 100.0m) > parameters.PercentSumTolerancePp)
        {
            reason = "PERCENT_SUM_INVALID";
            return false;
        }

        reason = null;
        return true;
    }
}
