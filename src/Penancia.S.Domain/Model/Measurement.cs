namespace Penancia.S.Domain.Model;

public sealed record Measurement(
    string FieldId, decimal? Value, string? TextValue, string Unit,
    FieldStatus Status, string? ReasonCode, Provenance? Provenance)
{
    public static Measurement Numeric(string fieldId, decimal value, string unit, Provenance provenance) =>
        new(fieldId, value, null, unit, FieldStatus.Present, null, provenance);

    public static Measurement Text(string fieldId, string text, Provenance provenance) =>
        new(fieldId, null, text, "", FieldStatus.Present, null, provenance);

    public static Measurement Missing(string fieldId, string unit, string? reasonCode = null) =>
        new(fieldId, null, null, unit, FieldStatus.Missing, reasonCode, null);

    public static Measurement Failed(string fieldId, string unit, string reasonCode) =>
        new(fieldId, null, null, unit, FieldStatus.Failed, reasonCode, null);

    public static Measurement NotPerformed(string fieldId, string unit, string reasonCode, Provenance provenance) =>
        new(fieldId, null, null, unit, FieldStatus.NotPerformed, reasonCode, provenance);

    public static Measurement NotApplicable(string fieldId, string unit, string reasonCode, Provenance provenance) =>
        new(fieldId, null, null, unit, FieldStatus.NotApplicable, reasonCode, provenance);

    /// <summary>
    /// A missing or failed value can never carry a number. A present value always has a source.
    /// </summary>
    public bool IsConsistent
    {
        get
        {
            bool hasValue = Value is not null || TextValue is not null;
            switch (Status)
            {
                case FieldStatus.Present:
                    return hasValue && (Value is null || TextValue is null)
                           && ReasonCode is null && Provenance is { IsConsistent: true };
                case FieldStatus.Missing:
                    return !hasValue && Provenance is null;
                case FieldStatus.Failed:
                    return !hasValue && !string.IsNullOrWhiteSpace(ReasonCode) && Provenance is null;
                case FieldStatus.NotPerformed:
                case FieldStatus.NotApplicable:
                    return !hasValue && !string.IsNullOrWhiteSpace(ReasonCode) && Provenance is { IsConsistent: true };
                default:
                    return false;
            }
        }
    }
}
