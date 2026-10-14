using ServicePro.SharedKernel.Abstractions;
using ServicePro.SharedKernel.Domain;

namespace ServicePro.Contracts.Events;

/*
 * Events carry identifiers plus the few facts every subscriber needs, so handlers rarely
 * need extra lookups. They are serialised to the outbox: never remove or rename a property
 * of an event that is already in production; add a new event type instead.
 */

public sealed record ServiceRequestCreated(
    Guid ServiceRequestId,
    string SrNumber,
    Guid CustomerId,
    bool AwaitsReview = false) : IDomainEvent;

public sealed record ServiceRequestStatusChanged(
    Guid ServiceRequestId,
    string SrNumber,
    Guid CustomerId,
    Guid? TechnicianId,
    ServiceRequestStatus From,
    ServiceRequestStatus To,
    string? ReasonCode,
    ActorType ActorType,
    DateTimeOffset OccurredAt) : IDomainEvent;

/// <summary>
/// Issued when the technician arrives. The plain code travels only to the notification
/// handler; the service request stores a hash.
/// </summary>
public sealed record CompletionCodeIssued(
    Guid ServiceRequestId,
    string SrNumber,
    Guid CustomerId,
    string Code) : IDomainEvent;

public sealed record JobOffered(
    Guid AssignmentId,
    Guid ServiceRequestId,
    Guid TechnicianId,
    DateTimeOffset ExpiresAt) : IDomainEvent;

public sealed record JobOfferResolved(
    Guid AssignmentId,
    Guid ServiceRequestId,
    Guid TechnicianId,
    string Outcome) : IDomainEvent;

public sealed record PaymentRecorded(
    Guid PaymentId,
    Guid ServiceRequestId,
    decimal Amount,
    string Method,
    Guid? CollectedByTechnicianId) : IDomainEvent;

public sealed record TechnicianDutyChanged(
    Guid TechnicianId,
    TechnicianDutyStatus DutyStatus) : IDomainEvent;

/// <summary>A customer's personal data was erased at their request; other modules scrub what they hold.</summary>
public sealed record CustomerErased(Guid CustomerId) : IDomainEvent;
