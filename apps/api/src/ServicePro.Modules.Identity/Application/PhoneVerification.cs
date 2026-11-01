using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
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
public sealed partial class PhoneVerification(
    DbContext db, IOtpSender sender, IOptions<AuthOptions> options, IClock clock, ILogger<PhoneVerification> logger) : IPhoneVerification
{
    private readonly AuthOptions _options = options.Value;

    public async Task<Result<IssuedOtp>> IssueAsync(PhoneNumber phone, OtpPurpose purpose, CancellationToken ct)
    {
        var now = clock.UtcNow;
        if (await CooldownAsync(phone, purpose, now, ct) is { } wait)
        {
            return wait;
        }

        var code = SecureTokens.NumericCode(_options.OtpLength);
        var expiresAt = now.AddMinutes(_options.OtpTtlMinutes);
        db.Set<OtpChallenge>().Add(new OtpChallenge(phone, purpose, SecureTokens.Hash(code), expiresAt));

        // Send first: if no channel delivers, the caller doesn't save, so the customer can retry at once.
        // Development and test deployments show the code on screen anyway, so delivery there is a bonus
        // (a provider in a sandbox, or none at all, mustn't block testing).
        if (!await sender.SendAsync(phone, code, purpose, ct))
        {
            if (!_options.ExposeOtpInResponse)
            {
                return Error.Conflict("otp.delivery_failed", "We couldn't send the code right now. Please try again in a minute, or call us.");
            }

            LogUndelivered(purpose);
        }

        return new IssuedOtp(expiresAt, _options.OtpLength, _options.ExposeOtpInResponse ? code : null);
    }

    /// <summary>
    /// The error to return while the last code is too recent to send another, naming how long to wait
    /// (Details "retryAfterSeconds", so a screen can count down); null when a code may be sent.
    /// </summary>
    public async Task<Error?> CooldownAsync(PhoneNumber phone, OtpPurpose purpose, DateTimeOffset now, CancellationToken ct)
    {
        var lastSentAt = await db.Set<OtpChallenge>()
            .Where(o => o.Phone == phone && o.Purpose == purpose)
            .OrderByDescending(o => o.CreatedAt)
            .Select(o => (DateTimeOffset?)o.CreatedAt)
            .FirstOrDefaultAsync(ct);
        var wait = lastSentAt is { } sent ? TimeSpan.FromSeconds(_options.OtpCooldownSeconds) - (now - sent) : TimeSpan.Zero;
        if (wait <= TimeSpan.Zero)
        {
            return null;
        }

        var seconds = (int)Math.Ceiling(wait.TotalSeconds);
        return Error.Conflict("otp.cooldown", $"A code was just sent. You can ask for a new one in {seconds} seconds.") with
        {
            Details = new Dictionary<string, string> { ["retryAfterSeconds"] = seconds.ToString(System.Globalization.CultureInfo.InvariantCulture) },
        };
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

    [LoggerMessage(Level = LogLevel.Warning, Message = "No channel delivered the {Purpose} code; it is shown on screen (codes are exposed in this environment).")]
    private partial void LogUndelivered(OtpPurpose purpose);
}
