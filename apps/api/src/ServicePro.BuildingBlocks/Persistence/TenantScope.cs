using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Options;
using ServicePro.BuildingBlocks.Security;
using ServicePro.SharedKernel.Abstractions;

namespace ServicePro.BuildingBlocks.Persistence;

public sealed class TenancyOptions
{
    /// <summary>
    /// The tenant used when a request carries none (public pages, background work before a
    /// tenant is known). There is one tenant today; the column exists for SaaS later (PLAN.md §1.2).
    /// </summary>
    public Guid DefaultTenantId { get; set; } = KnownTenants.Default;
}

public static class KnownTenants
{
    public static readonly Guid Default = Guid.Parse("01960000-0000-7000-8000-000000000001");
}

/// <summary>
/// Resolves the tenant: explicit override (background work) → token claim → default.
/// Scoped: one per request / per outbox handler run.
/// </summary>
public sealed class TenantScope(IHttpContextAccessor httpContextAccessor, IOptions<TenancyOptions> options) : ITenantContext
{
    private Guid? _override;

    public Guid TenantId => _override ?? FromClaims() ?? options.Value.DefaultTenantId;

    public void Use(Guid tenantId) => _override = tenantId;

    private Guid? FromClaims()
    {
        var value = httpContextAccessor.HttpContext?.User.FindFirst(ServiceProClaims.TenantId)?.Value;
        return Guid.TryParse(value, out var tenantId) ? tenantId : null;
    }
}

public sealed class SystemClock : IClock
{
    public DateTimeOffset UtcNow => DateTimeOffset.UtcNow;
}
