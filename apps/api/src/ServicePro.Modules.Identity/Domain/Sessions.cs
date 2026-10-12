using ServicePro.BuildingBlocks.Security;
using ServicePro.Contracts;
using ServicePro.SharedKernel.Domain;
using ServicePro.SharedKernel.Results;
using ServicePro.SharedKernel.ValueObjects;

namespace ServicePro.Modules.Identity.Domain;

/// <summary>
/// One link in a refresh-token chain (ADR 0005). Tokens rotate on every use; the family id
/// lets us revoke the whole chain when a revoked token is replayed.
/// </summary>
public sealed class RefreshToken : TenantOwnedEntity
{
    private RefreshToken()
    {
    }

    public RefreshToken(Guid userId, string tokenHash, Guid familyId, DateTimeOffset expiresAt)
    {
        UserId = userId;
        TokenHash = tokenHash;
        FamilyId = familyId;
        ExpiresAt = expiresAt;
    }

    public Guid UserId { get; private set; }

    public string TokenHash { get; private set; } = string.Empty;

    public Guid FamilyId { get; private set; }

    public DateTimeOffset ExpiresAt { get; private set; }

    public DateTimeOffset? RevokedAt { get; private set; }

    public Guid? ReplacedByTokenId { get; private set; }

    public bool IsActive(DateTimeOffset now) => RevokedAt is null && ExpiresAt > now;

    public void Revoke(DateTimeOffset now, Guid? replacedBy = null)
    {
        RevokedAt ??= now;
        ReplacedByTokenId ??= replacedBy;
    }
}

/// <summary>
/// One link in a customer's refresh-token chain. Same rotation and replay rules as
/// <see cref="RefreshToken"/>, but for customers, who have no user account.
/// </summary>
public sealed class CustomerRefreshToken : TenantOwnedEntity
{
    private CustomerRefreshToken()
    {
    }

    public CustomerRefreshToken(Guid customerId, string tokenHash, Guid familyId, DateTimeOffset expiresAt)
    {
        CustomerId = customerId;
        TokenHash = tokenHash;
        FamilyId = familyId;
        ExpiresAt = expiresAt;
    }

    public Guid CustomerId { get; private set; }

    public string TokenHash { get; private set; } = string.Empty;

    public Guid FamilyId { get; private set; }

    public DateTimeOffset ExpiresAt { get; private set; }

    public DateTimeOffset? RevokedAt { get; private set; }

    public Guid? ReplacedByTokenId { get; private set; }

    public bool IsActive(DateTimeOffset now) => RevokedAt is null && ExpiresAt > now;

    public void Revoke(DateTimeOffset now, Guid? replacedBy = null)
    {
        RevokedAt ??= now;
        ReplacedByTokenId ??= replacedBy;
    }
}

/// <summary>A one-time code sent to a phone (PLAN.md §7.3 `otp_challenges`).</summary>
public sealed class OtpChallenge : TenantOwnedEntity
{
    public const int MaxAttempts = 5;

    private OtpChallenge()
    {
    }

    public OtpChallenge(PhoneNumber phone, OtpPurpose purpose, string codeHash, DateTimeOffset expiresAt)
    {
        Phone = phone;
        Purpose = purpose;
        CodeHash = codeHash;
        ExpiresAt = expiresAt;
    }

    public PhoneNumber Phone { get; private set; } = null!;

    public OtpPurpose Purpose { get; private set; }

    public string CodeHash { get; private set; } = string.Empty;

    public DateTimeOffset ExpiresAt { get; private set; }

    public int Attempts { get; private set; }

    public DateTimeOffset? ConsumedAt { get; private set; }

    public Result Verify(string code, DateTimeOffset now)
    {
        if (ConsumedAt is not null || ExpiresAt <= now)
        {
            return Error.Validation("otp.expired", "This code has expired. Request a new one.");
        }

        if (Attempts >= MaxAttempts)
        {
            return Error.Validation("otp.locked", "Too many wrong attempts. Request a new code.");
        }

        Attempts++;
        if (!SecureTokens.FixedTimeEquals(CodeHash, SecureTokens.Hash(code.Trim())))
        {
            return Error.Validation("otp.mismatch", "That code doesn't match. Check the SMS and try again.");
        }

        ConsumedAt = now;
        return Result.Success();
    }
}

public sealed class Tenant : Entity
{
    private Tenant()
    {
    }

    public Tenant(Guid id, string name, string timezone)
    {
        Id = id;
        Name = name;
        Timezone = timezone;
    }

    public string Name { get; private set; } = string.Empty;

    public string Timezone { get; private set; } = "Asia/Kolkata";
}
