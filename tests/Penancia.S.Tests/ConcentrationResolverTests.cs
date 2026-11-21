using Penancia.S.Domain.Model;
using Penancia.S.Domain.Parameters;
using Penancia.S.Domain.Resolvers;
using Xunit;

namespace Penancia.S.Tests;

/// <summary>
/// Unit tests for ConcentrationResolver against the specification in Section 10.
/// </summary>
public class ConcentrationResolverTests
{
    private static readonly DateTimeOffset T = new(2026, 11, 20, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public void ManualAndVideo_WithinTolerance_ReportsManual_NoFlag()
    {
        // Manual 20.0, Video 21.0 -> rel gap = 1.0 / 20.0 = 0.05 <= 0.15
        var outcome = ConcentrationResolver.Resolve(
            manualConc: 20.0m,
            videoConc: 21.0m,
            manualStaffId: "tech-1",
            manualEnteredAt: T,
            videoModelName: "pycasa",
            videoModelVersion: "1.0",
            videoCommit: "abc123",
            parameters: ParameterSet.Placeholder);

        Assert.Equal(20.0m, outcome.ReportedConcMillionPerMl);
        Assert.Equal(FieldStatus.Present, outcome.Status);
        Assert.Equal(SourceKind.Manual, outcome.Provenance!.Kind);
        Assert.Empty(outcome.Flags);
    }

    [Fact]
    public void ManualAndVideo_GapAboveTolerance_ReportsManual_WithFlag()
    {
        // Manual 20.0, Video 25.0 -> rel gap = 5.0 / 20.0 = 0.25 > 0.15
        var outcome = ConcentrationResolver.Resolve(
            manualConc: 20.0m,
            videoConc: 25.0m,
            manualStaffId: "tech-1",
            manualEnteredAt: T,
            videoModelName: "pycasa",
            videoModelVersion: "1.0",
            videoCommit: "abc123",
            parameters: ParameterSet.Placeholder);

        Assert.Equal(20.0m, outcome.ReportedConcMillionPerMl);
        Assert.Equal(FieldStatus.Present, outcome.Status);
        Assert.Contains("CONCENTRATION_MISMATCH", outcome.Flags);
    }

    [Fact]
    public void ManualOnly_ReportsManual_NoFlag()
    {
        var outcome = ConcentrationResolver.Resolve(
            manualConc: 30.0m,
            videoConc: null,
            manualStaffId: "tech-1",
            manualEnteredAt: T,
            videoModelName: null,
            videoModelVersion: null,
            videoCommit: null,
            parameters: ParameterSet.Placeholder);

        Assert.Equal(30.0m, outcome.ReportedConcMillionPerMl);
        Assert.Equal(FieldStatus.Present, outcome.Status);
        Assert.Empty(outcome.Flags);
    }

    [Fact]
    public void VideoOnly_ReportsVideo_WithIncompleteManualWarning_AndUnverified()
    {
        var outcome = ConcentrationResolver.Resolve(
            manualConc: null,
            videoConc: 22.5m,
            manualStaffId: null,
            manualEnteredAt: null,
            videoModelName: "pycasa",
            videoModelVersion: "1.0",
            videoCommit: "abc123",
            parameters: ParameterSet.Placeholder);

        Assert.Equal(22.5m, outcome.ReportedConcMillionPerMl);
        Assert.Equal(FieldStatus.Present, outcome.Status);
        Assert.Equal(SourceKind.Automated, outcome.Provenance!.Kind);
        Assert.True(outcome.Provenance.Unverified);
        Assert.Contains("INCOMPLETE_MANUAL_COUNT", outcome.Flags);
    }

    [Fact]
    public void NeitherPresent_ProducesMissingStatus_AndIncompleteFlag()
    {
        var outcome = ConcentrationResolver.Resolve(
            manualConc: null,
            videoConc: null,
            manualStaffId: null,
            manualEnteredAt: null,
            videoModelName: null,
            videoModelVersion: null,
            videoCommit: null,
            parameters: ParameterSet.Placeholder);

        Assert.Null(outcome.ReportedConcMillionPerMl);
        Assert.Equal(FieldStatus.Missing, outcome.Status);
        Assert.Contains("INCOMPLETE", outcome.Flags);
    }

    [Fact]
    public void ZeroCount_RaisesNoSpermSeenReview()
    {
        // NOTE: the deleted ZeroSpermConfirmed field could never be true — a zero
        // count only raises NO_SPERM_SEEN_REVIEW; confirmation is a human review
        // step outside this resolver.
        var outcome = ConcentrationResolver.Resolve(
            manualConc: 0.0m,
            videoConc: 0.0m,
            manualStaffId: "tech-1",
            manualEnteredAt: T,
            videoModelName: "pycasa",
            videoModelVersion: "1.0",
            videoCommit: "abc123",
            parameters: ParameterSet.Placeholder);

        Assert.Equal(0.0m, outcome.ReportedConcMillionPerMl);
        Assert.Contains("NO_SPERM_SEEN_REVIEW", outcome.Flags);
    }

    [Fact]
    public void NegativeManual_IsTreatedAsAbsent_WithOutOfRangeFlag()
    {
        var outcome = ConcentrationResolver.Resolve(
            manualConc: -5.0m,
            videoConc: null,
            manualStaffId: "tech-1",
            manualEnteredAt: T,
            videoModelName: null,
            videoModelVersion: null,
            videoCommit: null,
            parameters: ParameterSet.Placeholder);

        Assert.Null(outcome.ReportedConcMillionPerMl);
        Assert.Equal(FieldStatus.Missing, outcome.Status);
        Assert.Contains("OUT_OF_RANGE", outcome.Flags);
        Assert.Contains("INCOMPLETE", outcome.Flags);
    }

    [Fact]
    public void VideoOnly_WithUnknownModel_HasInconsistentProvenanceFlaggedUnverified()
    {
        var outcome = ConcentrationResolver.Resolve(
            manualConc: null,
            videoConc: 22.5m,
            manualStaffId: null,
            manualEnteredAt: null,
            videoModelName: null,
            videoModelVersion: null,
            videoCommit: null,
            parameters: ParameterSet.Placeholder);

        Assert.Equal(22.5m, outcome.ReportedConcMillionPerMl);
        Assert.False(outcome.Provenance!.IsConsistent);
        Assert.Contains("UNVERIFIED", outcome.Flags);
    }
}
