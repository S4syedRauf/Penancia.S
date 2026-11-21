namespace Penancia.S.Domain.Parameters;

/// <summary>
/// Every threshold lives here, never in code. All defaults are PLACEHOLDERS until the S6
/// validation manifest replaces them. Validated=false forces the NOT_VALIDATED banner.
/// </summary>
public sealed record ParameterSet
{
    public string Id { get; init; } = "placeholder-0";
    public bool Validated { get; init; } = false;
    public string? ManifestId { get; init; }

    // Kinematics (double: floating-point math)
    public int SmoothingWindowPoints { get; init; } = 5;      // must be odd
    public int MinTrackPoints { get; init; } = 15;
    public int MaxFrameStep { get; init; } = 3;               // largest allowed jump between consecutive frame numbers
    public double BcfDeadBandUm { get; init; } = 0.2;
    public double BcfMinFps { get; init; } = 60;
    public decimal TrackerKinematicsDiffRel { get; init; } = 0.10m;   // used later (info flag)

    // Counts
    public int MinCellsMotility { get; init; } = 200;
    public int MinCellsMorphology { get; init; } = 200;

    // Lab-value comparisons (decimal)
    public decimal MotilityAgreementPp { get; init; } = 5m;
    public decimal ConcentrationMismatchRel { get; init; } = 0.15m;
    public decimal MotilityVitalityTolerancePp { get; init; } = 0m;
    public decimal DebrisFractionWarn { get; init; } = 0.30m;
    public decimal PercentSumTolerancePp { get; init; } = 0.5m;

    public static ParameterSet Placeholder { get; } = new();

    /// <summary>
    /// Returns problem codes. Empty list = usable.
    /// </summary>
    public IReadOnlyList<string> Validate()
    {
        var p = new List<string>();
        if (SmoothingWindowPoints < 1 || SmoothingWindowPoints % 2 == 0) p.Add("SMOOTHING_WINDOW_MUST_BE_ODD_AND_POSITIVE");
        if (SmoothingWindowPoints > 999) p.Add("SMOOTHING_WINDOW_TOO_LARGE");
        if (MinTrackPoints < 2) p.Add("MIN_TRACK_POINTS_BELOW_2");
        if (MinTrackPoints > 100000) p.Add("MIN_TRACK_POINTS_TOO_LARGE");
        if (MaxFrameStep < 1) p.Add("MAX_FRAME_STEP_BELOW_1");
        // Upper bounds keep the interpolated point count m = frameSpan + 1 bounded:
        // m <= (rawPoints - 1) * MaxFrameStep + 1, so bounding MaxFrameStep bounds
        // the per-gap interpolation. (The absolute bound also depends on the
        // caller-supplied track length, which Validate cannot see.)
        if (MaxFrameStep > 1000) p.Add("MAX_FRAME_STEP_TOO_LARGE");
        if (!double.IsFinite(BcfDeadBandUm) || BcfDeadBandUm < 0) p.Add("BCF_DEAD_BAND_INVALID");
        if (!double.IsFinite(BcfMinFps) || BcfMinFps <= 0) p.Add("BCF_MIN_FPS_INVALID");
        if (MinCellsMotility < 1) p.Add("MIN_CELLS_MOTILITY_BELOW_1");
        if (MinCellsMorphology < 1) p.Add("MIN_CELLS_MORPHOLOGY_BELOW_1");
        if (MotilityAgreementPp < 0) p.Add("MOTILITY_AGREEMENT_NEGATIVE");
        if (ConcentrationMismatchRel < 0) p.Add("CONCENTRATION_MISMATCH_NEGATIVE");
        if (MotilityVitalityTolerancePp < 0) p.Add("MOTILITY_VITALITY_TOLERANCE_NEGATIVE");
        if (DebrisFractionWarn < 0 || DebrisFractionWarn > 1) p.Add("DEBRIS_WARN_OUT_OF_RANGE");
        if (PercentSumTolerancePp < 0) p.Add("PERCENT_SUM_TOLERANCE_NEGATIVE");
        if (TrackerKinematicsDiffRel < 0) p.Add("TRACKER_DIFF_NEGATIVE");
        if (Validated && string.IsNullOrWhiteSpace(ManifestId)) p.Add("VALIDATED_WITHOUT_MANIFEST_ID");
        return p;
    }
}
