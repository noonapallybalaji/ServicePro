using System.Security.Claims;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using ServicePro.BuildingBlocks.Application;
using ServicePro.BuildingBlocks.Persistence;
using ServicePro.BuildingBlocks.Security;
using ServicePro.Contracts;
using ServicePro.Contracts.Ports;
using ServicePro.Modules.Identity.Domain;
using ServicePro.SharedKernel.Abstractions;
using ServicePro.SharedKernel.Results;
using ServicePro.SharedKernel.ValueObjects;

namespace ServicePro.Modules.Identity.Application;

/*
 * Customer sessions. Customers are not Identity users: they prove their phone with a one-time
 * code (when booking, or from "My bookings") and get a token with role "Customer" and a
 * customer_id claim. Refresh tokens rotate exactly like staff sessions (ADR 0005), in their own
 * table and cookie.
 */

/// <summary>Issues customer sessions; implements the <see cref="ICustomerSessions"/> port.</summary>
public sealed class CustomerSessionIssuer(DbContext db, IOptions<AuthOptions> options, ITenantContext tenant, IClock clock, AccessTokenWriter tokens)
    : ICustomerSessions
{
    private readonly AuthOptions _options = options.Value;

    public Task<IssuedCustomerSession> IssueAsync(CustomerInfo customer, CancellationToken ct) => Task.FromResult(Issue(customer, familyId: null).Session);

    internal (IssuedCustomerSession Session, Guid TokenId) Issue(CustomerInfo customer, Guid? familyId)
    {
        var now = clock.UtcNow;
        var accessExpires = now.AddMinutes(_options.AccessTokenMinutes);
        var accessToken = tokens.Write(
            [
                new Claim(ServiceProClaims.Subject, customer.Id.ToString()),
                new Claim(ServiceProClaims.Role, CustomerRole.Name),
                new Claim(ServiceProClaims.CustomerId, customer.Id.ToString()),
                new Claim(ServiceProClaims.TenantId, tenant.TenantId.ToString()),
                new Claim(ServiceProClaims.Name, customer.FullName),
            ],
            now,
            accessExpires);

        var refreshPlain = SecureTokens.Generate();
        var refreshExpires = now.AddDays(_options.CustomerSessionDays);
        var refreshToken = new CustomerRefreshToken(customer.Id, SecureTokens.Hash(refreshPlain), familyId ?? Guid.CreateVersion7(), refreshExpires);
        db.Set<CustomerRefreshToken>().Add(refreshToken);

        var user = new CustomerSessionUser(customer.Id, customer.FullName, "CUSTOMER", customer.Phone.Value, customer.PreferredLanguage);
        return (new IssuedCustomerSession(new CustomerSessionResponse(accessToken, accessExpires, user), refreshPlain, refreshExpires), refreshToken.Id);
    }
}

internal static class CustomerAuthErrors
{
    public static readonly Error SessionExpired =
        Error.Unauthorized("customer_auth.session_expired", "Please sign in again to see your bookings.");

    public static readonly Error NoAccount = Error.NotFound(
        "customer_auth.no_account",
        "We couldn't find any bookings for this number. Book a repair and you'll be signed in automatically.");
}

// ── Sign in from "My bookings": code, then verify ──────────────────────────

public sealed record CustomerCodeRequest(string Phone);

internal sealed class CustomerCodeRequestValidator : AbstractValidator<CustomerCodeRequest>
{
    public CustomerCodeRequestValidator() => RuleFor(r => r.Phone).NotEmpty();
}

public sealed class RequestCustomerSignInCode(DbContext db, PhoneVerification verification) : IUseCase
{
    public async Task<Result<OtpRequestedResponse>> HandleAsync(CustomerCodeRequest request, CancellationToken ct)
    {
        var phone = PhoneNumber.Create(request.Phone);
        if (phone.IsFailure)
        {
            return phone.Error!;
        }

        // Always send: whether a number has bookings is only revealed after the code proves ownership.
        var issued = await verification.IssueAsync(phone.Value, OtpPurpose.CustomerLogin, ct);
        if (issued.IsFailure)
        {
            return issued.Error!;
        }

        await db.SaveChangesAsync(ct);
        return new OtpRequestedResponse(issued.Value.ExpiresAt, issued.Value.CodeLength, issued.Value.DevelopmentCode);
    }
}

