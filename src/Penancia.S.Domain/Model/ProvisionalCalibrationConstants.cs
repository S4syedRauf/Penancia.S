namespace Penancia.S.Domain.Model;

/// <summary>
/// Optical micrometer calibration thresholds and defaults.
/// Marked PROVISIONAL per docs/BLUEPRINT.md until clinical validation in Phase 10.
/// </summary>
public static class ProvisionalCalibrationConstants
{
    public const int MinLinesDetected = 6;
    public const double MaxSpacingCvPct = 5.0;
    public const double RelativeScaleTolerance = 0.001; // 0.1% relative tolerance
    public const int DefaultValidityDays = 7;
}
