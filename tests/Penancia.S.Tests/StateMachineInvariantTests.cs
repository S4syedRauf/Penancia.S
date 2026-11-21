using Penancia.S.Domain.Model;
using Penancia.S.Domain.Workflow;
using Xunit;

namespace Penancia.S.Tests;

/// <summary>
/// Unit tests for SampleStateMachine enforcing all invariants and transition guards from Section 14.
/// </summary>
public class StateMachineInvariantTests
{
    private static TransitionContext CreateValidContext(string actorId = "DrSmith", string role = "Signer") =>
        new(
            ActorId: actorId,
            ActorRole: role,
            DataEnterers: new[] { "TechJane", "TechBob" },
            FilesAndCalibrationPresent: true,
            IsComplete: true,
            SignedReportVersion: 1,
            CurrentReportVersion: 1,
            SignedContentSha256: "abc123hash",
            CurrentContentSha256: "abc123hash"
        );

    [Fact]
    public void NormalLifecycle_AdvancesThroughAllStatesToReleased()
    {
        var ctx = CreateValidContext();

        // Draft -> Validating
        var res1 = SampleStateMachine.Apply(SampleState.Draft, SampleEvent.Submit, ctx);
        Assert.True(res1.Success);
        Assert.Equal(SampleState.Validating, res1.NewState);

        // Validating -> Analyzing
        var res2 = SampleStateMachine.Apply(SampleState.Validating, SampleEvent.FilesValidated, ctx);
        Assert.True(res2.Success);
        Assert.Equal(SampleState.Analyzing, res2.NewState);

        // Analyzing -> Collecting
        var res3 = SampleStateMachine.Apply(SampleState.Analyzing, SampleEvent.AnalysisFinished, ctx);
        Assert.True(res3.Success);
        Assert.Equal(SampleState.Collecting, res3.NewState);

        // Collecting -> Evaluating
        var res4 = SampleStateMachine.Apply(SampleState.Collecting, SampleEvent.CompletenessReached, ctx);
        Assert.True(res4.Success);
        Assert.Equal(SampleState.Evaluating, res4.NewState);

        // Evaluating -> AwaitingSignoff
        var res5 = SampleStateMachine.Apply(SampleState.Evaluating, SampleEvent.DraftGenerated, ctx);
        Assert.True(res5.Success);
        Assert.Equal(SampleState.AwaitingSignoff, res5.NewState);

        // AwaitingSignoff -> Released
        var res6 = SampleStateMachine.Apply(SampleState.AwaitingSignoff, SampleEvent.SignedOff, ctx);
        Assert.True(res6.Success);
        Assert.Equal(SampleState.Released, res6.NewState);
    }

    [Fact]
    public void SignerMatchingDataEnterer_IsRejected_UnderDualSignoffRule()
    {
        // Signer "TechJane" is also in DataEnterers!
        var ctx = CreateValidContext(actorId: "TechJane", role: "Signer");

        var res = SampleStateMachine.Apply(SampleState.AwaitingSignoff, SampleEvent.SignedOff, ctx);

        Assert.False(res.Success);
        Assert.Contains("DUAL_SIGNOFF_VIOLATION", res.FailureReason);
        Assert.Equal(SampleState.AwaitingSignoff, res.NewState);
    }

    [Fact]
    public void StaleContentHash_IsRejected()
    {
        var ctx = CreateValidContext() with { SignedContentSha256 = "different_hash" };

        var res = SampleStateMachine.Apply(SampleState.AwaitingSignoff, SampleEvent.SignedOff, ctx);

        Assert.False(res.Success);
        Assert.Contains("STALE_HASH", res.FailureReason);
    }

    [Fact]
    public void TerminalState_RejectsAnySubsequentEvents()
    {
        var ctx = CreateValidContext();

        // Terminal Released cannot transition
        var res = SampleStateMachine.Apply(SampleState.Released, SampleEvent.Submit, ctx);
        Assert.False(res.Success);
        Assert.Contains("TERMINAL_STATE", res.FailureReason);

        // Terminal Failed cannot transition
        var res2 = SampleStateMachine.Apply(SampleState.Failed, SampleEvent.Submit, ctx);
        Assert.False(res2.Success);
        Assert.Contains("TERMINAL_STATE", res2.FailureReason);
    }

    [Fact]
    public void SuccessResults_CarryNoFailureReason_ContextGoesInNote()
    {
        var ctx = CreateValidContext();

        var timeout = SampleStateMachine.Apply(SampleState.Collecting, SampleEvent.CollectTimeout, ctx);
        Assert.True(timeout.Success);
        Assert.Equal(SampleState.Abandoned, timeout.NewState);
        Assert.Null(timeout.FailureReason);
        Assert.Equal("TIMEOUT_COLLECTING", timeout.Note);

        var edit = SampleStateMachine.Apply(SampleState.AwaitingSignoff, SampleEvent.EditAfterDraft, ctx);
        Assert.True(edit.Success);
        Assert.Null(edit.FailureReason);
        Assert.Equal("EDIT_AFTER_DRAFT", edit.Note);
    }

    [Fact]
    public void Cancel_ByLabAdmin_IsAllowed_AndMessageNamesAllRoles()
    {
        var ctx = CreateValidContext(role: "LabAdmin");
        var res = SampleStateMachine.Apply(SampleState.Draft, SampleEvent.Cancel, ctx);
        Assert.True(res.Success);
        Assert.Equal(SampleState.Cancelled, res.NewState);
        Assert.Null(res.FailureReason);

        var denied = SampleStateMachine.Apply(SampleState.Draft, SampleEvent.Cancel, CreateValidContext(role: "Technician2"));
        Assert.False(denied.Success);
        Assert.Contains("Technician, QCLead or LabAdmin", denied.FailureReason);
    }

    [Fact]
    public void EditAfterDraft_ReturnsToCollecting_AndRequiresNewReportVersion()
    {
        var ctx = CreateValidContext();

        var res = SampleStateMachine.Apply(SampleState.AwaitingSignoff, SampleEvent.EditAfterDraft, ctx);

        Assert.True(res.Success);
        Assert.Equal(SampleState.Collecting, res.NewState);
        Assert.True(res.RequiresNewReportVersion);
    }
}
