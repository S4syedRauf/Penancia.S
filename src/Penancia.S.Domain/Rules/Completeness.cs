using Penancia.S.Domain.Fields;
using Penancia.S.Domain.Model;

namespace Penancia.S.Domain.Rules;

public static class Completeness
{
    public static bool IsComplete(
        IReadOnlyDictionary<string, Measurement> measurements,
        IReadOnlyList<ClinicalFlag> blockingFlags)
    {
        // 1. Any open blocking flag prevents completeness
        if (blockingFlags.Any())
            return false;

        // 2. Every required field must be Present, NotPerformed, or NotApplicable
        foreach (var def in FieldCatalog.All)
        {
            if (def.Requirement != Requirement.Required)
                continue;

            if (!measurements.TryGetValue(def.Id, out var m))
                return false;

            if (m.Status is FieldStatus.Missing or FieldStatus.Failed)
                return false;
        }

        return true;
    }
}
