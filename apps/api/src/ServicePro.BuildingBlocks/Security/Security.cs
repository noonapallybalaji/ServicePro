using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Http;
using ServicePro.SharedKernel.Abstractions;

namespace ServicePro.BuildingBlocks.Security;

/// <summary>JWT claim names (ADR 0005). Inbound claim mapping is disabled, so these are used verbatim.</summary>
public static class ServiceProClaims
{
    public const string Subject = "sub";
    public const string Role = "role";
    public const string TenantId = "tenant_id";
    public const string TechnicianId = "technician_id";
    public const string Name = "name";
}

public static class AuthPolicies
{
    /// <summary>Owner, admin, dispatcher.</summary>
    public const string Staff = "staff";

    /// <summary>Owner, admin: settings, users, catalog.</summary>
    public const string Admin = "admin";

    public const string Technician = "technician";
}

public sealed class HttpCurrentUser(IHttpContextAccessor accessor) : ICurrentUser
{
    private System.Security.Claims.ClaimsPrincipal? Principal => accessor.HttpContext?.User;

    public bool IsAuthenticated => Principal?.Identity?.IsAuthenticated == true;

    public Guid? UserId => ParseGuid(ServiceProClaims.Subject);

    public UserRole? Role =>
        Enum.TryParse<UserRole>(Principal?.FindFirst(ServiceProClaims.Role)?.Value, ignoreCase: true, out var role) ? role : null;

    public Guid? TechnicianId => ParseGuid(ServiceProClaims.TechnicianId);

    private Guid? ParseGuid(string claim) =>
        Guid.TryParse(Principal?.FindFirst(claim)?.Value, out var value) ? value : null;
}

public static class CurrentUserExtensions
{
    /// <summary>The actor to record in history for the current caller.</summary>
    public static Actor ToActor(this ICurrentUser user) => user.Role switch
    {
        null => Actor.System,
        UserRole.Technician => new Actor(ActorType.Technician, user.UserId),
        _ => new Actor(ActorType.User, user.UserId),
    };
}

/// <summary>Secrets that are stored hashed: refresh tokens, OTPs, tracking tokens.</summary>
public static class SecureTokens
{
    public static string Generate(int bytes = 32) => Base64Url(RandomNumberGenerator.GetBytes(bytes));

    public static string NumericCode(int digits)
    {
        var max = (int)Math.Pow(10, digits);
        return RandomNumberGenerator.GetInt32(0, max).ToString(new string('0', digits), System.Globalization.CultureInfo.InvariantCulture);
    }

    public static string Hash(string value) => Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(value)));

    public static bool FixedTimeEquals(string hashA, string hashB) =>
        CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(hashA), Encoding.UTF8.GetBytes(hashB));

    private static string Base64Url(byte[] data) =>
        Convert.ToBase64String(data).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
