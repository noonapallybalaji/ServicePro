using System.Text;
using Microsoft.EntityFrameworkCore;
using ServicePro.BuildingBlocks.Application;
using ServicePro.Contracts;
using ServicePro.Modules.Customers.Domain;
using ServicePro.SharedKernel.ValueObjects;

namespace ServicePro.Modules.Customers.Application;

public sealed record ImportRowError(int Row, string Message);

public sealed record ImportCustomersResponse(int Created, int SkippedExisting, IReadOnlyList<ImportRowError> Errors);

/// <summary>
/// One-off import of the existing customer list (PLAN.md §16 Phase 0).
/// Expected header: name,phone,alternate_phone,email,line1,line2,landmark,locality,city,state,pincode
/// Existing phone numbers are skipped, never overwritten.
/// </summary>
public sealed class ImportCustomers(DbContext db) : IUseCase
{
    public const int MaxRows = 20_000;

    private static readonly string[] RequiredColumns = ["name", "phone"];

    public async Task<ImportCustomersResponse> HandleAsync(Stream csv, CancellationToken ct)
    {
        using var reader = new StreamReader(csv, Encoding.UTF8);
        var header = await reader.ReadLineAsync(ct);
        if (header is null)
        {
            return new ImportCustomersResponse(0, 0, [new ImportRowError(0, "The file is empty.")]);
        }

        var columns = CsvLine.Parse(header).Select(c => c.Trim().ToLowerInvariant()).ToList();
        var missing = RequiredColumns.Where(c => !columns.Contains(c)).ToList();
        if (missing.Count > 0)
        {
            return new ImportCustomersResponse(0, 0, [new ImportRowError(1, $"Missing column(s): {string.Join(", ", missing)}.")]);
        }

        var existingPhones = (await db.Set<Customer>().Select(c => c.PrimaryPhone).ToListAsync(ct))
            .Select(p => p.Value).ToHashSet();
        var errors = new List<ImportRowError>();
        var created = 0;
        var skipped = 0;
        var row = 1;

        while (await reader.ReadLineAsync(ct) is { } line && row <= MaxRows)
        {
            row++;
            if (string.IsNullOrWhiteSpace(line))
            {
                continue;
            }

            var values = CsvLine.Parse(line);
            string? Value(string column)
            {
                var index = columns.IndexOf(column);
                return index >= 0 && index < values.Count && !string.IsNullOrWhiteSpace(values[index]) ? values[index].Trim() : null;
            }

            var name = Value("name");
            var phone = PhoneNumber.Create(Value("phone"));
            if (name is null || phone.IsFailure)
            {
                errors.Add(new ImportRowError(row, name is null ? "Name is missing." : phone.Error!.Message));
                continue;
            }

            if (!existingPhones.Add(phone.Value.Value))
            {
                skipped++;
                continue;
            }

            var customer = Customer.Create(name, phone.Value, RequestChannel.Manual);
            var alternate = PhoneNumber.Create(Value("alternate_phone"));
            customer.UpdateDetails(name, alternate.IsSuccess ? alternate.Value : null, Value("email"), "en", null);

            if (Value("line1") is { } line1 && Value("pincode") is { } pincode && pincode.Length == 6)
            {
                customer.AddAddress(
                    new AddressDetails(null, line1, Value("line2"), Value("landmark"), Value("locality") ?? string.Empty,
                        Value("city") ?? string.Empty, Value("state") ?? string.Empty, pincode, null),
                    makeDefault: true);
            }

            db.Set<Customer>().Add(customer);
            created++;
        }

        await db.SaveChangesAsync(ct);
        return new ImportCustomersResponse(created, skipped, errors);
    }
}

/// <summary>Minimal RFC 4180 line parser: commas, quoted fields, doubled quotes.</summary>
internal static class CsvLine
{
    public static List<string> Parse(string line)
    {
        var fields = new List<string>();
        var current = new StringBuilder();
        var inQuotes = false;

        for (var i = 0; i < line.Length; i++)
        {
            var c = line[i];
            if (inQuotes)
            {
                if (c == '"' && i + 1 < line.Length && line[i + 1] == '"')
                {
                    current.Append('"');
                    i++;
                }
                else if (c == '"')
                {
                    inQuotes = false;
                }
                else
                {
                    current.Append(c);
                }
            }
            else if (c == '"')
            {
                inQuotes = true;
            }
            else if (c == ',')
            {
                fields.Add(current.ToString());
                current.Clear();
            }
            else
            {
                current.Append(c);
            }
        }

        fields.Add(current.ToString());
        return fields;
    }
}
