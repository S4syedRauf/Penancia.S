using System.Collections.Frozen;

namespace Penancia.S.Domain.Model;

/// <summary>
/// A certified sperm counting chamber backed by a verified manufacturer datasheet.
/// Depth values MUST NOT be user-typed or estimated.
/// </summary>
public sealed record ChamberType(
    string Id,
    string DisplayName,
    double DepthUm,
    string DatasheetUrl);

/// <summary>
/// A certified optical stage micrometer / calibration target backed by a verified manufacturer datasheet.
/// Pitch values MUST NOT be user-typed or estimated.
/// </summary>
public sealed record CalibrationTarget(
    string Id,
    string DisplayName,
    double PitchUm,
    string DatasheetUrl);

/// <summary>
/// Physical catalogues for Penancia.S.
/// Every entry is verified against an authoritative manufacturer datasheet URL.
/// </summary>
public static class PhysicalCatalogues
{
    // Datasheet: https://leja.nl/wp-content/uploads/2023/06/DOC-3.3-01-10-2023-04-24-Leja-slides-General-CE-User-Manual.pdf
    public static readonly ChamberType LejaSc20 = new(
        Id: "leja-sc-20-01-02-b-ce",
        DisplayName: "Leja SC 20-01-02-B-CE (20 µm 2-chamber)",
        DepthUm: 20.0,
        DatasheetUrl: "https://leja.nl/wp-content/uploads/2023/06/DOC-3.3-01-10-2023-04-24-Leja-slides-General-CE-User-Manual.pdf"
    );

    // Datasheet: https://www.vitrolife.com/products/sperm-processing/microcell--accessories/
    public static readonly ChamberType VitrolifeMicrocell20 = new(
        Id: "vitrolife-microcell-15423",
        DisplayName: "Vitrolife MicroCell REF 15423 (20 µm 2-chamber)",
        DepthUm: 20.0,
        DatasheetUrl: "https://www.vitrolife.com/products/sperm-processing/microcell--accessories/"
    );

    // Datasheet: https://www.thorlabs.com/stage-micrometers
    public static readonly CalibrationTarget ThorlabsR1L3S2P = new(
        Id: "thorlabs-r1l3s2p",
        DisplayName: "Thorlabs R1L3S2P (10 µm grid pitch, 100 lines/mm)",
        PitchUm: 10.0,
        DatasheetUrl: "https://www.thorlabs.com/stage-micrometers"
    );

    public static readonly IReadOnlyDictionary<string, ChamberType> Chambers =
        new Dictionary<string, ChamberType>(StringComparer.OrdinalIgnoreCase)
        {
            [LejaSc20.Id] = LejaSc20,
            [VitrolifeMicrocell20.Id] = VitrolifeMicrocell20,
        }.ToFrozenDictionary(StringComparer.OrdinalIgnoreCase);

    public static readonly IReadOnlyDictionary<string, CalibrationTarget> Targets =
        new Dictionary<string, CalibrationTarget>(StringComparer.OrdinalIgnoreCase)
        {
            [ThorlabsR1L3S2P.Id] = ThorlabsR1L3S2P,
        }.ToFrozenDictionary(StringComparer.OrdinalIgnoreCase);

    public static bool TryGetChamber(string? id, out ChamberType chamber)
    {
        if (string.IsNullOrWhiteSpace(id))
        {
            chamber = null!;
            return false;
        }
        return Chambers.TryGetValue(id.Trim(), out chamber!);
    }

    public static ChamberType GetChamber(string id)
    {
        if (TryGetChamber(id, out var chamber))
        {
            return chamber;
        }
        throw new KeyNotFoundException($"Unknown chamber type ID '{id}'. Only catalogue products backed by manufacturer datasheets are permitted.");
    }

    public static bool TryGetTarget(string? id, out CalibrationTarget target)
    {
        if (string.IsNullOrWhiteSpace(id))
        {
            target = null!;
            return false;
        }
        return Targets.TryGetValue(id.Trim(), out target!);
    }

    public static CalibrationTarget GetTarget(string id)
    {
        if (TryGetTarget(id, out var target))
        {
            return target;
        }
        throw new KeyNotFoundException($"Unknown calibration target ID '{id}'. Only catalogue products backed by manufacturer datasheets are permitted.");
    }
}
