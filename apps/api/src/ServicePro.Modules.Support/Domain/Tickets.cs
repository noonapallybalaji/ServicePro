using ServicePro.Contracts;
using ServicePro.Contracts.Events;
using ServicePro.SharedKernel.Domain;
using ServicePro.SharedKernel.Results;
using ServicePro.SharedKernel.ValueObjects;

namespace ServicePro.Modules.Support.Domain;

public enum TicketCategory
{
    Booking,
    Payment,
    LateTechnician,
    RepairQuality,
    DamageOrSafety,
    Other,
}

public enum TicketStatus
{
    /// <summary>Waiting for us.</summary>
    Open,

    /// <summary>We replied and are waiting for the customer.</summary>
    WaitingOnCustomer,

    Resolved,
}

public enum MessageAuthor
{
    Customer,
    Staff,

    /// <summary>The WhatsApp assistant, passing on what the customer said.</summary>
    Assistant,
}

/// <summary>
/// A customer's request for help (PLAN.md §4.5, §7.11 escalations), with its conversation.
/// The customer may be a signed-in account holder, or only a phone number (WhatsApp escalations).
/// </summary>
public sealed class SupportTicket : TenantOwnedAggregateRoot, ServicePro.BuildingBlocks.Persistence.IAudited
{
    public const int MaxMessageLength = 2000;

    private readonly List<TicketMessage> _messages = [];

    private SupportTicket()
    {
    }

    public string Number { get; private set; } = string.Empty;

    public Guid? CustomerId { get; private set; }

    /// <summary>Contact for tickets without an account (WhatsApp escalations).</summary>
    public PhoneNumber? ContactPhone { get; private set; }

    public string? ContactName { get; private set; }

    public Guid? ServiceRequestId { get; private set; }

    public string? SrNumber { get; private set; }

    public TicketCategory Category { get; private set; }

    public RequestChannel Channel { get; private set; }

    public bool HighPriority { get; private set; }

    public TicketStatus Status { get; private set; }

    public Guid? AssignedToUserId { get; private set; }

    /// <summary>When we must have replied by (the first-response SLA).</summary>
    public DateTimeOffset FirstResponseDueAt { get; private set; }

    public DateTimeOffset? FirstResponseAt { get; private set; }

    public DateTimeOffset LastActivityAt { get; private set; }

    public DateTimeOffset? ResolvedAt { get; private set; }

    /// <summary>Idempotency key for tickets created by an integration (e.g. the WhatsApp message id).</summary>
    public string? ExternalReference { get; private set; }

    public IReadOnlyCollection<TicketMessage> Messages => _messages;

    public static Result<SupportTicket> Open(
        string number,
        Guid? customerId,
        PhoneNumber? contactPhone,
        string? contactName,
        Guid? serviceRequestId,
        string? srNumber,
        TicketCategory category,
        RequestChannel channel,
        MessageAuthor author,
        string message,
        TimeSpan firstResponseWithin,
        DateTimeOffset now,
        string? externalReference = null)
    {
        if (customerId is null && contactPhone is null)
        {
            return Error.Validation("support.contact_required", "We need a way to reach the customer.");
        }

        var ticket = new SupportTicket
        {
            Number = number,
            CustomerId = customerId,
            ContactPhone = contactPhone,
            ContactName = string.IsNullOrWhiteSpace(contactName) ? null : contactName.Trim(),
            ServiceRequestId = serviceRequestId,
            SrNumber = srNumber,
            Category = category,
            Channel = channel,
            HighPriority = category == TicketCategory.DamageOrSafety,
            Status = TicketStatus.Open,
            FirstResponseDueAt = now.Add(category == TicketCategory.DamageOrSafety ? firstResponseWithin / 2 : firstResponseWithin),
            LastActivityAt = now,
            ExternalReference = externalReference,
        };
        var added = ticket.Add(author, null, message, isInternal: false, now);
        if (added.IsFailure)
        {
            return added.Error!;
        }

        ticket.Raise(new SupportTicketOpened(ticket.Id, number, ticket.HighPriority));
        return ticket;
    }

    public bool IsOverdue(DateTimeOffset now) => FirstResponseAt is null && Status == TicketStatus.Open && now > FirstResponseDueAt;

    /// <summary>The customer writes again: the ticket is back with us (reopened if it was resolved).</summary>
    public Result CustomerWrites(string message, DateTimeOffset now)
    {
        var added = Add(MessageAuthor.Customer, null, message, isInternal: false, now);
        if (added.IsSuccess)
        {
            Status = TicketStatus.Open;
            ResolvedAt = null;
        }

        return added;
    }

    /// <summary>Staff reply (sent to the customer) or note (staff only).</summary>
    public Result StaffWrites(Guid? userId, string message, bool isInternal, DateTimeOffset now)
    {
        var added = Add(MessageAuthor.Staff, userId, message, isInternal, now);
        if (added.IsFailure || isInternal)
        {
            return added;
        }

        FirstResponseAt ??= now;
        AssignedToUserId ??= userId;
        if (Status == TicketStatus.Open)
        {
            Status = TicketStatus.WaitingOnCustomer;
        }

        Raise(new SupportReplySent(Id, Number, CustomerId, ContactPhone?.Value, message.Trim()));
        return added;
    }

    public void AssignTo(Guid? userId) => AssignedToUserId = userId;

    /// <summary>The customer deleted their account: keep that the conversation happened, not what was said.</summary>
    public void Redact()
    {
        ContactPhone = null;
        ContactName = null;
        foreach (var message in _messages)
        {
            message.Redact();
        }
    }

    public void Resolve(DateTimeOffset now)
    {
        Status = TicketStatus.Resolved;
        ResolvedAt ??= now;
        LastActivityAt = now;
    }

    public void Reopen(DateTimeOffset now)
    {
        Status = TicketStatus.Open;
        ResolvedAt = null;
        LastActivityAt = now;
    }

    private Result Add(MessageAuthor author, Guid? userId, string body, bool isInternal, DateTimeOffset now)
    {
        var text = body.Trim();
        if (text.Length == 0)
        {
            return Error.Validation("support.message_empty", "Write a message.");
        }

        if (text.Length > MaxMessageLength)
        {
            return Error.Validation("support.message_too_long", $"Keep messages under {MaxMessageLength} characters.");
        }

        _messages.Add(new TicketMessage(Id, author, userId, text, isInternal, now));
        LastActivityAt = now;
        return Result.Success();
    }
}

public sealed class TicketMessage : Entity
{
    private TicketMessage()
    {
    }

    internal TicketMessage(Guid ticketId, MessageAuthor author, Guid? authorUserId, string body, bool isInternal, DateTimeOffset at)
    {
        TicketId = ticketId;
        Author = author;
        AuthorUserId = authorUserId;
        Body = body;
        IsInternal = isInternal;
        SentAt = at;
    }

    public Guid TicketId { get; private set; }

    public MessageAuthor Author { get; private set; }

    public Guid? AuthorUserId { get; private set; }

    public string Body { get; private set; } = string.Empty;

    /// <summary>Staff-only note: never shown to the customer.</summary>
    public bool IsInternal { get; private set; }

    public DateTimeOffset SentAt { get; private set; }

    internal void Redact() => Body = "[removed at the customer's request]";
}
