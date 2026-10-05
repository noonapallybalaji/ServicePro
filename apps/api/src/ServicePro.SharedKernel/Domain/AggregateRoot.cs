namespace ServicePro.SharedKernel.Domain;

/// <summary>
/// Consistency boundary. Raised events are persisted to the outbox in the same
/// transaction as the aggregate's state (ADR 0004).
/// </summary>
public abstract class AggregateRoot : Entity, IHasDomainEvents
{
    private readonly List<IDomainEvent> _domainEvents = [];

    public IReadOnlyCollection<IDomainEvent> DomainEvents => _domainEvents;

    protected void Raise(IDomainEvent domainEvent) => _domainEvents.Add(domainEvent);

    public void ClearDomainEvents() => _domainEvents.Clear();
}

public abstract class TenantOwnedAggregateRoot : AggregateRoot, ITenantOwned
{
    public Guid TenantId { get; private set; }
}

public interface IHasDomainEvents
{
    IReadOnlyCollection<IDomainEvent> DomainEvents { get; }

    void ClearDomainEvents();
}

/// <summary>
/// Something that happened in the domain that other parts of the system may react to.
/// The tenant travels on the outbox envelope, not in the event (it is stamped at save time).
/// </summary>
public interface IDomainEvent;
