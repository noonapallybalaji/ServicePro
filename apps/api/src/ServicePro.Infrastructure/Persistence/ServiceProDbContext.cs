using Microsoft.EntityFrameworkCore;
using ServicePro.BuildingBlocks.Persistence;
using ServicePro.SharedKernel.Abstractions;
using ServicePro.SharedKernel.Domain;

namespace ServicePro.Infrastructure.Persistence;

/// <summary>
/// One context for the whole model (ADR 0002). Modules never see this type; they use the
/// base <see cref="DbContext"/> and their own entity configurations.
/// </summary>
public sealed class ServiceProDbContext(DbContextOptions<ServiceProDbContext> options, ITenantContext tenant) : DbContext(options)
{
    /// <summary>Evaluated per query by the tenant filters, so one context instance serves one tenant.</summary>
    public Guid CurrentTenantId => tenant.TenantId;

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        foreach (var assembly in ModuleCatalog.ModelAssemblies)
        {
            modelBuilder.ApplyConfigurationsFromAssembly(assembly);
            foreach (var contributorType in assembly.GetTypes().Where(t => typeof(IModelContributor).IsAssignableFrom(t) && t is { IsAbstract: false, IsInterface: false }))
            {
                ((IModelContributor)Activator.CreateInstance(contributorType, nonPublic: true)!).Configure(modelBuilder);
            }
        }

        UseClientGeneratedKeys(modelBuilder);
        ModelConventions.StoreEnumsAsText(modelBuilder);
        ModelConventions.ApplyTenantFilters(modelBuilder, () => CurrentTenantId);
    }

    /// <summary>
    /// Ids are UUIDv7 created in the domain. Telling EF they are never database-generated means
    /// new child entities reached through a navigation are inserted, not treated as existing.
    /// </summary>
    private static void UseClientGeneratedKeys(ModelBuilder modelBuilder)
    {
        foreach (var entityType in modelBuilder.Model.GetEntityTypes().Where(e => typeof(Entity).IsAssignableFrom(e.ClrType)))
        {
            modelBuilder.Entity(entityType.ClrType).Property(nameof(Entity.Id)).ValueGeneratedNever();
        }
    }
}
