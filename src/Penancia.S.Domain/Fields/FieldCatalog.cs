namespace Penancia.S.Domain.Fields;

public static class FieldCatalog
{
    private static FieldDefinition Def(string id, string label, FieldKind kind, string? unit,
        FieldOrigin origin, string by, Requirement req)
    {
        // Validate the ID BEFORE parsing: a mistyped ID (e.g. "Z.foo" or "volume")
        // used to throw a cryptic Enum.Parse / Substring exception during static
        // initialization. It still fails fast at static init, but now with a
        // clear, actionable message naming the bad ID.
        if (string.IsNullOrWhiteSpace(id) || id.Length < 3 || id[1] != '.' ||
            !Enum.TryParse<Section>(id.Substring(0, 1), out var section))
        {
            throw new ArgumentException(
                $"Invalid field id '{id}': expected '<section>.<name>' with section A-J.", nameof(id));
        }
        return new(id, section, label, kind, unit, origin, by, req);
    }

    private static FieldDefinition Manual(string id, string label, FieldKind kind, string? unit, string by, Requirement req) =>
        Def(id, label, kind, unit, FieldOrigin.Manual, by, req);
    private static FieldDefinition Auto(string id, string label, FieldKind kind, string? unit, string by, Requirement req) =>
        Def(id, label, kind, unit, FieldOrigin.Automated, by, req);
    private static FieldDefinition Derived(string id, string label, FieldKind kind, string? unit, string by, Requirement req) =>
        Def(id, label, kind, unit, FieldOrigin.Derived, by, req);
    private static FieldDefinition Mixed(string id, string label, FieldKind kind, string? unit, string by, Requirement req) =>
        Def(id, label, kind, unit, FieldOrigin.Mixed, by, req);

    private const string Pct = "%";

