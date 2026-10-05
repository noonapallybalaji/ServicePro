using FluentValidation;
using Microsoft.EntityFrameworkCore;
using ServicePro.BuildingBlocks.Application;
using ServicePro.Contracts;
using ServicePro.Modules.Customers.Domain;
using ServicePro.SharedKernel;
using ServicePro.SharedKernel.Results;
using ServicePro.SharedKernel.ValueObjects;

namespace ServicePro.Modules.Customers.Application;

// ── DTOs ────────────────────────────────────────────────────────────────────

public sealed record AddressInput(
    string? Label,
    string Line1,
    string? Line2,
    string? Landmark,
    string Locality,
    string City,
    string State,
    string Pincode,
    double? Latitude,
    double? Longitude);

public sealed record ApplianceInput(
    Guid CategoryId,
    string? Brand,
    string? ApplianceType,
    string? Capacity,
    string? ModelNumber,
    string? SerialNumber,
    int? PurchaseYear,
    DateOnly? WarrantyUntil);

public sealed record AddressResponse(
    Guid Id,
    string? Label,
    string Line1,
    string? Line2,
    string? Landmark,
    string Locality,
    string City,
    string State,
    string Pincode,
    double? Latitude,
    double? Longitude,
    bool IsDefault);

public sealed record ApplianceResponse(
    Guid Id,
    Guid CategoryId,
    string? Brand,
    string? ApplianceType,
    string? Capacity,
    string? ModelNumber,
    string? SerialNumber,
    int? PurchaseYear,
    DateOnly? WarrantyUntil);

public sealed record CustomerListItem(Guid Id, string FullName, string PrimaryPhone, string? Locality, bool IsBlocked, DateTimeOffset CreatedAt);

public sealed record CustomerResponse(
    Guid Id,
    string FullName,
    string PrimaryPhone,
    string? AlternatePhone,
    string? Email,
    string PreferredLanguage,
    RequestChannel FirstSource,
    bool IsBlocked,
    string? Notes,
    DateTimeOffset CreatedAt,
    IReadOnlyList<AddressResponse> Addresses,
    IReadOnlyList<ApplianceResponse> Appliances);

internal static class CustomerMapping
{
    public static CustomerResponse ToResponse(this Customer c) => new(
        c.Id, c.FullName, c.PrimaryPhone.Value, c.AlternatePhone?.Value, c.Email, c.PreferredLanguage, c.FirstSource,
        c.IsBlocked, c.Notes, c.CreatedAt,
        [.. c.Addresses.OrderByDescending(a => a.IsDefault).ThenBy(a => a.CreatedAt).Select(ToResponse)],
        [.. c.Appliances.OrderBy(a => a.CreatedAt).Select(ToResponse)]);

    public static AddressResponse ToResponse(this CustomerAddress a) => new(
        a.Id, a.Label, a.Line1, a.Line2, a.Landmark, a.Locality, a.City, a.State, a.Pincode, a.Latitude, a.Longitude, a.IsDefault);

    public static ApplianceResponse ToResponse(this CustomerAppliance a) => new(
        a.Id, a.CategoryId, a.Brand, a.ApplianceType, a.Capacity, a.ModelNumber, a.SerialNumber, a.PurchaseYear, a.WarrantyUntil);

    public static Result<AddressDetails> ToDetails(this AddressInput input)
    {
        GeoLocation? location = null;
        if (input is { Latitude: { } lat, Longitude: { } lon })
        {
            var geo = GeoLocation.Create(lat, lon);
            if (geo.IsFailure)
            {
                return geo.Error!;
            }

            location = geo.Value;
        }

        return new AddressDetails(input.Label, input.Line1, input.Line2, input.Landmark, input.Locality, input.City, input.State, input.Pincode, location);
    }

    public static ApplianceDetails ToDetails(this ApplianceInput input) => new(
        input.CategoryId, input.Brand, input.ApplianceType, input.Capacity, input.ModelNumber, input.SerialNumber, input.PurchaseYear, input.WarrantyUntil);
}

internal static class CustomerErrors
{
    public static readonly Error NotFound = Error.NotFound("customer.not_found", "That customer doesn't exist.");

    public static Error PhoneTaken(Guid existingId) =>
        Error.Conflict("customer.phone_taken", $"A customer with this phone number already exists ({existingId}).");
}

// ── Validators ──────────────────────────────────────────────────────────────

internal sealed class AddressInputValidator : AbstractValidator<AddressInput>
{
    public AddressInputValidator()
    {
        RuleFor(a => a.Line1).NotEmpty().MaximumLength(200);
        RuleFor(a => a.Locality).NotEmpty().MaximumLength(120);
        RuleFor(a => a.City).NotEmpty().MaximumLength(80);
        RuleFor(a => a.State).NotEmpty().MaximumLength(80);
        RuleFor(a => a.Pincode).Matches("^[1-9][0-9]{5}$").WithMessage("Pincodes are 6 digits.");
        RuleFor(a => a.Latitude).InclusiveBetween(-90, 90).When(a => a.Latitude.HasValue);
        RuleFor(a => a.Longitude).InclusiveBetween(-180, 180).When(a => a.Longitude.HasValue);
    }
}

