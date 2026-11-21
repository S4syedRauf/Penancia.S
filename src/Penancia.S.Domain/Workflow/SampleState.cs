namespace Penancia.S.Domain.Workflow;

public enum SampleState
{
    Draft,
    Validating,
    Analyzing,
    Collecting,
    Evaluating,
    AwaitingSignoff,
    Released,
    Rejected,
    Failed,
    Abandoned,
    Cancelled
}

public enum SampleEvent
{
    Submit,
    FilesValidated,
    FilesRejected,
    AnalysisFinished,
    CompletenessReached,
    CollectTimeout,
    DraftGenerated,
    SignedOff,
    ChangesRequested,
    EditAfterDraft,
    SignoffTimeout,
    UnrecoverableError,
    Cancel
}

public sealed record TransitionContext(
    string ActorId,
    string ActorRole,
    IReadOnlyList<string> DataEnterers,
    bool FilesAndCalibrationPresent = false,
    bool IsComplete = false,
    int? SignedReportVersion = null,
    int? CurrentReportVersion = null,
    string? SignedContentSha256 = null,
    string? CurrentContentSha256 = null,
    string? Reason = null);

/// <summary>
/// Outcome of a state-machine transition. INVARIANT: when <see cref="Success"/>
/// is true, <see cref="FailureReason"/> MUST be null — success context (e.g.
/// "TIMEOUT_COLLECTING", a staff-supplied reason) goes in <see cref="Note"/>
/// instead, so callers testing FailureReason != null never misread a success
/// as a failure. When Success is false, FailureReason carries the error code
/// and Note is null.
/// </summary>
public sealed record TransitionResult(
    bool Success,
    SampleState NewState,
    string? FailureReason,
    bool RequiresNewReportVersion = false,
    string? Note = null);
