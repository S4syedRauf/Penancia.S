using Penancia.S.Domain.Model;
using Penancia.S.Domain.Parameters;
using Penancia.S.Domain.Resolvers;
using Xunit;

namespace Penancia.S.Tests;

/// <summary>
/// Unit tests for VitalityResolver against Section 12 specifications.
/// </summary>
public class VitalityResolverTests
{
    private static readonly DateTimeOffset T = new(2026, 11, 20, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public void OpenCasaSucceeded_ReportsAutomatedVitality_MarkedUnverified()
    {
        var outcome = VitalityResolver.Resolve(
            openCasaVitality: 65.0m,
            openCasaSucceeded: true,
            manualVitality: null,
            manualStaffId: null,
            manualEnteredAt: null,
            totalMotilityPct: 50.0m,
            parameters: ParameterSet.Placeholder);

        Assert.Equal(65.0m, outcome.VitalityPct);
        Assert.Equal(FieldStatus.Present, outcome.Status);
        Assert.Equal(SourceKind.Automated, outcome.Provenance!.Kind);
        Assert.True(outcome.Provenance.Unverified);
        // The OpenCASA run records no version/commit, so its provenance is
        // intentionally incomplete and flagged UNVERIFIED (the old "head"
        // placeholder used to pass consistency checks as if real).
        Assert.Contains("UNVERIFIED", outcome.Flags);
    }

    [Fact]
    public void ManualOverride_PreemptsOpenCasa()
    {
        var outcome = VitalityResolver.Resolve(
            openCasaVitality: 65.0m,
            openCasaSucceeded: true,
            manualVitality: 70.0m, // Manual override
            manualStaffId: "tech-1",
            manualEnteredAt: T,
            totalMotilityPct: 50.0m,
            parameters: ParameterSet.Placeholder);

        Assert.Equal(70.0m, outcome.VitalityPct);
        Assert.Equal(SourceKind.Manual, outcome.Provenance!.Kind);
        Assert.False(outcome.Provenance.Unverified);
    }

    [Fact]
    public void MotilityExceedingVitality_TriggersRuleX1()
    {
        // Motility 60% > Vitality 55%
        var outcome = VitalityResolver.Resolve(
            openCasaVitality: 55.0m,
            openCasaSucceeded: true,
            manualVitality: null,
            manualStaffId: null,
            manualEnteredAt: null,
            totalMotilityPct: 60.0m,
            parameters: ParameterSet.Placeholder);

        Assert.Equal(55.0m, outcome.VitalityPct);
        Assert.Contains("MOTILITY_EXCEEDS_VITALITY", outcome.Flags);
    }

    [Fact]
    public void BothMissing_ProducesMissingStatus_AndIncompleteFlag()
    {
        var outcome = VitalityResolver.Resolve(
            openCasaVitality: null,
            openCasaSucceeded: false,
            manualVitality: null,
            manualStaffId: null,
            manualEnteredAt: null,
            totalMotilityPct: null,
            parameters: ParameterSet.Placeholder);

        Assert.Null(outcome.VitalityPct);
        Assert.Equal(FieldStatus.Missing, outcome.Status);
        Assert.Contains("INCOMPLETE", outcome.Flags);
    }
}
