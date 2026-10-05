using ServicePro.SharedKernel.Domain;

namespace ServicePro.BuildingBlocks.Messaging;

/// <summary>
/// Reacts to a domain event delivered from the outbox (ADR 0004).
/// Rules: never call SaveChanges (the processor commits), tolerate re-delivery,
/// and do one thing — add another handler rather than growing this one.
/// </summary>
public interface IEventHandler<in TEvent>
    where TEvent : IDomainEvent
{
    Task HandleAsync(TEvent domainEvent, CancellationToken ct);
}
