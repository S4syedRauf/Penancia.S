using Penancia.S.Domain.Model;

namespace Penancia.S.Domain.Fields;

public sealed record FieldValidationResult(bool IsValid, string? ReasonCode)
{
    public static readonly FieldValidationResult Ok = new(true, null);
    public static FieldValidationResult Fail(string code) => new(false, code);
}

public static class FieldValidator
{
    public static FieldValidationResult ValidateNumber(string fieldId, decimal value)
    {
        if (!FieldCatalog.TryGet(fieldId, out var def)) return FieldValidationResult.Fail("UNKNOWN_FIELD");
        if (def.Kind is not (FieldKind.Integer or FieldKind.Decimal)) return FieldValidationResult.Fail("NOT_NUMERIC_FIELD");
        if (def.Kind == FieldKind.Integer && value != decimal.Truncate(value)) return FieldValidationResult.Fail("NOT_INTEGER");

        if (def.HardMin is decimal min && (def.MinExclusive ? value <= min : value < min))
            return FieldValidationResult.Fail("OUT_OF_HARD_RANGE");
        if (def.HardMax is decimal max && value > max)
            return FieldValidationResult.Fail("OUT_OF_HARD_RANGE");
        return FieldValidationResult.Ok;
    }

    public static FieldValidationResult ValidateText(string fieldId, string? text)
    {
        if (!FieldCatalog.TryGet(fieldId, out var def)) return FieldValidationResult.Fail("UNKNOWN_FIELD");
        if (def.Kind is not (FieldKind.Text or FieldKind.Enum)) return FieldValidationResult.Fail("NOT_TEXT_FIELD");
        if (string.IsNullOrWhiteSpace(text)) return FieldValidationResult.Fail("EMPTY");
        if (def.AllowedValues is not null && !def.AllowedValues.Contains(text, StringComparer.Ordinal))
            return FieldValidationResult.Fail("NOT_ALLOWED_VALUE");
        return FieldValidationResult.Ok;
    }

    public static FieldValidationResult ValidateNotFuture(DateTimeOffset value, IClock clock) =>
        value > clock.UtcNow ? FieldValidationResult.Fail("FUTURE_DATE") : FieldValidationResult.Ok;
}
