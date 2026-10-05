using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using ServicePro.SharedKernel.Abstractions;
using ServicePro.SharedKernel.Domain;

namespace ServicePro.BuildingBlocks.Persistence;

/// <summary>Opt-in marker: changes to this entity are written to the audit log (PLAN.md §14.1).</summary>
public interface IAudited;

/// <summary>Append-only record of a change made through the system (PLAN.md §7.11 `audit_logs`).</summary>
public sealed class AuditLog
{
    public long Id { get; init; }

    public Guid TenantId { get; init; }

    public Guid? UserId { get; init; }

    public required string EntityType { get; init; }

    public required string EntityId { get; init; }

    public required string Action { get; init; }

    public required string Changes { get; init; }

    public DateTimeOffset OccurredAt { get; init; }
}

internal sealed class AuditLogConfiguration : IEntityTypeConfiguration<AuditLog>
{
    public void Configure(EntityTypeBuilder<AuditLog> builder)
    {
        builder.ToTable("audit_logs", "platform");
        builder.HasKey(a => a.Id);
        builder.Property(a => a.Id).ValueGeneratedOnAdd();
        builder.Property(a => a.EntityType).HasMaxLength(120);
        builder.Property(a => a.EntityId).HasMaxLength(64);
        builder.Property(a => a.Action).HasMaxLength(16);
        builder.Property(a => a.Changes).HasColumnType("jsonb");
        builder.HasIndex(a => new { a.EntityType, a.EntityId });
    }
}

public sealed class AuditInterceptor(ICurrentUser currentUser, ITenantContext tenant, IClock clock) : SaveChangesInterceptor
{
    public override ValueTask<InterceptionResult<int>> SavingChangesAsync(
        DbContextEventData eventData,
        InterceptionResult<int> result,
        CancellationToken cancellationToken = default)
    {
        if (eventData.Context is { } context)
        {
            WriteAudit(context);
        }

        return base.SavingChangesAsync(eventData, result, cancellationToken);
    }

    private void WriteAudit(DbContext context)
    {
        var entries = context.ChangeTracker.Entries()
            .Where(e => e.Entity is IAudited && e.State is EntityState.Added or EntityState.Modified or EntityState.Deleted)
            .ToList();

        foreach (var entry in entries)
        {
            var changes = entry.Properties
                .Where(p => entry.State != EntityState.Modified || p.IsModified)
                .Where(p => p.Metadata.Name is not nameof(Entity.UpdatedAt) and not nameof(Entity.CreatedAt))
                .ToDictionary(
                    p => p.Metadata.Name,
                    p => new { from = entry.State == EntityState.Added ? null : p.OriginalValue, to = entry.State == EntityState.Deleted ? null : p.CurrentValue });

            if (changes.Count == 0)
            {
                continue;
            }

            context.Set<AuditLog>().Add(new AuditLog
            {
                TenantId = tenant.TenantId,
                UserId = currentUser.UserId,
                EntityType = entry.Metadata.ClrType.Name,
                EntityId = KeyOf(entry),
                Action = entry.State.ToString(),
                Changes = JsonSerializer.Serialize(changes, ModelConventions.JsonOptions),
                OccurredAt = clock.UtcNow,
            });
        }
    }

    private static string KeyOf(EntityEntry entry) =>
        string.Join(",", entry.Metadata.FindPrimaryKey()!.Properties.Select(p => entry.Property(p.Name).CurrentValue));
}
