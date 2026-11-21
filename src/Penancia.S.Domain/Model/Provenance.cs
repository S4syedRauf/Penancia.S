namespace Penancia.S.Domain.Model;

public sealed record Provenance(
    SourceKind Kind,
    string? ModelName = null, string? ModelVersion = null, string? RepoCommit = null,
    string? EnteredBy = null, DateTimeOffset? EnteredAt = null,
    IReadOnlyList<string>? DerivedFrom = null,
    bool ConfirmedByReviewer = false, string? ReviewerId = null,
    bool Unverified = false)
{
    // 'unverified' has no default on purpose: the caller must decide.
    // Model name / version / commit and enterer / timestamp are nullable on
    // purpose: resolvers must pass through what the caller actually supplied
    // and NEVER invent defaults such as "pycasa" / "1.0" / "head". A missing
    // value makes IsConsistent false, so fictional placeholder provenance can
    // no longer pass consistency checks as real provenance.
    public static Provenance Automated(string? modelName, string? modelVersion, string? repoCommit, bool unverified) =>
        new(SourceKind.Automated, ModelName: modelName, ModelVersion: modelVersion,
            RepoCommit: repoCommit, Unverified: unverified);

    public static Provenance Manual(string? enteredBy, DateTimeOffset? enteredAt) =>
        new(SourceKind.Manual, EnteredBy: enteredBy, EnteredAt: enteredAt);

    public static Provenance Derived(IReadOnlyList<string> derivedFrom) =>
        new(SourceKind.Derived, DerivedFrom: derivedFrom);

    /// <summary>
    /// True when the fields required for this Kind are filled in.
    /// </summary>
    public bool IsConsistent
    {
        get
        {
            if (ConfirmedByReviewer && string.IsNullOrWhiteSpace(ReviewerId)) return false;
            return Kind switch
            {
                SourceKind.Automated => !string.IsNullOrWhiteSpace(ModelName)
                                        && !string.IsNullOrWhiteSpace(ModelVersion)
                                        && !string.IsNullOrWhiteSpace(RepoCommit),
                SourceKind.Manual => !string.IsNullOrWhiteSpace(EnteredBy) && EnteredAt is not null,
                SourceKind.Derived => DerivedFrom is { Count: > 0 },
                _ => false
            };
        }
    }
}
