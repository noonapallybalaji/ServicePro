using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace ServicePro.BuildingBlocks.Security;

/*
 * Server-to-server callers (the n8n WhatsApp assistant) authenticate with a long random key in a
 * header. Only the SHA-256 hash of each key is configured (Integrations:Keys:<name>), so neither
 * the repo nor appsettings ever holds a usable secret. The resulting principal has role
 * "Integration" and is accepted only by endpoints that require AuthPolicies.Integration — the
 * default policy (staff or technician) and the customer policy both reject it.
 */

public static class IntegrationKeys
{
    public const string Scheme = "IntegrationKey";
    public const string Header = "X-ServicePro-Integration-Key";
    public const string Role = "Integration";
    public const string ConfigSection = "Integrations:Keys";
}

public sealed class IntegrationKeyOptions : AuthenticationSchemeOptions
{
    /// <summary>Integration name → lower-case hex SHA-256 of its key.</summary>
    public Dictionary<string, string> KeyHashes { get; } = new(StringComparer.Ordinal);

    public void LoadFrom(IConfiguration configuration)
    {
        foreach (var entry in configuration.GetSection(IntegrationKeys.ConfigSection).GetChildren())
        {
            if (entry.Value is { Length: 64 } hash)
            {
                KeyHashes[entry.Key] = hash.ToLowerInvariant();
            }
        }
    }
}

public sealed class IntegrationKeyHandler(IOptionsMonitor<IntegrationKeyOptions> options, ILoggerFactory logger, UrlEncoder encoder)
    : AuthenticationHandler<IntegrationKeyOptions>(options, logger, encoder)
{
    /// <summary>Keys shorter than this are refused outright: they would be guessable.</summary>
    private const int MinimumKeyLength = 32;

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var presented = Request.Headers[IntegrationKeys.Header].ToString();
        if (string.IsNullOrEmpty(presented))
        {
            return Task.FromResult(AuthenticateResult.NoResult());
        }

        if (presented.Length >= MinimumKeyLength)
        {
            var hash = SecureTokens.Hash(presented);
            foreach (var (name, expected) in Options.KeyHashes)
            {
                if (SecureTokens.FixedTimeEquals(hash, expected))
                {
                    var identity = new ClaimsIdentity(
                        [new Claim(ServiceProClaims.Name, name), new Claim(ServiceProClaims.Role, IntegrationKeys.Role)],
                        IntegrationKeys.Scheme,
                        ServiceProClaims.Name,
                        ServiceProClaims.Role);
                    return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), IntegrationKeys.Scheme)));
                }
            }
        }

        // Never log the presented value.
        Logger.LogWarning("Rejected integration key from {Client}", ServicePro.BuildingBlocks.Web.ClientAddress.For(Context));
        return Task.FromResult(AuthenticateResult.Fail("Invalid integration key."));
    }
}
