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

/// <summary>Staff sent the customer a link to pay their bill online.</summary>
public sealed record PaymentLinkSent(Guid ServiceRequestId, decimal Amount, string Url) : IDomainEvent;

/// <summary>A refund reached the customer (gateway confirmed it, or staff returned cash/UPI).</summary>
public sealed record RefundProcessed(Guid RefundId, Guid ServiceRequestId, decimal Amount) : IDomainEvent;

/// <summary>The customer moved their visit to a new time window (no status change unless a technician had accepted).</summary>


/// <summary>A technician sent the customer a repair estimate to approve.</summary>
public sealed record EstimateSent(Guid EstimateId, Guid ServiceRequestId, Guid CustomerId, Guid? TechnicianId, decimal Total) : IDomainEvent;

/// <summary>The customer (or staff on their behalf) approved or declined an estimate.</summary>
public sealed record EstimateAnswered(Guid EstimateId, Guid ServiceRequestId, bool Approved, decimal Total) : IDomainEvent;

/// <summary>A customer rated a finished job (1 to 5).</summary>
public sealed record ReviewSubmitted(Guid ReviewId, Guid ServiceRequestId, string SrNumber, Guid? TechnicianId, int Rating) : IDomainEvent;

/// <summary>Time to ask the customer how the visit went.</summary>
public sealed record FeedbackRequested(Guid ServiceRequestId, string SrNumber, Guid CustomerId, Guid? TechnicianId) : IDomainEvent;

/// <summary>A customer (or the WhatsApp assistant on their behalf) asked for help.</summary>
public sealed record SupportTicketOpened(Guid TicketId, string Number, bool HighPriority) : IDomainEvent;

/// <summary>Staff replied to a customer's support ticket.</summary>
public sealed record SupportReplySent(Guid TicketId, string Number, Guid? CustomerId, string? ContactPhone, string Message) : IDomainEvent;

/// <summary>A technician's phone reported where they are (shared while on the way to a job).</summary>
public sealed record TechnicianLocationReported(Guid TechnicianId, DateTimeOffset At) : IDomainEvent;