    // Hard ranges reject only IMPOSSIBLE entries. Abnormal-but-possible values are never rejected.
    // All hard ranges and display precisions are placeholders for clinical review.
    public static readonly IReadOnlyList<FieldDefinition> All = new List<FieldDefinition>
    {
        // ---- A: patient and sample ----
        Manual("A.patient_ref", "Patient reference", FieldKind.Text, null, "Staff", Requirement.Required),
        Manual("A.collection_datetime", "Collection date and time", FieldKind.DateTime, null, "Staff", Requirement.Required)
            with { Note = "Must not be in the future (FieldValidator.ValidateNotFuture)." },
        Manual("A.abstinence_days", "Abstinence period", FieldKind.Integer, "days", "Staff", Requirement.Required)
            with { HardMin = 0, HardMax = 60, DisplayDecimals = 0 },
        Manual("A.collection_complete", "Collection complete", FieldKind.Enum, null, "Staff", Requirement.Required)
            with { AllowedValues = new[] { "Yes", "No", "Unknown" } },

        // ---- B: macroscopic ----
        Manual("B.volume_ml", "Volume", FieldKind.Decimal, "mL", "Technician", Requirement.Required)
            with { HardMin = 0, HardMax = 20, DisplayDecimals = 1 },
        Manual("B.ph", "pH", FieldKind.Decimal, null, "Technician", Requirement.Required)
            with { HardMin = 0, HardMax = 14, DisplayDecimals = 1 },
        Manual("B.liquefaction_min", "Liquefaction time", FieldKind.Integer, "min", "Technician", Requirement.Required)
            with { HardMin = 0, HardMax = 1440, DisplayDecimals = 0 },
        Manual("B.viscosity", "Viscosity", FieldKind.Enum, null, "Technician", Requirement.Required)
            with { AllowedValues = new[] { "Normal", "Increased" } },
        Manual("B.appearance", "Appearance", FieldKind.Enum, null, "Technician", Requirement.Required)
            with { Note = "Allowed values to be defined by the clinical lead." },

        // ---- C: concentration ----
        Manual("C.conc_manual_mpml", "Concentration (manual chamber count)", FieldKind.Decimal, "million/mL", "Technician", Requirement.Conditional)
            with { HardMin = 0, DisplayDecimals = 1, Note = "One of manual or video concentration is required." },
        Auto("C.conc_video_mpml", "Concentration (video)", FieldKind.Decimal, "million/mL", "pycasa", Requirement.Conditional)
            with { HardMin = 0, DisplayDecimals = 1, Note = "One of manual or video concentration is required." },
        Derived("C.conc_reported_mpml", "Concentration (reported)", FieldKind.Decimal, "million/mL", "ConcentrationResolver", Requirement.Required)
            with { DisplayDecimals = 1 },
        Derived("C.total_number_million", "Total sperm number", FieldKind.Decimal, "million", "Volume x reported concentration", Requirement.Required)
            with { DisplayDecimals = 1 },
        Auto("C.debris_fraction", "Debris fraction", FieldKind.Decimal, "fraction", "ACTIVE", Requirement.Optional)
            with { HardMin = 0, HardMax = 1, DisplayDecimals = 2 },

        // ---- D: motility and kinematics ----
        Mixed("D.pr_pct", "Progressive motility (PR)", FieldKind.Decimal, Pct, "MotilityResolver", Requirement.Required)
            with { HardMin = 0, HardMax = 100, DisplayDecimals = 0 },
        Mixed("D.np_pct", "Non-progressive motility (NP)", FieldKind.Decimal, Pct, "MotilityResolver", Requirement.Required)
            with { HardMin = 0, HardMax = 100, DisplayDecimals = 0 },
        Mixed("D.im_pct", "Immotile (IM)", FieldKind.Decimal, Pct, "MotilityResolver", Requirement.Required)
            with { HardMin = 0, HardMax = 100, DisplayDecimals = 0 },
        Derived("D.total_motility_pct", "Total motility (PR+NP)", FieldKind.Decimal, Pct, "D.pr_pct + D.np_pct", Requirement.Required)
            with { DisplayDecimals = 0 },
        Auto("D.vcl", "VCL", FieldKind.Decimal, "µm/s", "Kinematics", Requirement.Conditional)
            with { HardMin = 0, DisplayDecimals = 1, Note = "Required if tracks exist." },
        Auto("D.vsl", "VSL", FieldKind.Decimal, "µm/s", "Kinematics", Requirement.Conditional)
            with { HardMin = 0, DisplayDecimals = 1, Note = "Required if tracks exist." },
        Auto("D.vap", "VAP", FieldKind.Decimal, "µm/s", "Kinematics", Requirement.Conditional)
            with { HardMin = 0, DisplayDecimals = 1, Note = "Required if tracks exist." },
        Auto("D.lin", "LIN", FieldKind.Decimal, "ratio", "Kinematics", Requirement.Conditional)
            with { HardMin = 0, HardMax = 1, DisplayDecimals = 2, Note = "Required if tracks exist." },
        Auto("D.str", "STR", FieldKind.Decimal, "ratio", "Kinematics", Requirement.Conditional)
            with { HardMin = 0, HardMax = 1, DisplayDecimals = 2, Note = "Required if tracks exist." },
        Auto("D.wob", "WOB", FieldKind.Decimal, "ratio", "Kinematics", Requirement.Conditional)
            with { HardMin = 0, HardMax = 1, DisplayDecimals = 2, Note = "Required if tracks exist." },
        Auto("D.alh", "ALH (2x mean deviation, non-standard)", FieldKind.Decimal, "µm", "Kinematics", Requirement.Conditional)
            with { HardMin = 0, DisplayDecimals = 1, Note = "Required if tracks exist. Project convention, NOT standard CASA ALH — see KinematicsConventions." },
        Auto("D.bcf", "BCF (path crossings/s, non-standard)", FieldKind.Decimal, "Hz", "Kinematics", Requirement.Optional)
            with { HardMin = 0, DisplayDecimals = 1, Note = "Null when fps is too low (rule K-8). Project convention, NOT standard CASA BCF — see KinematicsConventions." },
        Auto("D.tracks_used", "Tracks used", FieldKind.Integer, "tracks", "Kinematics", Requirement.Required)
            with { HardMin = 0, DisplayDecimals = 0 },
        Auto("D.tracks_excluded", "Tracks excluded", FieldKind.Integer, "tracks", "Kinematics", Requirement.Required)
            with { HardMin = 0, DisplayDecimals = 0 },

        // ---- E: morphology ----
        Mixed("E.normal_forms_pct", "Normal forms", FieldKind.Decimal, Pct, "MorphologyResolver", Requirement.Required)
            with { HardMin = 0, HardMax = 100, DisplayDecimals = 0 },
        Mixed("E.head_counts", "Head class counts", FieldKind.Counts, null, "MorphologyResolver", Requirement.Required),
        Manual("E.midpiece_tail_review", "Midpiece and tail review", FieldKind.Record, null, "Morphologist", Requirement.Required)
            with { Note = "Always manual review; model labels are advisory." },

        // ---- F: vitality ----
        Mixed("F.vitality_pct", "Vitality", FieldKind.Decimal, Pct, "VitalityResolver", Requirement.Required)
            with { HardMin = 0, HardMax = 100, DisplayDecimals = 0 },

        // ---- G: DNA fragmentation ----
        Manual("G.dna_fragmentation_pct", "DNA fragmentation (SCD)", FieldKind.Decimal, Pct, "Trained scorer", Requirement.RequiredOrNotPerformed)
            with { HardMin = 0, HardMax = 100, DisplayDecimals = 0 },

        // ---- H: other tests (always unverified until confirmed) ----
        Manual("H.leukocytes_mpml", "Leukocytes", FieldKind.Decimal, "million/mL", "Lab / instrument", Requirement.Optional)
            with { HardMin = 0, DisplayDecimals = 1, AlwaysUnverified = true },
        Manual("H.mar_pct", "Antisperm antibodies (MAR)", FieldKind.Decimal, Pct, "Lab / instrument", Requirement.Optional)
            with { HardMin = 0, HardMax = 100, DisplayDecimals = 0, AlwaysUnverified = true },
        Manual("H.acrosome", "Acrosome", FieldKind.Text, null, "Lab / instrument", Requirement.Optional) with { AlwaysUnverified = true },
        Manual("H.mito_potential", "Mitochondrial potential", FieldKind.Text, null, "Lab / instrument", Requirement.Optional) with { AlwaysUnverified = true },
        Manual("H.oxidative_stress", "Oxidative stress", FieldKind.Text, null, "Lab / instrument", Requirement.Optional) with { AlwaysUnverified = true },
        Manual("H.chromatin", "Chromatin", FieldKind.Text, null, "Lab / instrument", Requirement.Optional) with { AlwaysUnverified = true },
        Manual("H.biochemistry", "Biochemistry", FieldKind.Text, null, "Lab / instrument", Requirement.Optional) with { AlwaysUnverified = true },

        // ---- I: calibration and QC ----
        Manual("I.calibration_um_per_px", "Calibration", FieldKind.Decimal, "µm/px", "QC lead", Requirement.Required)
            with { HardMin = 0, MinExclusive = true },
        Manual("I.fps", "Frame rate", FieldKind.Decimal, "fps", "QC lead", Requirement.Required)
            with { HardMin = 0, MinExclusive = true },
        Manual("I.chamber_depth_um", "Chamber depth", FieldKind.Decimal, "µm", "QC lead", Requirement.Required)
            with { HardMin = 0, MinExclusive = true },
        Manual("I.qc_results", "QC results", FieldKind.Text, null, "QC lead", Requirement.Required),
        Manual("I.operator_verified_by", "Operator verification", FieldKind.Text, null, "QC lead", Requirement.Required),

        // ---- J: interpretation and sign-off ----
        Derived("J.narrative", "Interpretation", FieldKind.Text, null, "Narrative", Requirement.Required),
        Derived("J.limitations", "Limitations", FieldKind.Text, null, "Narrative", Requirement.Required),
        Manual("J.signoff", "Sign-off", FieldKind.Record, null, "Signer", Requirement.Required),
    }.AsReadOnly();

    // Declared AFTER All on purpose: static initializers run in textual order.
    private static readonly Dictionary<string, FieldDefinition> ById =
        All.ToDictionary(d => d.Id, StringComparer.Ordinal);

    public static bool TryGet(string fieldId, out FieldDefinition definition)
    {
        if (fieldId is not null && ById.TryGetValue(fieldId, out var d)) { definition = d; return true; }
        definition = null!;
        return false;
    }

    /// <summary>
    /// Throws for unknown IDs: an unknown ID is a programming error, not a data error.
    /// </summary>
    public static FieldDefinition Get(string fieldId) =>
        TryGet(fieldId, out var d) ? d : throw new KeyNotFoundException($"Unknown field id '{fieldId}'.");

    public static IEnumerable<FieldDefinition> InSection(Section section) => All.Where(d => d.Section == section);

    /// <summary>
    /// Round half away from zero to the field's display precision.
    /// What is printed is what is judged against the limit (open decision 1 in the spec).
    /// </summary>
    public static decimal RoundForDisplay(string fieldId, decimal value)
    {
        var def = Get(fieldId);
        return def.DisplayDecimals is int dp
            ? Math.Round(value, dp, MidpointRounding.AwayFromZero)
            : value;
    }
}
