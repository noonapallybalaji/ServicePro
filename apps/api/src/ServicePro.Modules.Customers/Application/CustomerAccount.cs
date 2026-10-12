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

public sealed record AccountResponse(Guid Id, string FullName, string Phone, string? Email, IReadOnlyList<AccountAddressResponse> Addresses);

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

        var customer = await db.Set<Customer>().AsNoTracking().Include(c => c.Addresses).FirstOrDefaultAsync(c => c.Id == customerId, ct);
        return customer is null ? AccountErrors.NotSignedIn : ToResponse(customer);
    }

    internal static AccountResponse ToResponse(Customer customer) => new(
        customer.Id,
        customer.FullName,
        customer.PrimaryPhone.Value,
        customer.Email,
        [.. customer.Addresses
            .OrderByDescending(a => a.IsDefault)
            .ThenByDescending(a => a.CreatedAt)
            .Select(a => new AccountAddressResponse(a.Id, a.Label, a.Line1, a.Line2, a.Landmark, a.Locality, a.City, a.Pincode, a.Location is not null, a.IsDefault))]);
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

        var customer = await db.Set<Customer>().Include(c => c.Addresses).FirstOrDefaultAsync(c => c.Id == customerId, ct);
        if (customer is null)
        {
            return AccountErrors.NotSignedIn;
        }

        customer.UpdateDetails(request.FullName, customer.AlternatePhone, request.Email, customer.PreferredLanguage, customer.Notes);
        await db.SaveChangesAsync(ct);
        return GetMyAccount.ToResponse(customer);
    }
}