internal sealed class ApplianceInputValidator : AbstractValidator<ApplianceInput>
{
    public ApplianceInputValidator()
    {
        RuleFor(a => a.CategoryId).NotEmpty();
        RuleFor(a => a.PurchaseYear).InclusiveBetween(1980, 2100).When(a => a.PurchaseYear.HasValue);
    }
}

// ── Queries ─────────────────────────────────────────────────────────────────

public sealed class SearchCustomers(DbContext db) : IUseCase
{
    /// <summary>Search by name or any part of the phone number (digits only).</summary>
    public async Task<PagedResult<CustomerListItem>> HandleAsync(string? search, PageRequest page, CancellationToken ct)
    {
        var query = db.Set<Customer>().AsNoTracking();

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            var digits = new string([.. term.Where(char.IsDigit)]);
            query = digits.Length >= 4
                ? query.Where(c => c.PhoneDigits.Contains(digits))
                : query.Where(c => EF.Functions.Like(c.FullName.ToLower(), $"%{term.ToLowerInvariant()}%"));
        }

        var total = await query.CountAsync(ct);
        var items = await query
            .OrderByDescending(c => c.CreatedAt)
            .Skip(page.Skip).Take(page.SafePageSize)
            .Select(c => new CustomerListItem(
                c.Id,
                c.FullName,
                c.PrimaryPhone.Value,
                c.Addresses.Where(a => a.IsDefault).Select(a => a.Locality).FirstOrDefault(),
                c.IsBlocked,
                c.CreatedAt))
            .ToListAsync(ct);

        return new PagedResult<CustomerListItem>(items, total, page.SafePage, page.SafePageSize);
    }
}

public sealed class GetCustomer(DbContext db) : IUseCase
{
    public async Task<Result<CustomerResponse>> HandleAsync(Guid customerId, CancellationToken ct)
    {
        var customer = await db.Set<Customer>().AsNoTracking()
            .Include(c => c.Addresses).Include(c => c.Appliances)
            .AsSplitQuery()
            .FirstOrDefaultAsync(c => c.Id == customerId, ct);
        return customer is null ? CustomerErrors.NotFound : customer.ToResponse();
    }
}

/// <summary>Staff type a phone number first: is this an existing customer? (PLAN.md §9.2 de-duplication).</summary>
public sealed class FindCustomerByPhone(DbContext db) : IUseCase
{
    public async Task<Result<CustomerResponse>> HandleAsync(string phone, CancellationToken ct)
    {
        var number = PhoneNumber.Create(phone);
        if (number.IsFailure)
        {
            return number.Error!;
        }

        var customer = await db.Set<Customer>().AsNoTracking()
            .Include(c => c.Addresses).Include(c => c.Appliances)
            .AsSplitQuery()
            .FirstOrDefaultAsync(c => c.PrimaryPhone == number.Value, ct);
        return customer is null ? CustomerErrors.NotFound : customer.ToResponse();
    }
}

// ── Commands ────────────────────────────────────────────────────────────────

public sealed record CreateCustomerRequest(
    string FullName,
    string Phone,
    string? AlternatePhone,
    string? Email,
    string? PreferredLanguage,
    RequestChannel Source,
    string? Notes,
    AddressInput? Address);

internal sealed class CreateCustomerRequestValidator : AbstractValidator<CreateCustomerRequest>
{
    public CreateCustomerRequestValidator()
    {
        RuleFor(r => r.FullName).NotEmpty().MaximumLength(200);
        RuleFor(r => r.Phone).NotEmpty();
        RuleFor(r => r.Email).EmailAddress().When(r => !string.IsNullOrWhiteSpace(r.Email));
        RuleFor(r => r.PreferredLanguage).Must(Languages.IsSupported).When(r => r.PreferredLanguage is not null)
            .WithMessage("Supported languages are en, te and hi.");
        RuleFor(r => r.Address!).SetValidator(new AddressInputValidator()).When(r => r.Address is not null);
    }
}

public sealed class CreateCustomer(DbContext db) : IUseCase
{
    public async Task<Result<CustomerResponse>> HandleAsync(CreateCustomerRequest request, CancellationToken ct)
    {
        var phone = PhoneNumber.Create(request.Phone);
        if (phone.IsFailure)
        {
            return phone.Error!;
        }

        var existingId = await db.Set<Customer>().Where(c => c.PrimaryPhone == phone.Value).Select(c => (Guid?)c.Id).FirstOrDefaultAsync(ct);
        if (existingId is { } id)
        {
            return CustomerErrors.PhoneTaken(id);
        }

        var alternate = OptionalPhone(request.AlternatePhone);
        if (alternate.IsFailure)
        {
            return alternate.Error!;
        }

        var customer = Customer.Create(request.FullName, phone.Value, request.Source);
        customer.UpdateDetails(request.FullName, alternate.Value, request.Email, request.PreferredLanguage ?? "en", request.Notes);

        if (request.Address is { } addressInput)
        {
            var details = addressInput.ToDetails();
            if (details.IsFailure)
            {
                return details.Error!;
            }

            customer.AddAddress(details.Value, makeDefault: true);
        }

        db.Set<Customer>().Add(customer);
        await db.SaveChangesAsync(ct);
        return customer.ToResponse();
    }

