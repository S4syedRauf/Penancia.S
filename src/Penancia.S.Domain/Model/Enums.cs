namespace Penancia.S.Domain.Model;

public enum SourceKind { Automated, Manual, Derived }

/// <summary>
/// Missing = nobody entered it (blocks release if required).
/// NotPerformed = a person said the test was not done (needs a reason).
/// </summary>
public enum FieldStatus { Present, Missing, Failed, NotPerformed, NotApplicable }