public sealed record CustomerVerifyRequest(string Phone, string Code);

internal sealed class CustomerVerifyRequestValidator : AbstractValidator<CustomerVerifyRequest>
{
    public CustomerVerifyRequestValidator()
    {
        RuleFor(r => r.Phone).NotEmpty();
        RuleFor(r => r.Code).NotEmpty().Matches("^[0-9]{4,8}$").WithMessage("Enter the numeric code from the SMS.");
    }
}

public sealed class VerifyCustomerSignIn(DbContext db, PhoneVerification verification, ICustomerDirectory customers, CustomerSessionIssuer sessions) : IUseCase
{
    public async Task<Result<IssuedCustomerSession>> HandleAsync(CustomerVerifyRequest request, CancellationToken ct)
    {
        var phone = PhoneNumber.Create(request.Phone);
        if (phone.IsFailure)
        {
            return phone.Error!;
        }

        var verified = await verification.VerifyAsync(phone.Value, OtpPurpose.CustomerLogin, request.Code, ct);
        if (verified.IsFailure)
        {
            await db.SaveChangesAsync(ct); // persist the attempt count
            return verified.Error!;
        }

        var customer = await customers.FindByPhoneAsync(phone.Value, ct);
        if (customer is null)
        {
            await db.SaveChangesAsync(ct); // the code is used up either way
            return CustomerAuthErrors.NoAccount;
        }

        var (session, _) = sessions.Issue(customer, familyId: null);
        await db.SaveChangesAsync(ct);
        return session;
    }
}

// ── Keep signed in / sign out ──────────────────────────────────────────────

public sealed class RefreshCustomerSession(DbContext db, ICustomerDirectory customers, CustomerSessionIssuer sessions, TenantScope tenant, IClock clock) : IUseCase
{
    public async Task<Result<IssuedCustomerSession>> HandleAsync(string? refreshToken, CancellationToken ct)
    {
        if (string.IsNullOrEmpty(refreshToken))
        {
            return CustomerAuthErrors.SessionExpired;
        }

        var hash = SecureTokens.Hash(refreshToken);
        var token = await db.Set<CustomerRefreshToken>().IgnoreQueryFilters().FirstOrDefaultAsync(t => t.TokenHash == hash, ct);
        if (token is null)
        {
            return CustomerAuthErrors.SessionExpired;
        }

        // The refresh call carries no access token, so the tenant comes from the token itself.
        tenant.Use(token.TenantId);
        var now = clock.UtcNow;

        if (token.RevokedAt is not null)
        {
            // A rotated token was presented again: assume theft and end the whole chain.
            var family = await db.Set<CustomerRefreshToken>().IgnoreQueryFilters()
                .Where(t => t.FamilyId == token.FamilyId && t.RevokedAt == null)
                .ToListAsync(ct);
            family.ForEach(t => t.Revoke(now));
            await db.SaveChangesAsync(ct);
            return CustomerAuthErrors.SessionExpired;
        }

        var customer = await customers.GetAsync(token.CustomerId, ct);
        if (!token.IsActive(now) || customer is null)
        {
            return CustomerAuthErrors.SessionExpired;
        }

        var (session, newTokenId) = sessions.Issue(customer, token.FamilyId);
        token.Revoke(now, newTokenId);
        await db.SaveChangesAsync(ct);
        return session;
    }
}

public sealed class SignOutCustomer(DbContext db, IClock clock) : IUseCase
{
    public async Task HandleAsync(string? refreshToken, CancellationToken ct)
    {
        if (string.IsNullOrEmpty(refreshToken))
        {
            return;
        }

        var hash = SecureTokens.Hash(refreshToken);
        var token = await db.Set<CustomerRefreshToken>().IgnoreQueryFilters().FirstOrDefaultAsync(t => t.TokenHash == hash, ct);
        if (token is null)
        {
            return;
        }

        var now = clock.UtcNow;
        var family = await db.Set<CustomerRefreshToken>().IgnoreQueryFilters()
            .Where(t => t.FamilyId == token.FamilyId && t.RevokedAt == null)
            .ToListAsync(ct);
        family.ForEach(t => t.Revoke(now));
        await db.SaveChangesAsync(ct);
    }
}