    internal static Result<PhoneNumber?> OptionalPhone(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return Result<PhoneNumber?>.Success(null);
        }

        var phone = PhoneNumber.Create(raw);
        return phone.IsSuccess ? Result<PhoneNumber?>.Success(phone.Value) : phone.Error!;
    }
}

public sealed record UpdateCustomerRequest(
    string FullName,
    string Phone,
    string? AlternatePhone,
    string? Email,
    string PreferredLanguage,
    bool IsBlocked,
    string? Notes);

internal sealed class UpdateCustomerRequestValidator : AbstractValidator<UpdateCustomerRequest>
{
    public UpdateCustomerRequestValidator()
    {
        RuleFor(r => r.FullName).NotEmpty().MaximumLength(200);
        RuleFor(r => r.Phone).NotEmpty();
        RuleFor(r => r.Email).EmailAddress().When(r => !string.IsNullOrWhiteSpace(r.Email));
        RuleFor(r => r.PreferredLanguage).Must(Languages.IsSupported).WithMessage("Supported languages are en, te and hi.");
    }
}

public sealed class UpdateCustomer(DbContext db) : IUseCase
{
    public async Task<Result<CustomerResponse>> HandleAsync(Guid customerId, UpdateCustomerRequest request, CancellationToken ct)
    {
        var customer = await db.Set<Customer>()
            .Include(c => c.Addresses).Include(c => c.Appliances)
            .AsSplitQuery()
            .FirstOrDefaultAsync(c => c.Id == customerId, ct);
        if (customer is null)
        {
            return CustomerErrors.NotFound;
        }

        var phone = PhoneNumber.Create(request.Phone);
        if (phone.IsFailure)
        {
            return phone.Error!;
        }

        var takenBy = await db.Set<Customer>()
            .Where(c => c.Id != customerId && c.PrimaryPhone == phone.Value)
            .Select(c => (Guid?)c.Id)
            .FirstOrDefaultAsync(ct);
        if (takenBy is { } otherId)
        {
            return CustomerErrors.PhoneTaken(otherId);
        }

        var alternate = CreateCustomer.OptionalPhone(request.AlternatePhone);
        if (alternate.IsFailure)
        {
            return alternate.Error!;
        }

        customer.ChangePrimaryPhone(phone.Value);
        customer.UpdateDetails(request.FullName, alternate.Value, request.Email, request.PreferredLanguage, request.Notes);
        customer.SetBlocked(request.IsBlocked);
        await db.SaveChangesAsync(ct);
        return customer.ToResponse();
    }
}

public sealed record SaveAddressRequest(AddressInput Address, bool MakeDefault);

internal sealed class SaveAddressRequestValidator : AbstractValidator<SaveAddressRequest>
{
    public SaveAddressRequestValidator() => RuleFor(r => r.Address).NotNull().SetValidator(new AddressInputValidator());
}

public sealed class SaveAddress(DbContext db) : IUseCase
{
    public async Task<Result<AddressResponse>> HandleAsync(Guid customerId, Guid? addressId, SaveAddressRequest request, CancellationToken ct)
    {
        var customer = await db.Set<Customer>().Include(c => c.Addresses).FirstOrDefaultAsync(c => c.Id == customerId, ct);
        if (customer is null)
        {
            return CustomerErrors.NotFound;
        }

        var details = request.Address.ToDetails();
        if (details.IsFailure)
        {
            return details.Error!;
        }

        CustomerAddress address;
        if (addressId is { } id)
        {
            var updated = customer.UpdateAddress(id, details.Value, request.MakeDefault);
            if (updated.IsFailure)
            {
                return updated.Error!;
            }

            address = customer.Addresses.First(a => a.Id == id);
        }
        else
        {
            address = customer.AddAddress(details.Value, request.MakeDefault);
        }

        await db.SaveChangesAsync(ct);
        return address.ToResponse();
    }
}

public sealed class SaveAppliance(DbContext db) : IUseCase
{
    public async Task<Result<ApplianceResponse>> HandleAsync(Guid customerId, Guid? applianceId, ApplianceInput request, CancellationToken ct)
    {
        var customer = await db.Set<Customer>().Include(c => c.Appliances).FirstOrDefaultAsync(c => c.Id == customerId, ct);
        if (customer is null)
        {
            return CustomerErrors.NotFound;
        }

        CustomerAppliance appliance;
        if (applianceId is { } id)
        {
            var updated = customer.UpdateAppliance(id, request.ToDetails());
            if (updated.IsFailure)
            {
                return updated.Error!;
            }

            appliance = customer.Appliances.First(a => a.Id == id);
        }
        else
        {
            appliance = customer.AddAppliance(request.ToDetails());
        }

        await db.SaveChangesAsync(ct);
        return appliance.ToResponse();
    }
}

public static class Languages
{
    private static readonly HashSet<string> Supported = ["en", "te", "hi"];

    public static bool IsSupported(string? language) => language is not null && Supported.Contains(language);
}
