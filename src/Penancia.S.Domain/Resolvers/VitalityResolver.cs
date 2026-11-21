using Penancia.S.Domain.Fields;
using Penancia.S.Domain.Model;
using Penancia.S.Domain.Parameters;

namespace Penancia.S.Domain.Resolvers;

public sealed record VitalityOutcome(
    decimal? VitalityPct,
    FieldStatus Status,
    Provenance? Provenance,
    IReadOnlyList<string> Flags);

public static class VitalityResolver
{
    public static VitalityOutcome Resolve(
        decimal? openCasaVitality,
        bool openCasaSucceeded,
        decimal? manualVitality,
        string? manualStaffId,
        DateTimeOffset? manualEnteredAt,
        decimal? totalMotilityPct,
        ParameterSet parameters,
        IClock? clock = null)
    {
        ArgumentNullException.ThrowIfNull(parameters);
        var flags = new List<string>();

        // Range-check every input against the catalog hard range (0–100%). The
        // manual branch previously had no check at all while the OpenCASA branch
        // did. Out-of-range inputs are ignored and flagged OUT_OF_RANGE.
        if (manualVitality.HasValue && !FieldValidator.ValidateNumber("F.vitality_pct", manualVitality.Value).IsValid)
        {
            flags.Add("OUT_OF_RANGE");
            manualVitality = null;
        }
        if (openCasaVitality.HasValue && !FieldValidator.ValidateNumber("F.vitality_pct", openCasaVitality.Value).IsValid)
        {
            flags.Add("OUT_OF_RANGE");
            openCasaVitality = null;
        }
        if (totalMotilityPct.HasValue && !FieldValidator.ValidateNumber("D.total_motility_pct", totalMotilityPct.Value).IsValid)
        {
            flags.Add("OUT_OF_RANGE");
            totalMotilityPct = null;
        }

        decimal? finalVitality = null;
        Provenance? prov = null;

        // Manual override or fallback. No invented staff id or entry time: an
        // unknown enterer/timestamp leaves the provenance intentionally
        // incomplete (flagged UNVERIFIED below).
        if (manualVitality.HasValue)
        {
            finalVitality = manualVitality.Value;
            prov = Provenance.Manual(manualStaffId, manualEnteredAt ?? clock?.UtcNow);
        }
        else if (openCasaSucceeded && openCasaVitality.HasValue)
        {
            finalVitality = openCasaVitality.Value;
            // Version/commit are NOT recorded for the OpenCASA run (the previous
            // "ImageJ-headless" / "head" values were fictional placeholders), so
            // the provenance is intentionally incomplete until the manifest pins
            // the real version and commit. Unverified until manifest approval.
            prov = Provenance.Automated(
                "OpenCASA",
                null,
                null,
                unverified: true
            );
        }

        if (prov is { IsConsistent: false } && !flags.Contains("UNVERIFIED"))
            flags.Add("UNVERIFIED");

        if (!finalVitality.HasValue)
        {
            flags.Add("INCOMPLETE");
            return new VitalityOutcome(null, FieldStatus.Missing, null, flags);
        }

        // Rule X-1: Total motility cannot exceed vitality + tolerance
        if (totalMotilityPct.HasValue && finalVitality.HasValue)
        {
            if (totalMotilityPct.Value > (finalVitality.Value + parameters.MotilityVitalityTolerancePp))
            {
                flags.Add("MOTILITY_EXCEEDS_VITALITY");
            }
        }

        return new VitalityOutcome(finalVitality.Value, FieldStatus.Present, prov, flags);
    }
}
