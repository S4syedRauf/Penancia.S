using Penancia.S.Domain.Fields;
using Penancia.S.Domain.Model;
using Penancia.S.Domain.Parameters;

namespace Penancia.S.Domain.Resolvers;

// NOTE (2026-11-21 fix): the ZeroSpermConfirmed field was DELETED. No code path
// ever set it true — the zero-count branch returned false and so did every other
// return — so it could only ever mislead. A zero count raises
// NO_SPERM_SEEN_REVIEW; confirming azoospermia is a human review step outside
// this resolver, not a value this resolver can assert.
public sealed record ConcentrationOutcome(
    decimal? ReportedConcMillionPerMl,
    FieldStatus Status,
    Provenance? Provenance,
    IReadOnlyList<string> Flags);

public static class ConcentrationResolver
{
    public static ConcentrationOutcome Resolve(
        decimal? manualConc,
        decimal? videoConc,
        string? manualStaffId,
        DateTimeOffset? manualEnteredAt,
        string? videoModelName,
        string? videoModelVersion,
        string? videoCommit,
        ParameterSet parameters,
        IClock? clock = null)
    {
        ArgumentNullException.ThrowIfNull(parameters);
        var flags = new List<string>();

        // Range-check every input (FieldValidator hard ranges): a negative
        // concentration is impossible, not a value to compare. Invalid inputs are
        // treated as absent and flagged OUT_OF_RANGE.
        if (manualConc.HasValue && !FieldValidator.ValidateNumber("C.conc_manual_mpml", manualConc.Value).IsValid)
        {
            flags.Add("OUT_OF_RANGE");
            manualConc = null;
        }
        if (videoConc.HasValue && !FieldValidator.ValidateNumber("C.conc_video_mpml", videoConc.Value).IsValid)
        {
            flags.Add("OUT_OF_RANGE");
            videoConc = null;
        }

        // No wall-clock fallback: a manual entry time is a historical fact. If
        // neither an entry time nor an injected clock was supplied, the
        // provenance is intentionally incomplete (IsConsistent false) and is
        // flagged UNVERIFIED below — the previous DateTimeOffset.UtcNow fallback
        // invented an entry time of "now".
        DateTimeOffset? enteredAt = manualEnteredAt ?? clock?.UtcNow;

        // Zero count check
        if (manualConc.HasValue && manualConc.Value == 0m)
        {
            flags.Add("NO_SPERM_SEEN_REVIEW");
            var provZero = Provenance.Manual(manualStaffId, enteredAt);
            AddUnverifiedFlagIfInconsistent(provZero, flags);
            return new ConcentrationOutcome(0m, FieldStatus.Present, provZero, flags);
        }

        // Case 1: Manual count present (Reference Method)
        if (manualConc.HasValue)
        {
            var prov = Provenance.Manual(manualStaffId, enteredAt);
            AddUnverifiedFlagIfInconsistent(prov, flags);

            if (videoConc.HasValue)
            {
                // Relative gap = |manual - video| / manual
                decimal gap = manualConc.Value > 0
                    ? Math.Abs(manualConc.Value - videoConc.Value) / manualConc.Value
                    : (videoConc.Value > 0 ? 1.0m : 0m);

                if (gap > parameters.ConcentrationMismatchRel)
                {
                    flags.Add("CONCENTRATION_MISMATCH");
                }
            }

            return new ConcentrationOutcome(manualConc.Value, FieldStatus.Present, prov, flags);
        }

        // Case 2: Video only (Manual missing)
        if (videoConc.HasValue)
        {
            flags.Add("INCOMPLETE_MANUAL_COUNT");
            // No invented defaults: model name / version / commit are passed
            // through as supplied (null when unknown). A null here makes the
            // provenance inconsistent, which is flagged UNVERIFIED below — the
            // previous "pycasa" / "1.0" / "head" defaults were fictional and
            // passed consistency checks as if real.
            var prov = Provenance.Automated(
                videoModelName,
                videoModelVersion,
                videoCommit,
                unverified: true // Marked unverified until confirmed
            );
            AddUnverifiedFlagIfInconsistent(prov, flags);
            return new ConcentrationOutcome(videoConc.Value, FieldStatus.Present, prov, flags);
        }

        // Case 3: Neither present
        flags.Add("INCOMPLETE");
        return new ConcentrationOutcome(null, FieldStatus.Missing, null, flags);
    }

    private static void AddUnverifiedFlagIfInconsistent(Provenance prov, List<string> flags)
    {
        if (!prov.IsConsistent && !flags.Contains("UNVERIFIED"))
            flags.Add("UNVERIFIED");
    }
}
