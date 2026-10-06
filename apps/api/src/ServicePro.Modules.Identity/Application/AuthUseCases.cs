using FluentValidation;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using ServicePro.BuildingBlocks.Application;
using ServicePro.BuildingBlocks.Security;
using ServicePro.Contracts;
using ServicePro.Contracts.Ports;
using ServicePro.Modules.Identity.Domain;
using ServicePro.SharedKernel.Abstractions;
using ServicePro.SharedKernel.Results;
using ServicePro.SharedKernel.ValueObjects;

namespace ServicePro.Modules.Identity.Application;

internal static class AuthErrors
{
    public static readonly Error InvalidCredentials =
        Error.Unauthorized("auth.invalid_credentials", "Email or password is incorrect.");

    public static readonly Error SessionExpired =
        Error.Unauthorized("auth.session_expired", "Your session has ended. Please sign in again.");
}

// ── Staff: email + password ─────────────────────────────────────────────────

public sealed record PasswordLoginRequest(string Email, string Password);

internal sealed class PasswordLoginRequestValidator : AbstractValidator<PasswordLoginRequest>
{
    public PasswordLoginRequestValidator()
    {
        RuleFor(r => r.Email).NotEmpty().EmailAddress();
        RuleFor(r => r.Password).NotEmpty();
    }
}

public sealed class LoginWithPassword(DbContext db, IPasswordHasher<User> hasher, SessionIssuer sessions, IClock clock) : IUseCase
{
    public async Task<Result<IssuedSession>> HandleAsync(PasswordLoginRequest request, CancellationToken ct)
    {
        var email = User.NormalizeEmail(request.Email);
        var user = await db.Set<User>().FirstOrDefaultAsync(u => u.Email == email, ct);

        if (user is not { IsActive: true, IsStaff: true, PasswordHash: { } hash } ||
            hasher.VerifyHashedPassword(user, hash, request.Password) == PasswordVerificationResult.Failed)
        {
            return AuthErrors.InvalidCredentials;
        }

        user.RecordLogin(clock.UtcNow);
        var session = await sessions.IssueAsync(user, familyId: null, ct);
        await db.SaveChangesAsync(ct);
        return session;
    }
}

// ── Technicians: phone + OTP ────────────────────────────────────────────────

public sealed record OtpRequest(string Phone);

public sealed record OtpRequestedResponse(DateTimeOffset ExpiresAt, int CodeLength, string? DevelopmentCode);

public sealed class RequestLoginOtp(DbContext db, PhoneVerification verification, IClock clock) : IUseCase
{
    public async Task<Result<OtpRequestedResponse>> HandleAsync(OtpRequest request, CancellationToken ct)
    {
        var phoneResult = PhoneNumber.Create(request.Phone);
        if (phoneResult.IsFailure)
        {
            return phoneResult.Error!;
        }

        var phone = phoneResult.Value;
        if (await verification.IsCoolingDownAsync(phone, OtpPurpose.Login, clock.UtcNow, ct))
        {
            return Error.Conflict("otp.cooldown", "A code was just sent. Wait a few seconds before asking again.");
        }

        // Respond identically whether or not the number belongs to a technician (no account enumeration).
        var isTechnician = await db.Set<User>().AnyAsync(u => u.Phone == phone && u.IsActive && u.Role == UserRole.Technician, ct);
        if (!isTechnician)
        {
            return ToResponse(verification.Pretend());
        }

        var issued = await verification.IssueAsync(phone, OtpPurpose.Login, ct);
        if (issued.IsFailure)
        {
            return issued.Error!;
        }

        await db.SaveChangesAsync(ct);
        return ToResponse(issued.Value);
    }

    private static OtpRequestedResponse ToResponse(IssuedOtp otp) => new(otp.ExpiresAt, otp.CodeLength, otp.DevelopmentCode);
}

public sealed record OtpVerifyRequest(string Phone, string Code);

internal sealed class OtpVerifyRequestValidator : AbstractValidator<OtpVerifyRequest>
{
    public OtpVerifyRequestValidator()
    {
        RuleFor(r => r.Phone).NotEmpty();
        RuleFor(r => r.Code).NotEmpty().Matches("^[0-9]{4,8}$").WithMessage("Enter the numeric code from the SMS.");
    }
}

