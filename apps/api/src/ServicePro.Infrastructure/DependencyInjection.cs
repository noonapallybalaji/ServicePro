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
        var connectionString = DatabaseUrl.ToConnectionString(configuration.GetConnectionString("Database") ?? string.Empty);

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

/// <summary>Accepts both Npgsql connection strings and postgres:// URLs (as Render and others provide).</summary>
public static class DatabaseUrl
{
    public static string ToConnectionString(string value)
    {
        if (!value.StartsWith("postgres://", StringComparison.OrdinalIgnoreCase) &&
            !value.StartsWith("postgresql://", StringComparison.OrdinalIgnoreCase))
        {
            return value;
        }

        var uri = new Uri(value);
        var credentials = uri.UserInfo.Split(':', 2);
        var builder = new Npgsql.NpgsqlConnectionStringBuilder
        {
            Host = uri.Host,
            Port = uri.IsDefaultPort || uri.Port <= 0 ? 5432 : uri.Port,
            Database = Uri.UnescapeDataString(uri.AbsolutePath.TrimStart('/')),
            Username = Uri.UnescapeDataString(credentials[0]),
            Password = credentials.Length > 1 ? Uri.UnescapeDataString(credentials[1]) : null,
            // Internal (same-region) connections work without TLS; external ones negotiate it.
            SslMode = Npgsql.SslMode.Prefer,
        };
        return builder.ConnectionString;
    }
}
