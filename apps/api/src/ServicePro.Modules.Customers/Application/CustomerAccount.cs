using FluentValidation;
using Microsoft.EntityFrameworkCore;
using ServicePro.BuildingBlocks.Application;
using ServicePro.Modules.Customers.Domain;
using ServicePro.SharedKernel.Abstractions;
using ServicePro.SharedKernel.Results;

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
    bool MakeDefault);

internal sealed class AddAccountAddressRequestValidator : AbstractValidator<AddAccountAddressRequest>
{
    public AddAccountAddressRequestValidator()
    {
        RuleFor(r => r.Label).MaximumLength(40);
        RuleFor(r => r.Line1).NotEmpty().WithMessage("Enter your house or flat number and street.").MaximumLength(200);
        RuleFor(r => r.Line2).MaximumLength(200);
        RuleFor(r => r.Landmark).MaximumLength(120);
        RuleFor(r => r.Locality).NotEmpty().WithMessage("Enter your area or locality.").MaximumLength(120);
        RuleFor(r => r.City).NotEmpty().WithMessage("Enter your city.").MaximumLength(80);
        RuleFor(r => r.Pincode).Matches("^[1-9][0-9]{5}$").WithMessage("Enter a 6-digit pincode.");
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
            new AddressDetails(request.Label, request.Line1, request.Line2, request.Landmark, request.Locality, request.City, string.Empty, request.Pincode, null),
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
            samePlace ? existing.Location : null), request.MakeDefault);
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
