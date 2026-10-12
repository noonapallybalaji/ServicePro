using System.Security.Claims;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
using ServicePro.BuildingBlocks.Security;
using ServicePro.Contracts.Ports;
using ServicePro.Modules.Identity.Domain;
using ServicePro.SharedKernel.Abstractions;

namespace ServicePro.Modules.Identity.Application;

public sealed class AuthOptions
{
    public const string SectionName = "Auth";

    public string Issuer { get; set; } = "servicepro";

    public string Audience { get; set; } = "servicepro";

    /// <summary>HMAC-SHA256 key, at least 32 characters. Comes from a secret store outside Development.</summary>
    public string SigningKey { get; set; } = string.Empty;

    public int AccessTokenMinutes { get; set; } = 15;

    public int StaffSessionHours { get; set; } = 12;

    public int TechnicianSessionDays { get; set; } = 30;

    /// <summary>Customers stay signed in on their phone between bookings.</summary>
    public int CustomerSessionDays { get; set; } = 90;

    public int OtpLength { get; set; } = 6;

    public int OtpTtlMinutes { get; set; } = 5;

    public int OtpCooldownSeconds { get; set; } = 30;

    /// <summary>Development only: return the OTP in the API response so flows can be tested without SMS.</summary>
    public bool ExposeOtpInResponse { get; set; }

    public SymmetricSecurityKey CreateSigningKey() => new(Encoding.UTF8.GetBytes(SigningKey));
}

public sealed record MeResponse(
    Guid Id,
    string FullName,
    UserRole Role,
    string Phone,
    string? Email,
    Guid? TechnicianId,
    string PreferredLanguage);

public sealed record AuthSessionResponse(string AccessToken, DateTimeOffset ExpiresAt, MeResponse User);

/// <summary>Result of issuing a session: the response body plus the refresh token for the cookie.</summary>
public sealed record IssuedSession(AuthSessionResponse Response, string RefreshToken, DateTimeOffset RefreshExpiresAt, Guid RefreshTokenId);

/// <summary>Signs short-lived access tokens (ADR 0005) for any kind of session.</summary>
public sealed class AccessTokenWriter(IOptions<AuthOptions> options)
{
    private readonly AuthOptions _options = options.Value;
    private readonly JsonWebTokenHandler _handler = new();

    public string Write(IEnumerable<Claim> claims, DateTimeOffset now, DateTimeOffset expires) =>
        _handler.CreateToken(new SecurityTokenDescriptor
        {
            Issuer = _options.Issuer,
            Audience = _options.Audience,
            Subject = new ClaimsIdentity(claims),
            IssuedAt = now.UtcDateTime,
            NotBefore = now.UtcDateTime,
            Expires = expires.UtcDateTime,
            SigningCredentials = new SigningCredentials(_options.CreateSigningKey(), SecurityAlgorithms.HmacSha256),
        });
}

/// <summary>Creates access tokens and refresh-token chain links (ADR 0005). One responsibility: session issuance.</summary>
public sealed class SessionIssuer(DbContext db, IOptions<AuthOptions> options, IClock clock, ITechnicianDirectory technicians, AccessTokenWriter tokens)
{
    private readonly AuthOptions _options = options.Value;

    public async Task<IssuedSession> IssueAsync(User user, Guid? familyId, CancellationToken ct)
    {
        var now = clock.UtcNow;
        var technicianId = user.Role == UserRole.Technician
            ? await technicians.FindIdByUserIdAsync(user.Id, ct)
            : null;

        var accessExpires = now.AddMinutes(_options.AccessTokenMinutes);
        var accessToken = CreateAccessToken(user, technicianId, now, accessExpires);

        var refreshPlain = SecureTokens.Generate();
        var refreshExpires = user.IsStaff
            ? now.AddHours(_options.StaffSessionHours)
            : now.AddDays(_options.TechnicianSessionDays);
        var refreshToken = new RefreshToken(user.Id, SecureTokens.Hash(refreshPlain), familyId ?? Guid.CreateVersion7(), refreshExpires);
        db.Set<RefreshToken>().Add(refreshToken);

        var me = ToMe(user, technicianId);
        return new IssuedSession(new AuthSessionResponse(accessToken, accessExpires, me), refreshPlain, refreshExpires, refreshToken.Id);
    }

    public static MeResponse ToMe(User user, Guid? technicianId) => new(
        user.Id, user.FullName, user.Role, user.Phone.Value, user.Email, technicianId, user.PreferredLanguage);

    private string CreateAccessToken(User user, Guid? technicianId, DateTimeOffset now, DateTimeOffset expires)
    {
        var claims = new List<Claim>
        {
            new(ServiceProClaims.Subject, user.Id.ToString()),
            new(ServiceProClaims.Role, user.Role.ToString()),
            new(ServiceProClaims.TenantId, user.TenantId.ToString()),
            new(ServiceProClaims.Name, user.FullName),
        };
        if (technicianId is { } id)
        {
            claims.Add(new Claim(ServiceProClaims.TechnicianId, id.ToString()));
        }

        return tokens.Write(claims, now, expires);
    }
}
