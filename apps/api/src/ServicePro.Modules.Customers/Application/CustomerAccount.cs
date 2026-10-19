using FluentValidation;
using Microsoft.EntityFrameworkCore;
using ServicePro.BuildingBlocks.Application;
using ServicePro.Contracts;
using ServicePro.Contracts.Ports;
using ServicePro.Modules.Customers.Domain;
using ServicePro.SharedKernel.Abstractions;
using ServicePro.SharedKernel.Results;
using ServicePro.SharedKernel.ValueObjects;

namespace ServicePro.Modules.Customers.Application;

/*
 * The signed-in customer's own account on the customer site. Every query is scoped to the
 * customer_id in their token — there is no id in the URL to tamper with.
 */

public sealed record AccountAddressResponse(
    Guid Id,
    string? Label,
    string Line1,
    string? Line2,
    string? Landmark,
    string Locality,
    string City,
    string Pincode,
    bool HasLocation,
    bool IsDefault);

/// <summary>When the customer accepted a version of the terms and privacy policy, and where.</summary>
public sealed record AccountConsentResponse(string PolicyVersion, DateTimeOffset AcceptedAt, ServicePro.Contracts.RequestChannel Source);

public sealed record AccountResponse(
    Guid Id,
    string FullName,
    string Phone,
    string? Email,
    IReadOnlyList<AccountAddressResponse> Addresses,
    IReadOnlyList<AccountConsentResponse> Consents);

internal static class AccountErrors
{
    public static readonly Error NotSignedIn = Error.Unauthorized("account.not_signed_in", "Please sign in to see your account.");
}

public sealed class GetMyAccount(DbContext db, ICurrentUser currentUser) : IUseCase
{
    public async Task<Result<AccountResponse>> HandleAsync(CancellationToken ct)
    {
        if (currentUser.CustomerId is not { } customerId)
        {
            return AccountErrors.NotSignedIn;
        }

        var customer = await db.Set<Customer>().AsNoTracking()
            .Include(c => c.Addresses)
            .Include(c => c.Consents)
            .FirstOrDefaultAsync(c => c.Id == customerId && c.ErasedAt == null, ct);
        return customer is null ? AccountErrors.NotSignedIn : ToResponse(customer);
    }

    internal static AccountResponse ToResponse(Customer customer) => new(
        customer.Id,
        customer.FullName,
        customer.PrimaryPhone.Value,
        customer.Email,
        [.. customer.ActiveAddresses
            .OrderByDescending(a => a.IsDefault)
            .ThenByDescending(a => a.CreatedAt)
            .Select(a => new AccountAddressResponse(a.Id, a.Label, a.Line1, a.Line2, a.Landmark, a.Locality, a.City, a.Pincode, a.Location is not null, a.IsDefault))],
        [.. customer.Consents.OrderByDescending(c => c.AcceptedAt).Select(c => new AccountConsentResponse(c.PolicyVersion, c.AcceptedAt, c.Source))]);
}

public sealed record UpdateAccountRequest(string FullName, string? Email);

internal sealed class UpdateAccountRequestValidator : AbstractValidator<UpdateAccountRequest>
{
    public UpdateAccountRequestValidator()
    {
        RuleFor(r => r.FullName).NotEmpty().WithMessage("Enter your name.").MaximumLength(120);
        RuleFor(r => r.Email).EmailAddress().WithMessage("Enter a valid email address.").MaximumLength(200).When(r => !string.IsNullOrWhiteSpace(r.Email));
    }
}

/// <summary>Customers can correct their name and add an email; the phone is their sign-in, so it stays.</summary>
public sealed class UpdateMyAccount(DbContext db, ICurrentUser currentUser) : IUseCase
{
    public async Task<Result<AccountResponse>> HandleAsync(UpdateAccountRequest request, CancellationToken ct)
    {
        if (currentUser.CustomerId is not { } customerId)
        {
            return AccountErrors.NotSignedIn;
        }

        var customer = await db.Set<Customer>().Include(c => c.Addresses).Include(c => c.Consents).FirstOrDefaultAsync(c => c.Id == customerId && c.ErasedAt == null, ct);
        if (customer is null)
        {
            return AccountErrors.NotSignedIn;
        }

        customer.UpdateDetails(request.FullName, customer.AlternatePhone, request.Email, customer.PreferredLanguage, customer.Notes);
        await db.SaveChangesAsync(ct);
        return GetMyAccount.ToResponse(customer);
    }
}

public sealed record AddAccountAddressRequest(
    string? Label,
    string Line1,
    string? Line2,
    string? Landmark,
    string Locality,
    string City,
    string Pincode,
    bool MakeDefault,
    double? Latitude = null,
    double? Longitude = null)
{
    /// <summary>The map pin from the customer's device, when both coordinates were sent and are valid.</summary>
    public GeoLocation? ToPin() => Latitude is { } lat && Longitude is { } lng && GeoLocation.Create(lat, lng) is { IsSuccess: true } pin ? pin.Value : null;
}

