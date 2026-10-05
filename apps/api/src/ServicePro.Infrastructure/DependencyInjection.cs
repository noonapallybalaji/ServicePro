using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using ServicePro.BuildingBlocks.Persistence;
using ServicePro.Infrastructure.Persistence;

namespace ServicePro.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        // Read lazily: build-time OpenAPI generation composes the app without a database.
        var connectionString = configuration.GetConnectionString("Database") ?? string.Empty;

        services.AddDbContext<ServiceProDbContext>((sp, options) =>
        {
            options.UseNpgsql(connectionString, npgsql =>
                {
                    npgsql.MigrationsAssembly(typeof(ServiceProDbContext).Assembly.FullName);
                    npgsql.MigrationsHistoryTable("__ef_migrations_history", "platform");
                    npgsql.EnableRetryOnFailure(3);
                })
                .UseSnakeCaseNamingConvention()
                // Order matters: stamp tenant/timestamps → audit → move events to the outbox.
                .AddInterceptors(
                    sp.GetRequiredService<EntityStampingInterceptor>(),
                    sp.GetRequiredService<AuditInterceptor>(),
                    sp.GetRequiredService<OutboxInterceptor>());
        });

        // Modules depend on the base type only (ADR 0002).
        services.AddScoped<DbContext>(sp => sp.GetRequiredService<ServiceProDbContext>());
        services.AddScoped<DatabaseInitializer>();
        services.AddScoped<IDataSeeder, Seeding.DemoDataSeeder>();
        return services;
    }
}
