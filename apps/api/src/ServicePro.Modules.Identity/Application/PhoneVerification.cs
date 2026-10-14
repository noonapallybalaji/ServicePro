using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using ServicePro.BuildingBlocks.Security;
using ServicePro.Contracts;
using ServicePro.Contracts.Ports;
using ServicePro.Modules.Identity.Domain;
using ServicePro.SharedKernel.Abstractions;
using ServicePro.SharedKernel.Results;
using ServicePro.SharedKernel.ValueObjects;

namespace ServicePro.Modules.Identity.Application;

/// <summary>
/// Issues and checks one-time codes (PLAN.md §7.3 `otp_challenges`) for technician sign-in and
/// customer bookings. Participates in the caller's unit of work: it never saves.
/// </summary>
public sealed class PhoneVerification(DbContext db, IOtpSender sender, IOptions<AuthOptions> options, IClock clock) : IPhoneVerification
{
    private readonly AuthOptions _options = options.Value;

    public async Task<Result<IssuedOtp>> IssueAsync(PhoneNumber phone, OtpPurpose purpose, CancellationToken ct)
    {
        var now = clock.UtcNow;
        if (await IsCoolingDownAsync(phone, purpose, now, ct))
        {
            return Error.Conflict("otp.cooldown", "A code was just sent. Wait a few seconds before asking again.");
        }

        var code = SecureTokens.NumericCode(_options.OtpLength);
        var expiresAt = now.AddMinutes(_options.OtpTtlMinutes);
        db.Set<OtpChallenge>().Add(new OtpChallenge(phone, purpose, SecureTokens.Hash(code), expiresAt));

        // Send first: if no channel delivers, the caller doesn't save, so the customer can retry at once.
        if (!await sender.SendAsync(phone, code, purpose, ct))
        {
            return Error.Conflict("otp.delivery_failed", "We couldn't send the code right now. Please try again in a minute, or call us.");
        }

        return new IssuedOtp(expiresAt, _options.OtpLength, _options.ExposeOtpInResponse ? code : null);
    }

    /// <summary>What a caller returns when it decides not to send (no account enumeration).</summary>
    public IssuedOtp Pretend() => new(clock.UtcNow.AddMinutes(_options.OtpTtlMinutes), _options.OtpLength, null);

    public async Task<bool> IsCoolingDownAsync(PhoneNumber phone, OtpPurpose purpose, DateTimeOffset now, CancellationToken ct)
    {
        var lastSentAt = await db.Set<OtpChallenge>()
            .Where(o => o.Phone == phone && o.Purpose == purpose)
            .OrderByDescending(o => o.CreatedAt)
            .Select(o => (DateTimeOffset?)o.CreatedAt)
            .FirstOrDefaultAsync(ct);
        return lastSentAt is { } sent && now - sent < TimeSpan.FromSeconds(_options.OtpCooldownSeconds);
    }

    public async Task<Result> VerifyAsync(PhoneNumber phone, OtpPurpose purpose, string code, CancellationToken ct)
    {
        var challenge = await db.Set<OtpChallenge>()
            .Where(o => o.Phone == phone && o.Purpose == purpose && o.ConsumedAt == null)
            .OrderByDescending(o => o.CreatedAt)
            .FirstOrDefaultAsync(ct);

        return challenge is null
            ? Error.Validation("otp.expired", "This code has expired. Request a new one.")
            : challenge.Verify(code, clock.UtcNow);
    }
}
