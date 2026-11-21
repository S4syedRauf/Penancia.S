namespace Penancia.S.Domain.Rules;

public enum ComparisonOp
{
    GreaterThanOrEqual,
    LessThanOrEqual,
    Equal
}

public enum ResultState
{
    WithinReference,
    BelowReference,
    /// <summary>Failed an upper reference limit (e.g. leukocytes above 1.0 million/mL).</summary>
    AboveReference,
    Incomplete,
    NotPerformed,
    NotApplicable,
    Unverified,
    NoReferenceLimit
}

public enum Severity
{
    Info,
    Warning,
    Blocking,
    Banner
}
