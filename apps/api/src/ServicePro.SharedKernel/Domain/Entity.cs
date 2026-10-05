namespace ServicePro.SharedKernel.Domain;

/// <summary>Base for everything with identity. Ids are UUIDv7 (time-ordered, index-friendly).</summary>
public abstract class Entity
{
    public Guid Id { get; protected init; } = Guid.CreateVersion7();

    /// <summary>Set by the persistence layer on insert.</summary>
    public DateTimeOffset CreatedAt { get; private set; }

    /// <summary>Set by the persistence layer on insert and update.</summary>
    public DateTimeOffset UpdatedAt { get; private set; }

    public override bool Equals(object? obj) =>
        obj is Entity other && other.GetType() == GetType() && other.Id == Id;

    public override int GetHashCode() => HashCode.Combine(GetType(), Id);
}

/// <summary>Entity that belongs to a tenant (PLAN.md §7.1). The tenant is stamped on insert.</summary>
public abstract class TenantOwnedEntity : Entity, ITenantOwned
{
    public Guid TenantId { get; private set; }
}

public interface ITenantOwned
{
    Guid TenantId { get; }
}
