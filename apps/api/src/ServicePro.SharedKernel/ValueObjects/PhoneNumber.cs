using ServicePro.SharedKernel.Results;

namespace ServicePro.SharedKernel.ValueObjects;

/// <summary>
/// An Indian mobile number in E.164 form (+91XXXXXXXXXX). The de-duplication key for
/// customers and the login identity for technicians (PLAN.md §7.1, §7.4).
/// </summary>
public sealed record PhoneNumber
{
    private const string CountryCode = "+91";

    private PhoneNumber(string value) => Value = value;

    public string Value { get; }

    /// <summary>Accepts "98765 43210", "+91-98765-43210", "0919876543210", "09876543210".</summary>
    public static Result<PhoneNumber> Create(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return Error.Validation("phone.required", "Enter a mobile number.");
        }

        var digits = new string([.. raw.Where(char.IsDigit)]);

        if (digits.Length == 13 && digits.StartsWith("091", StringComparison.Ordinal))
        {
            digits = digits[3..];
        }
        else if (digits.Length == 12 && digits.StartsWith("91", StringComparison.Ordinal))
        {
            digits = digits[2..];
        }
        else if (digits.Length == 11 && digits.StartsWith('0'))
        {
            digits = digits[1..];
        }

        if (digits.Length != 10 || digits[0] < '6')
        {
            return Error.Validation("phone.invalid", "Enter a valid 10-digit Indian mobile number.");
        }

        return new PhoneNumber(CountryCode + digits);
    }

    /// <summary>Rehydrate a value that was validated before it was stored.</summary>
    public static PhoneNumber FromTrusted(string e164) => new(e164);

    /// <summary>"+91 98••• ••210": for places where the full number shouldn't be shown.</summary>
    public string Masked()
    {
        var local = Value[CountryCode.Length..];
        return $"{CountryCode} {local[..2]}••• ••{local[^3..]}";
    }

    public override string ToString() => Value;
}
