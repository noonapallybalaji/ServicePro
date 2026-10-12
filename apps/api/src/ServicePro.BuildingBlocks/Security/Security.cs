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
    public const string CustomerId = "customer_id";
    public const string Name = "name";
}

/// <summary>
/// Customers sign in with their phone (booking or "My bookings"). They are not Identity users:
/// their tokens carry this role and a customer_id claim, and only <see cref="AuthPolicies.Customer"/>
/// endpoints accept them.
/// </summary>
public static class CustomerRole
{
    public const string Name = "Customer";
}

public static class AuthPolicies
{
    /// <summary>Owner, admin, dispatcher.</summary>
    public const string Staff = "staff";

    /// <summary>Owner, admin: settings, users, catalog.</summary>
    public const string Admin = "admin";

    public const string Technician = "technician";

    /// <summary>A signed-in customer (customer site: account, order history).</summary>
    public const string Customer = "customer";
}

/// <summary>
/// The customer's refresh token. Separate name and path from the staff/technician cookie, so a
/// customer session can never be used to refresh a staff session (or overwrite one in development,
/// where every app shares "localhost").
/// </summary>
public static class CustomerSessionCookie
{
    public const string Name = "sp_customer";
    public const string Path = "/api/v1/customer-auth";

    public static void Append(HttpResponse response, string refreshToken, DateTimeOffset expires) =>
        response.Cookies.Append(Name, refreshToken, Options(expires));

    public static void Delete(HttpResponse response) => response.Cookies.Delete(Name, Options(DateTimeOffset.UnixEpoch));

    public static string? Read(HttpRequest request) => request.Cookies[Name];

    private static CookieOptions Options(DateTimeOffset expires) => new()
    {
        HttpOnly = true,
        Secure = true,
        SameSite = SameSiteMode.Strict,
        Path = Path,
        Expires = expires,
        IsEssential = true,
    };
}

public sealed class HttpCurrentUser(IHttpContextAccessor accessor) : ICurrentUser
{
    private System.Security.Claims.ClaimsPrincipal? Principal => accessor.HttpContext?.User;

    public bool IsAuthenticated => Principal?.Identity?.IsAuthenticated == true;

    /// <summary>Staff and technician accounts only; a customer's subject is a customer id, not a user id.</summary>
    public Guid? UserId => IsCustomer ? null : ParseGuid(ServiceProClaims.Subject);

    public Guid? CustomerId => IsCustomer ? ParseGuid(ServiceProClaims.CustomerId) : null;

    private bool IsCustomer => Principal?.FindFirst(ServiceProClaims.Role)?.Value == CustomerRole.Name;

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
        null when user.CustomerId is not null => Actor.Customer,
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
