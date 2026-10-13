using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using ServicePro.Modules.Identity.Application;
using ServicePro.Modules.Identity.Domain;

namespace ServicePro.Modules.Identity.Infrastructure;

/// <summary>
/// Outside Development the API may be reachable from the internet (Cloudflare Tunnel, a server).
/// Refuse to start with settings that would hand out access: the signing key committed for
/// development, one-time codes echoed in responses, or a staff account still using the demo
/// password published in the repo.
/// </summary>
internal sealed class ExposureGuard(
    IServiceScopeFactory scopes,
    IHostEnvironment environment,
    IConfiguration configuration,
    IOptions<AuthOptions> auth,
    ILogger<ExposureGuard> logger) : IHostedService
{
    /// <summary>Values committed in appsettings.Development.json — public, so never safe elsewhere.</summary>
    internal const string DevelopmentSigningKey = "dev-only-signing-key-change-me-0123456789abcdef";
    internal const string DevelopmentOwnerPassword = "ChangeMe!2026";

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        // Off only for the build-time OpenAPI generation, which runs without a database.
        if (environment.IsDevelopment() || !configuration.GetValue("Security:ExposureGuard", true))
        {
            return;
        }

        var problems = new List<string>();
        if (auth.Value.SigningKey == DevelopmentSigningKey)
        {
            problems.Add("Auth:SigningKey is the development key from the repo. Set Auth__SigningKey to a new random secret.");
        }

        if (auth.Value.ExposeOtpInResponse)
        {
            problems.Add("Auth:ExposeOtpInResponse is on: anyone could read sign-in codes. Turn it off.");
        }

        await using (var scope = scopes.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<DbContext>();
            var hasher = scope.ServiceProvider.GetRequiredService<IPasswordHasher<User>>();
            var staff = await db.Set<User>().IgnoreQueryFilters().AsNoTracking()
                .Where(u => u.IsActive && u.PasswordHash != null)
                .ToListAsync(cancellationToken);
            var exposed = staff.Where(u => hasher.VerifyHashedPassword(u, u.PasswordHash!, DevelopmentOwnerPassword) != PasswordVerificationResult.Failed).ToList();
            if (exposed.Count > 0)
            {
                problems.Add(
                    $"{exposed.Count} staff account(s) still use the demo password published in the repo ({string.Join(", ", exposed.Select(u => u.Email))}). " +
                    "Change it in the admin app (Settings → Team) before exposing the API.");
            }
        }

        if (problems.Count > 0)
        {
            foreach (var problem in problems)
            {
                logger.LogCritical("Unsafe to expose: {Problem}", problem);
            }

            throw new InvalidOperationException("ServicePro refused to start with unsafe settings. See the log above.");
        }
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
