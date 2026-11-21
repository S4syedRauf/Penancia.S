namespace Penancia.S.Domain.Workflow;

/// <summary>
/// Strict sample lifecycle state machine implementing all clinical guards and invariants from Section 14.
/// </summary>
public static class SampleStateMachine
{
    private static readonly HashSet<SampleState> TerminalStates = new()
    {
        SampleState.Released,
        SampleState.Rejected,
        SampleState.Failed,
        SampleState.Abandoned,
        SampleState.Cancelled
    };

    public static bool IsTerminal(SampleState state) => TerminalStates.Contains(state);

    public static TransitionResult Apply(SampleState current, SampleEvent evt, TransitionContext ctx)
    {
        ArgumentNullException.ThrowIfNull(ctx);

        // Invariant 1: Terminal states accept no events
        if (IsTerminal(current))
        {
            return new TransitionResult(false, current, $"TERMINAL_STATE: State '{current}' is terminal and cannot transition.");
        }

        // Global UnrecoverableError
        if (evt == SampleEvent.UnrecoverableError)
        {
            return new TransitionResult(true, SampleState.Failed, FailureReason: null, Note: ctx.Reason ?? "UNRECOVERABLE_ERROR");
        }

        // Global Cancel (except Released, which is checked by terminal guard)
        if (evt == SampleEvent.Cancel)
        {
            if (ctx.ActorRole is not ("Technician" or "QCLead" or "LabAdmin"))
            {
                return new TransitionResult(false, current, "INSUFFICIENT_PERMISSIONS: Cancel requires Technician, QCLead or LabAdmin role.");
            }
            return new TransitionResult(true, SampleState.Cancelled, FailureReason: null, Note: ctx.Reason ?? "CANCELLED_BY_STAFF");
        }

        return (current, evt) switch
        {
            // Draft -> Submit -> Validating
            (SampleState.Draft, SampleEvent.Submit) =>
                ctx.FilesAndCalibrationPresent
                    ? new TransitionResult(true, SampleState.Validating, null)
                    : new TransitionResult(false, current, "PREREQUISITES_MISSING: Files and optical calibration are required before submission."),

            // Validating -> FilesValidated -> Analyzing
            (SampleState.Validating, SampleEvent.FilesValidated) =>
                new TransitionResult(true, SampleState.Analyzing, null),

            // Validating -> FilesRejected -> Rejected
            (SampleState.Validating, SampleEvent.FilesRejected) =>
                new TransitionResult(true, SampleState.Rejected, FailureReason: null, Note: ctx.Reason ?? "FILES_REJECTED"),

            // Analyzing -> AnalysisFinished -> Collecting
            (SampleState.Analyzing, SampleEvent.AnalysisFinished) =>
                new TransitionResult(true, SampleState.Collecting, null),

            // Collecting -> CompletenessReached -> Evaluating
            (SampleState.Collecting, SampleEvent.CompletenessReached) =>
                ctx.IsComplete
                    ? new TransitionResult(true, SampleState.Evaluating, null)
                    : new TransitionResult(false, current, "INCOMPLETE: Cannot advance to Evaluating while required fields or blocking flags are open."),

            // Collecting -> CollectTimeout -> Abandoned
            (SampleState.Collecting, SampleEvent.CollectTimeout) =>
                new TransitionResult(true, SampleState.Abandoned, FailureReason: null, Note: "TIMEOUT_COLLECTING"),

            // Evaluating -> DraftGenerated -> AwaitingSignoff
            (SampleState.Evaluating, SampleEvent.DraftGenerated) =>
                new TransitionResult(true, SampleState.AwaitingSignoff, null),

            // AwaitingSignoff -> SignedOff -> Released
            (SampleState.AwaitingSignoff, SampleEvent.SignedOff) => ValidateSignoff(current, ctx),

            // AwaitingSignoff -> ChangesRequested -> Collecting
            (SampleState.AwaitingSignoff, SampleEvent.ChangesRequested) =>
                new TransitionResult(true, SampleState.Collecting, FailureReason: null, RequiresNewReportVersion: true, Note: ctx.Reason),

            // AwaitingSignoff -> EditAfterDraft -> Collecting
            (SampleState.AwaitingSignoff, SampleEvent.EditAfterDraft) =>
                new TransitionResult(true, SampleState.Collecting, FailureReason: null, RequiresNewReportVersion: true, Note: "EDIT_AFTER_DRAFT"),

            // AwaitingSignoff -> SignoffTimeout -> Abandoned
            (SampleState.AwaitingSignoff, SampleEvent.SignoffTimeout) =>
                new TransitionResult(true, SampleState.Abandoned, FailureReason: null, Note: "TIMEOUT_SIGNOFF"),

            _ => new TransitionResult(false, current, $"INVALID_TRANSITION: Cannot apply event '{evt}' to state '{current}'.")
        };
    }

    private static TransitionResult ValidateSignoff(SampleState current, TransitionContext ctx)
    {
        ArgumentNullException.ThrowIfNull(ctx);

        // Invariant: Signer must have role Signer or ClinicalDirector
        if (ctx.ActorRole is not ("Signer" or "ClinicalDirector"))
        {
            return new TransitionResult(false, current, "INVALID_ROLE: Electronic signature requires Signer or ClinicalDirector role.");
        }

        // Invariant: Signer != any data enterer on this sample. A null
        // DataEnterers list cannot prove independence, so sign-off fails closed
        // instead of throwing a NullReferenceException.
        if (ctx.DataEnterers is null)
        {
            return new TransitionResult(false, current, "DUAL_SIGNOFF_UNVERIFIABLE: DataEnterers list is missing; signer independence cannot be validated.");
        }
        if (ctx.DataEnterers.Contains(ctx.ActorId, StringComparer.OrdinalIgnoreCase))
        {
            return new TransitionResult(false, current, "DUAL_SIGNOFF_VIOLATION: Signer cannot be one of the data enterers for this sample.");
        }

        // Invariant: Version and Content Hash must match current draft
        if (ctx.SignedReportVersion != ctx.CurrentReportVersion)
        {
            return new TransitionResult(false, current, "STALE_VERSION: Signed report version does not match current draft version.");
        }

        if (string.IsNullOrWhiteSpace(ctx.SignedContentSha256) ||
            !string.Equals(ctx.SignedContentSha256, ctx.CurrentContentSha256, StringComparison.OrdinalIgnoreCase))
        {
            return new TransitionResult(false, current, "STALE_HASH: Signed content SHA-256 does not match draft content hash.");
        }

        return new TransitionResult(true, SampleState.Released, null);
    }
}
