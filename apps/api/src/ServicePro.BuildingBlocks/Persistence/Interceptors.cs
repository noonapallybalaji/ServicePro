using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using ServicePro.BuildingBlocks.Messaging;
using ServicePro.SharedKernel.Abstractions;
using ServicePro.SharedKernel.Domain;

namespace ServicePro.BuildingBlocks.Persistence;

/// <summary>Stamps tenant and timestamps so no use case has to remember to (PLAN.md §7.1).</summary>
public sealed class EntityStampingInterceptor(ITenantContext tenant, IClock clock) : SaveChangesInterceptor
{
    public override ValueTask<InterceptionResult<int>> SavingChangesAsync(
        DbContextEventData eventData,
        InterceptionResult<int> result,
        CancellationToken cancellationToken = default)
    {
        if (eventData.Context is { } context)
        {
            Stamp(context);
        }

        return base.SavingChangesAsync(eventData, result, cancellationToken);
    }

    public override InterceptionResult<int> SavingChanges(DbContextEventData eventData, InterceptionResult<int> result)
    {
        if (eventData.Context is { } context)
        {
            Stamp(context);
        }

        return base.SavingChanges(eventData, result);
    }

    private void Stamp(DbContext context)
    {
        context.ChangeTracker.DetectChanges();
        var now = clock.UtcNow;

        foreach (var entry in context.ChangeTracker.Entries<Entity>())
        {
            switch (entry.State)
            {
                case EntityState.Added:
                    entry.Property(nameof(Entity.CreatedAt)).CurrentValue = now;
                    entry.Property(nameof(Entity.UpdatedAt)).CurrentValue = now;
                    if (entry.Entity is ITenantOwned { TenantId: var tenantId } && tenantId == Guid.Empty)
                    {
                        entry.Property(nameof(ITenantOwned.TenantId)).CurrentValue = tenant.TenantId;
                    }

                    break;
                case EntityState.Modified:
                    entry.Property(nameof(Entity.UpdatedAt)).CurrentValue = now;
                    break;
            }
        }
    }
}

/// <summary>
/// Moves raised domain events into the outbox in the same transaction (ADR 0004).
/// Must run after <see cref="EntityStampingInterceptor"/>: the envelope's tenant is read
/// from the (by then stamped) aggregate.
/// </summary>
public sealed class OutboxInterceptor(IClock clock, ITenantContext tenant) : SaveChangesInterceptor
{
    public override ValueTask<InterceptionResult<int>> SavingChangesAsync(
        DbContextEventData eventData,
        InterceptionResult<int> result,
        CancellationToken cancellationToken = default)
    {
        if (eventData.Context is { } context)
        {
            CollectEvents(context);
        }

        return base.SavingChangesAsync(eventData, result, cancellationToken);
    }

    public override InterceptionResult<int> SavingChanges(DbContextEventData eventData, InterceptionResult<int> result)
    {
        if (eventData.Context is { } context)
        {
            CollectEvents(context);
        }

        return base.SavingChanges(eventData, result);
    }

    private void CollectEvents(DbContext context)
    {
        var sources = context.ChangeTracker.Entries<IHasDomainEvents>()
            .Select(entry => entry.Entity)
            .Where(entity => entity.DomainEvents.Count > 0)
            .ToList();

        foreach (var source in sources)
        {
            var tenantId = source is ITenantOwned { TenantId: var owned } && owned != Guid.Empty ? owned : tenant.TenantId;
            foreach (var domainEvent in source.DomainEvents)
            {
                context.Set<OutboxMessage>().Add(new OutboxMessage
                {
                    TenantId = tenantId,
                    Type = EventHandlerRegistry.EventTypeName(domainEvent.GetType()),
                    Payload = EventSerializer.Serialize(domainEvent),
                    OccurredAt = clock.UtcNow,
                });
            }

            source.ClearDomainEvents();
        }
    }
}
