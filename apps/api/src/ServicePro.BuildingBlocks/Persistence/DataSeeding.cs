using Microsoft.Extensions.Configuration;

namespace ServicePro.BuildingBlocks.Persistence;

public sealed record SeedContext(Guid TenantId, bool IncludeDemoData, IConfiguration Configuration);

/// <summary>
/// Reference data a module needs to work (catalog, message templates) plus optional demo data.
/// Seeders must be idempotent: they run on every start in Development.
/// </summary>
public interface IDataSeeder
{
    /// <summary>Lower runs first (identity before modules that create users).</summary>
    int Order { get; }

    Task SeedAsync(SeedContext context, CancellationToken ct);
}
