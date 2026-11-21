namespace Penancia.S.Domain.Fields;

public enum Section { A, B, C, D, E, F, G, H, I, J }
public enum FieldKind { Text, Integer, Decimal, DateTime, Enum, Counts, Record }
public enum FieldOrigin { Manual, Automated, Derived, Mixed }   // Mixed = automated, may become manual after review
public enum Requirement { Required, Optional, RequiredOrNotPerformed, Conditional }

public sealed record FieldDefinition(
    string Id, Section Section, string Label, FieldKind Kind, string? Unit,
    FieldOrigin Origin, string SuppliedBy, Requirement Requirement)
{
    public decimal? HardMin { get; init; }
    public decimal? HardMax { get; init; }
    public bool MinExclusive { get; init; }          // true for "> 0"
    public int? DisplayDecimals { get; init; }
    public bool AlwaysUnverified { get; init; }      // section H
    public string? Note { get; init; }
    public IReadOnlyList<string>? AllowedValues { get; init; }
}