internal sealed class AddAccountAddressRequestValidator : AbstractValidator<AddAccountAddressRequest>
{
    public AddAccountAddressRequestValidator()
    {
        RuleFor(r => r.Label).MaximumLength(40);
        // Optional, like at booking: addresses saved from a booking may have only the area and the map pin.
        RuleFor(r => r.Line1).MaximumLength(200);
        RuleFor(r => r.Line2).MaximumLength(200);
        RuleFor(r => r.Landmark).MaximumLength(120);
        RuleFor(r => r.Locality).NotEmpty().WithMessage("Enter your area or locality.").MaximumLength(120);
        RuleFor(r => r.City).NotEmpty().WithMessage("Enter your city.").MaximumLength(80);
        RuleFor(r => r.Pincode).Matches("^[1-9][0-9]{5}$").WithMessage("Enter a 6-digit pincode.");
        RuleFor(r => r.Latitude).InclusiveBetween(-90, 90).When(r => r.Latitude.HasValue);
        RuleFor(r => r.Longitude).InclusiveBetween(-180, 180).When(r => r.Longitude.HasValue);
        RuleFor(r => r).Must(r => r.Latitude.HasValue == r.Longitude.HasValue).WithMessage("Send both latitude and longitude, or neither.");
    }
}

/// <summary>Saves an address to the signed-in customer's account (offered at the next booking).</summary>
public sealed class AddMyAddress(DbContext db, ICurrentUser currentUser) : IUseCase
{
    private const int MaxAddresses = 10;

    public async Task<Result<AccountResponse>> HandleAsync(AddAccountAddressRequest request, CancellationToken ct)
    {
        if (currentUser.CustomerId is not { } customerId)
        {
            return AccountErrors.NotSignedIn;
        }

        var customer = await db.Set<Customer>().Include(c => c.Addresses).Include(c => c.Consents).FirstOrDefaultAsync(c => c.Id == customerId && c.ErasedAt == null, ct);
        if (customer is null)
        {
            return AccountErrors.NotSignedIn;
        }

        if (customer.ActiveAddresses.Count() >= MaxAddresses)
        {
            return Error.Conflict("account.too_many_addresses", "You can save up to 10 addresses. Call us to remove old ones.");
        }

        customer.AddAddress(
            new AddressDetails(request.Label, request.Line1, request.Line2, request.Landmark, request.Locality, request.City, string.Empty, request.Pincode, request.ToPin()),
            request.MakeDefault);
        await db.SaveChangesAsync(ct);
        return GetMyAccount.ToResponse(customer);
    }
}

/// <summary>Edit one of the signed-in customer's saved addresses (or make it the default).</summary>
public sealed class UpdateMyAddress(DbContext db, ICurrentUser currentUser) : IUseCase
{
    public async Task<Result<AccountResponse>> HandleAsync(Guid addressId, AddAccountAddressRequest request, CancellationToken ct)
    {
        if (currentUser.CustomerId is not { } customerId)
        {
            return AccountErrors.NotSignedIn;
        }

        var customer = await db.Set<Customer>().Include(c => c.Addresses).Include(c => c.Consents).FirstOrDefaultAsync(c => c.Id == customerId && c.ErasedAt == null, ct);
        var existing = customer?.ActiveAddresses.FirstOrDefault(a => a.Id == addressId);
        if (customer is null || existing is null)
        {
            return Error.NotFound("address.not_found", "We couldn't find this address in your account.");
        }

        // The pin stays if the street address is unchanged; a new street address drops it.
        var samePlace = string.Equals(existing.Line1, request.Line1.Trim(), StringComparison.OrdinalIgnoreCase) && existing.Pincode == request.Pincode.Trim();
        var updated = customer.UpdateAddress(addressId, new AddressDetails(
            request.Label, request.Line1, request.Line2, request.Landmark, request.Locality, request.City, existing.State, request.Pincode,
            request.ToPin() ?? (samePlace ? existing.Location : null)), request.MakeDefault);
        if (updated.IsFailure)
        {
            return updated.Error!;
        }

        await db.SaveChangesAsync(ct);
        return GetMyAccount.ToResponse(customer);
    }
}