public sealed class VerifyLoginOtp(DbContext db, PhoneVerification verification, SessionIssuer sessions, IClock clock) : IUseCase
{
    public async Task<Result<IssuedSession>> HandleAsync(OtpVerifyRequest request, CancellationToken ct)
    {
        var phoneResult = PhoneNumber.Create(request.Phone);
        if (phoneResult.IsFailure)
        {
            return phoneResult.Error!;
        }

        var phone = phoneResult.Value;
        var verified = await verification.VerifyAsync(phone, OtpPurpose.Login, request.Code, ct);
        if (verified.IsFailure)
        {
            await db.SaveChangesAsync(ct); // persist the attempt count
            return verified.Error!;
        }

        var user = await db.Set<User>().FirstOrDefaultAsync(u => u.Phone == phone && u.IsActive && u.Role == UserRole.Technician, ct);
        if (user is null)
        {
            return AuthErrors.InvalidCredentials;
        }

        user.RecordLogin(clock.UtcNow);
        var session = await sessions.IssueAsync(user, familyId: null, ct);
        await db.SaveChangesAsync(ct);
        return session;
    }
}

// ── Session lifecycle ───────────────────────────────────────────────────────

public sealed class RefreshSession(DbContext db, SessionIssuer sessions, ServicePro.BuildingBlocks.Persistence.TenantScope tenant, IClock clock) : IUseCase
{
    public async Task<Result<IssuedSession>> HandleAsync(string? refreshToken, CancellationToken ct)
    {
        if (string.IsNullOrEmpty(refreshToken))
        {
            return AuthErrors.SessionExpired;
        }

        var hash = SecureTokens.Hash(refreshToken);
        var token = await db.Set<RefreshToken>().IgnoreQueryFilters().FirstOrDefaultAsync(t => t.TokenHash == hash, ct);
        var now = clock.UtcNow;

        if (token is null)
        {
            return AuthErrors.SessionExpired;
        }

        // The refresh call carries no access token, so the tenant comes from the token itself.
        tenant.Use(token.TenantId);

        if (token.RevokedAt is not null)
        {
            // A rotated token was presented again: assume theft and end the whole chain.
            await RevokeFamilyAsync(token.FamilyId, now, ct);
            await db.SaveChangesAsync(ct);
            return AuthErrors.SessionExpired;
        }

        var user = await db.Set<User>().IgnoreQueryFilters().FirstOrDefaultAsync(u => u.Id == token.UserId, ct);
        if (!token.IsActive(now) || user is not { IsActive: true })
        {
            return AuthErrors.SessionExpired;
        }

        var session = await sessions.IssueAsync(user, token.FamilyId, ct);
        token.Revoke(now, session.RefreshTokenId);
        await db.SaveChangesAsync(ct);
        return session;
    }

    private async Task RevokeFamilyAsync(Guid familyId, DateTimeOffset now, CancellationToken ct)
    {
        var family = await db.Set<RefreshToken>().IgnoreQueryFilters()
            .Where(t => t.FamilyId == familyId && t.RevokedAt == null)
            .ToListAsync(ct);
        family.ForEach(t => t.Revoke(now));
    }
}

public sealed class Logout(DbContext db, IClock clock) : IUseCase
{
    public async Task HandleAsync(string? refreshToken, CancellationToken ct)
    {
        if (string.IsNullOrEmpty(refreshToken))
        {
            return;
        }

        var hash = SecureTokens.Hash(refreshToken);
        var token = await db.Set<RefreshToken>().IgnoreQueryFilters().FirstOrDefaultAsync(t => t.TokenHash == hash, ct);
        if (token is null)
        {
            return;
        }

        var now = clock.UtcNow;
        var family = await db.Set<RefreshToken>().IgnoreQueryFilters()
            .Where(t => t.FamilyId == token.FamilyId && t.RevokedAt == null)
            .ToListAsync(ct);
        family.ForEach(t => t.Revoke(now));
        await db.SaveChangesAsync(ct);
    }
}

public sealed class GetMe(DbContext db, ICurrentUser currentUser) : IUseCase
{
    public async Task<Result<MeResponse>> HandleAsync(CancellationToken ct)
    {
        var user = await db.Set<User>().AsNoTracking().FirstOrDefaultAsync(u => u.Id == currentUser.UserId, ct);
        return user is null
            ? AuthErrors.SessionExpired
            : SessionIssuer.ToMe(user, currentUser.TechnicianId);
    }
}
