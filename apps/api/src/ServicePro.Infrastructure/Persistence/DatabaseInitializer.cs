using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using ServicePro.BuildingBlocks.Persistence;
using ServicePro.SharedKernel.Abstractions;

namespace ServicePro.Infrastructure.Persistence;

/// <summary>Applies migrations and runs every module's seeder, in order.</summary>
public sealed partial class DatabaseInitializer(
    ServiceProDbContext db,
    IEnumerable<IDataSeeder> seeders,
    IOptions<TenancyOptions> tenancy,
    IConfiguration configuration,
    ILogger<DatabaseInitializer> logger)
{
    public async Task InitializeAsync(bool includeDemoData, CancellationToken ct)
    {
        await db.Database.MigrateAsync(ct);

        var context = new SeedContext(tenancy.Value.DefaultTenantId, includeDemoData, configuration);
        foreach (var seeder in seeders.OrderBy(s => s.Order))
        {
            await seeder.SeedAsync(context, ct);
            LogSeeded(seeder.GetType().Name);
        }
    }

    [LoggerMessage(Level = LogLevel.Information, Message = "Seeded {Seeder}")]
    private partial void LogSeeded(string seeder);
}

/// <summary>Lets `dotnet ef` build the model without starting the API.</summary>
internal sealed class DesignTimeDbContextFactory : IDesignTimeDbContextFactory<ServiceProDbContext>
{
    public ServiceProDbContext CreateDbContext(string[] args)
    {
        var connectionString = Environment.GetEnvironmentVariable("ConnectionStrings__Database")
            ?? "Host=localhost;Port=5432;Database=servicepro;Username=servicepro;Password=servicepro";
        var options = new DbContextOptionsBuilder<ServiceProDbContext>()
            .UseNpgsql(connectionString, npgsql =>
            {
                npgsql.MigrationsAssembly(typeof(ServiceProDbContext).Assembly.FullName);
                npgsql.MigrationsHistoryTable("__ef_migrations_history", "platform");
            })
            .UseSnakeCaseNamingConvention()
            .Options;
        return new ServiceProDbContext(options, new FixedTenant(KnownTenants.Default));
    }

    private sealed class FixedTenant(Guid tenantId) : ITenantContext
    {
        public Guid TenantId => tenantId;
    }
}