/// <summary>Remove a saved address. Bookings that used it keep it; it just isn't offered any more.</summary>
public sealed class RemoveMyAddress(DbContext db, ICurrentUser currentUser) : IUseCase
{
    public async Task<Result<AccountResponse>> HandleAsync(Guid addressId, CancellationToken ct)
    {
        if (currentUser.CustomerId is not { } customerId)
        {
            return AccountErrors.NotSignedIn;
        }

        var customer = await db.Set<Customer>().Include(c => c.Addresses).Include(c => c.Consents).FirstOrDefaultAsync(c => c.Id == customerId && c.ErasedAt == null, ct);
        if (customer is null)
        {
            return AccountErrors.NotSignedIn;
        }

        var removed = customer.RemoveAddress(addressId);
        if (removed.IsFailure)
        {
            return removed.Error!;
        }

        await db.SaveChangesAsync(ct);
        return GetMyAccount.ToResponse(customer);
    }
}

/* ── Changing the sign-in number ──────────────────────────────────────────
 * The mobile number is how the customer signs in, so a new one must be proven with a code sent
 * to it. A number another account already uses is refused (the office merges accounts). Sessions
 * stay valid: they belong to the customer, and the next refresh carries the new number.
 */

public sealed record PhoneChangeCodeRequest(string Phone);

public sealed record PhoneChangeCodeResponse(DateTimeOffset ExpiresAt, int CodeLength, string? DevelopmentCode);

public sealed record ChangePhoneRequest(string Phone, string Code);

internal sealed class ChangePhoneRequestValidator : AbstractValidator<ChangePhoneRequest>
{
    public ChangePhoneRequestValidator()
    {
        RuleFor(r => r.Phone).NotEmpty();
        RuleFor(r => r.Code).Matches("^[0-9]{4,8}$").WithMessage("Enter the numeric code from the SMS.");
    }
}

internal static class PhoneChangeRules
{
    /// <summary>The signed-in customer and the new number, or why the change isn't possible.</summary>
    public static async Task<Result<(Customer Customer, PhoneNumber Phone)>> CheckAsync(DbContext db, ICurrentUser currentUser, string phone, CancellationToken ct)
    {
        if (currentUser.CustomerId is not { } customerId)
        {
            return AccountErrors.NotSignedIn;
        }

        var parsed = PhoneNumber.Create(phone);
        if (parsed.IsFailure)
        {
            return parsed.Error!;
        }

        var customer = await db.Set<Customer>().Include(c => c.Addresses).Include(c => c.Consents).FirstOrDefaultAsync(c => c.Id == customerId && c.ErasedAt == null, ct);
        if (customer is null)
        {
            return AccountErrors.NotSignedIn;
        }

        if (customer.PrimaryPhone == parsed.Value)
        {
            return Error.Validation("account.phone_unchanged", "That's already your mobile number.");
        }

        if (await db.Set<Customer>().AnyAsync(c => c.Id != customerId && c.PrimaryPhone == parsed.Value, ct))
        {
            return Error.Conflict("account.phone_in_use", "This number is already linked to another account. Call us and we'll help you move your bookings.");
        }

        return (customer, parsed.Value);
    }
}

/// <summary>Sends a code to the new number.</summary>
public sealed class RequestPhoneChangeCode(DbContext db, ICurrentUser currentUser, IPhoneVerification verification) : IUseCase
{
    public async Task<Result<PhoneChangeCodeResponse>> HandleAsync(PhoneChangeCodeRequest request, CancellationToken ct)
    {
        var check = await PhoneChangeRules.CheckAsync(db, currentUser, request.Phone, ct);
        if (check.IsFailure)
        {
            return check.Error!;
        }

        var issued = await verification.IssueAsync(check.Value.Phone, OtpPurpose.ChangePhone, ct);
        if (issued.IsFailure)
        {
            return issued.Error!;
        }

        await db.SaveChangesAsync(ct);
        return new PhoneChangeCodeResponse(issued.Value.ExpiresAt, issued.Value.CodeLength, issued.Value.DevelopmentCode);
    }
}

/// <summary>Checks the code and switches the sign-in number.</summary>
public sealed class ChangeMyPhone(DbContext db, ICurrentUser currentUser, IPhoneVerification verification) : IUseCase
{
    public async Task<Result<AccountResponse>> HandleAsync(ChangePhoneRequest request, CancellationToken ct)
    {
        var check = await PhoneChangeRules.CheckAsync(db, currentUser, request.Phone, ct);
        if (check.IsFailure)
        {
            return check.Error!;
        }

        var verified = await verification.VerifyAsync(check.Value.Phone, OtpPurpose.ChangePhone, request.Code, ct);
        if (verified.IsFailure)
        {
            await db.SaveChangesAsync(ct); // persist the attempt count
            return verified.Error!;
        }

        check.Value.Customer.ChangePrimaryPhone(check.Value.Phone);
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException)
        {
            // Another account took the number in the meantime (unique per tenant).
            return Error.Conflict("account.phone_in_use", "This number is already linked to another account. Call us and we'll help you move your bookings.");
        }

        return GetMyAccount.ToResponse(check.Value.Customer);
    }
}
