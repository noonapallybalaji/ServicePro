using FluentValidation;
using Microsoft.EntityFrameworkCore;
using ServicePro.BuildingBlocks.Application;
using ServicePro.BuildingBlocks.Settings;
using ServicePro.Contracts;
using ServicePro.Contracts.Ports;
using ServicePro.Modules.Support.Domain;
using ServicePro.SharedKernel.Abstractions;
using ServicePro.SharedKernel.Results;
using ServicePro.SharedKernel.ValueObjects;

namespace ServicePro.Modules.Support.Application;

/*
 * Customer support (gap analysis 10.2, 10.6, 14.5). Customers open a ticket from "My bookings"
 * (optionally about one booking) and talk to the office in a thread; the WhatsApp assistant can
 * hand a conversation over the same way. Staff work a queue with a first-response target.
 */

public static class SupportSettings
{
    public static readonly SettingDefinition<int> FirstResponseMinutes = new(
        "support.first_response_minutes",
        120,
        "Reply to a new support request within this many minutes (damage or safety reports: half). Late ones are flagged in the queue.");
}

internal static class SupportErrors
{
    public static readonly Error NotSignedIn = Error.Unauthorized("account.not_signed_in", "Please sign in to get help with your bookings.");
    public static readonly Error NotFound = Error.NotFound("support.not_found", "We couldn't find this request.");
}

public sealed class TicketNumberGenerator(DbContext db)
{
    public const string Sequence = "ticket_number_seq";

    public async Task<string> NextAsync(CancellationToken ct)
    {
        var next = await db.Database.SqlQueryRaw<long>($"SELECT nextval('{SupportSchema.Name}.{Sequence}') AS \"Value\"").SingleAsync(ct);
        return $"TK-{next}";
    }
}

public static class SupportSchema
{
    public const string Name = "support";
}

// ── Customer ─────────────────────────────────────────────────────────────────

public sealed record TicketSummary(
    Guid Id,
    string Number,
    TicketCategory Category,
    TicketStatus Status,
    string? SrNumber,
    string Preview,
    bool LastMessageFromUs,
    DateTimeOffset LastActivityAt,
    DateTimeOffset CreatedAt);

public sealed record CustomerMessageResponse(bool FromCustomer, string AuthorLabel, string Body, DateTimeOffset SentAt);

public sealed record CustomerTicketResponse(
    Guid Id,
    string Number,
    TicketCategory Category,
    TicketStatus Status,
    Guid? ServiceRequestId,
    string? SrNumber,
    IReadOnlyList<CustomerMessageResponse> Messages,
    DateTimeOffset CreatedAt,
    int PhotoCount = 0);

internal static class CustomerViews
{
    public static TicketSummary ToSummary(this SupportTicket t)
    {
        var visible = t.Messages.Where(m => !m.IsInternal).OrderBy(m => m.SentAt).ToList();
        var last = visible.LastOrDefault();
        var preview = last?.Body ?? string.Empty;
        return new TicketSummary(t.Id, t.Number, t.Category, t.Status, t.SrNumber, preview.Length > 120 ? preview[..120] + "…" : preview,
            last?.Author == MessageAuthor.Staff, t.LastActivityAt, t.CreatedAt);
    }

    public static CustomerTicketResponse ToCustomerResponse(this SupportTicket t) => new(
        t.Id,
        t.Number,
        t.Category,
        t.Status,
        t.ServiceRequestId,
        t.SrNumber,
        [.. t.Messages.Where(m => !m.IsInternal).OrderBy(m => m.SentAt).Select(m => new CustomerMessageResponse(
            m.Author == MessageAuthor.Customer,
            m.Author switch { MessageAuthor.Customer => "You", MessageAuthor.Assistant => "WhatsApp assistant", _ => "Support team" },
            m.Body,
            m.SentAt))],
        t.CreatedAt,
        t.Photos.Count);
}

public sealed record OpenTicketRequest(Guid? ServiceRequestId, TicketCategory Category, string Message);

internal sealed class OpenTicketRequestValidator : AbstractValidator<OpenTicketRequest>
{
    public OpenTicketRequestValidator()
    {
        RuleFor(r => r.Category).IsInEnum();
        RuleFor(r => r.Message).NotEmpty().WithMessage("Tell us what happened.").MaximumLength(SupportTicket.MaxMessageLength);
    }
}

public sealed class OpenMyTicket(
    DbContext db,
    TicketNumberGenerator numbers,
    IServiceRequestWorkflow serviceRequests,
    ISettingsStore settings,
    ICurrentUser currentUser,
    IClock clock) : IUseCase
{
    public async Task<Result<CustomerTicketResponse>> HandleAsync(OpenTicketRequest request, CancellationToken ct)
    {
        if (currentUser.CustomerId is not { } customerId)
        {
            return SupportErrors.NotSignedIn;
        }

        string? srNumber = null;
        if (request.ServiceRequestId is { } serviceRequestId)
        {
            var job = await serviceRequests.GetBillingContextAsync(serviceRequestId, ct);
            if (job.IsFailure || job.Value.CustomerId != customerId)
            {
                return Error.NotFound("booking.not_found", "We couldn't find this booking in your account.");
            }

            srNumber = job.Value.SrNumber;
        }

        var within = TimeSpan.FromMinutes(await settings.GetAsync(SupportSettings.FirstResponseMinutes, ct));
        var ticket = SupportTicket.Open(await numbers.NextAsync(ct), customerId, null, null, request.ServiceRequestId, srNumber,
            request.Category, RequestChannel.Website, MessageAuthor.Customer, request.Message, within, clock.UtcNow);
        if (ticket.IsFailure)
        {
            return ticket.Error!;
        }

        db.Set<SupportTicket>().Add(ticket.Value);
        await db.SaveChangesAsync(ct);
        return ticket.Value.ToCustomerResponse();
    }
}

public sealed class ListMyTickets(DbContext db, ICurrentUser currentUser) : IUseCase
{
    public async Task<Result<IReadOnlyList<TicketSummary>>> HandleAsync(CancellationToken ct)
    {
        if (currentUser.CustomerId is not { } customerId)
        {
            return SupportErrors.NotSignedIn;
        }

        var tickets = await db.Set<SupportTicket>().AsNoTracking().Include(t => t.Messages).Include(t => t.Photos)
            .Where(t => t.CustomerId == customerId)
            .OrderByDescending(t => t.LastActivityAt)
            .Take(50)
            .ToListAsync(ct);
        return tickets.Select(t => t.ToSummary()).ToList();
    }
}

internal static class MyTickets
{
    /// <summary>The signed-in customer's own ticket; anyone else's looks like it doesn't exist.</summary>
    public static async Task<Result<SupportTicket>> FindAsync(DbContext db, ICurrentUser currentUser, string number, bool track, CancellationToken ct)
    {
        if (currentUser.CustomerId is not { } customerId)
        {
            return SupportErrors.NotSignedIn;
        }

        var query = db.Set<SupportTicket>().Include(t => t.Messages).Include(t => t.Photos).Where(t => t.Number == number && t.CustomerId == customerId);
        var ticket = await (track ? query : query.AsNoTracking()).FirstOrDefaultAsync(ct);
        return ticket is null ? SupportErrors.NotFound : ticket;
    }
}

public sealed class GetMyTicket(DbContext db, ICurrentUser currentUser) : IUseCase
{
    public async Task<Result<CustomerTicketResponse>> HandleAsync(string number, CancellationToken ct)
    {
        var ticket = await MyTickets.FindAsync(db, currentUser, number, track: false, ct);
        return ticket.IsSuccess ? ticket.Value.ToCustomerResponse() : ticket.Error!;
    }
}

public sealed record TicketMessageRequest(string Message);

internal sealed class TicketMessageRequestValidator : AbstractValidator<TicketMessageRequest>
{
    public TicketMessageRequestValidator() =>
        RuleFor(r => r.Message).NotEmpty().WithMessage("Write a message.").MaximumLength(SupportTicket.MaxMessageLength);
}

public sealed class WriteToMyTicket(DbContext db, ICurrentUser currentUser, IClock clock) : IUseCase
{
    public async Task<Result<CustomerTicketResponse>> HandleAsync(string number, TicketMessageRequest request, CancellationToken ct)
    {
        var ticket = await MyTickets.FindAsync(db, currentUser, number, track: true, ct);
        if (ticket.IsFailure)
        {
            return ticket.Error!;
        }

        var written = ticket.Value.CustomerWrites(request.Message, clock.UtcNow);
        if (written.IsFailure)
        {
            return written.Error!;
        }

        await db.SaveChangesAsync(ct);
        return ticket.Value.ToCustomerResponse();
    }
}

/// <summary>"My problem is solved": the customer closes their own ticket.</summary>
public sealed class ResolveMyTicket(DbContext db, ICurrentUser currentUser, IClock clock) : IUseCase
{
    public async Task<Result<CustomerTicketResponse>> HandleAsync(string number, CancellationToken ct)
    {
        var ticket = await MyTickets.FindAsync(db, currentUser, number, track: true, ct);
        if (ticket.IsFailure)
        {
            return ticket.Error!;
        }

        ticket.Value.Resolve(clock.UtcNow);
        await db.SaveChangesAsync(ct);
        return ticket.Value.ToCustomerResponse();
    }
}

// ── Staff console ────────────────────────────────────────────────────────────

public sealed record StaffTicketListItem(
    Guid Id,
    string Number,
    TicketCategory Category,
    TicketStatus Status,
    RequestChannel Channel,
    bool HighPriority,
    bool Overdue,
    DateTimeOffset FirstResponseDueAt,
    string CustomerName,
    string? SrNumber,
    Guid? ServiceRequestId,
    Guid? AssignedToUserId,
    string Preview,
    bool WaitingForUs,
    DateTimeOffset LastActivityAt,
    DateTimeOffset CreatedAt);

public sealed record StaffMessageResponse(MessageAuthor Author, bool IsInternal, string Body, DateTimeOffset SentAt);

public sealed record StaffTicketResponse(
    Guid Id,
    string Number,
    TicketCategory Category,
    TicketStatus Status,
    RequestChannel Channel,
    bool HighPriority,
    bool Overdue,
    DateTimeOffset FirstResponseDueAt,
    DateTimeOffset? FirstResponseAt,
    Guid? CustomerId,
    string CustomerName,
    string? CustomerPhone,
    Guid? ServiceRequestId,
    string? SrNumber,
    Guid? AssignedToUserId,
    IReadOnlyList<StaffMessageResponse> Messages,
    DateTimeOffset CreatedAt,
    IReadOnlyList<TicketPhotoResponse>? Photos = null);

internal sealed class StaffViews(ICustomerDirectory customers, IClock clock)
{
    public async Task<IReadOnlyList<StaffTicketListItem>> ListAsync(IReadOnlyList<SupportTicket> tickets, CancellationToken ct)
    {
        var known = await customers.GetManyAsync(tickets.Where(t => t.CustomerId.HasValue).Select(t => t.CustomerId!.Value), ct);
        var now = clock.UtcNow;
        return [.. tickets.Select(t =>
        {
            var summary = t.ToSummary();
            var name = t.CustomerId is { } id && known.GetValueOrDefault(id) is { } c ? c.FullName : t.ContactName ?? t.ContactPhone?.Masked() ?? "Customer";
            return new StaffTicketListItem(t.Id, t.Number, t.Category, t.Status, t.Channel, t.HighPriority, t.IsOverdue(now), t.FirstResponseDueAt,
                name, t.SrNumber, t.ServiceRequestId, t.AssignedToUserId, summary.Preview, t.Status == TicketStatus.Open, t.LastActivityAt, t.CreatedAt);
        })];
    }

    public async Task<StaffTicketResponse> DetailAsync(SupportTicket t, CancellationToken ct)
    {
        var customer = t.CustomerId is { } id ? await customers.GetAsync(id, ct) : null;
        return new StaffTicketResponse(
            t.Id, t.Number, t.Category, t.Status, t.Channel, t.HighPriority, t.IsOverdue(clock.UtcNow), t.FirstResponseDueAt, t.FirstResponseAt,
            t.CustomerId,
            customer?.FullName ?? t.ContactName ?? "Customer",
            customer?.Phone.Value ?? t.ContactPhone?.Value,
            t.ServiceRequestId,
            t.SrNumber,
            t.AssignedToUserId,
            [.. t.Messages.OrderBy(m => m.SentAt).Select(m => new StaffMessageResponse(m.Author, m.IsInternal, m.Body, m.SentAt))],
            t.CreatedAt,
            [.. t.Photos.OrderBy(p => p.AddedAt).Select(p => new TicketPhotoResponse(p.Id, p.ContentType, p.SizeBytes, p.AddedAt, $"/api/v1/admin/support/{t.Id}/photos/{p.Id}"))]);
    }
}

/// <summary>The support queue: what's waiting for us first, late ones flagged.</summary>
public sealed class ListTickets(DbContext db, ICustomerDirectory customers, ICurrentUser currentUser, IClock clock) : IUseCase
{
    public async Task<IReadOnlyList<StaffTicketListItem>> HandleAsync(TicketStatus? status, bool mine, Guid? serviceRequestId, CancellationToken ct)
    {
        var query = db.Set<SupportTicket>().AsNoTracking().Include(t => t.Messages).Include(t => t.Photos).AsQueryable();
        if (status is { } s)
        {
            query = query.Where(t => t.Status == s);
        }

        if (mine)
        {
            query = query.Where(t => t.AssignedToUserId == currentUser.UserId);
        }

        if (serviceRequestId is { } srId)
        {
            query = query.Where(t => t.ServiceRequestId == srId);
        }

        var tickets = await query
            .OrderBy(t => t.Status)
            .ThenByDescending(t => t.HighPriority)
            .ThenBy(t => t.FirstResponseDueAt)
            .Take(200)
            .ToListAsync(ct);
        return await new StaffViews(customers, clock).ListAsync(tickets, ct);
    }
}

public sealed class GetTicket(DbContext db, ICustomerDirectory customers, IClock clock) : IUseCase
{
    public async Task<Result<StaffTicketResponse>> HandleAsync(Guid id, CancellationToken ct)
    {
        var ticket = await db.Set<SupportTicket>().AsNoTracking().Include(t => t.Messages).Include(t => t.Photos).FirstOrDefaultAsync(t => t.Id == id, ct);
        return ticket is null ? SupportErrors.NotFound : await new StaffViews(customers, clock).DetailAsync(ticket, ct);
    }
}

public sealed record StaffReplyRequest(string Message, bool Internal);

internal sealed class StaffReplyRequestValidator : AbstractValidator<StaffReplyRequest>
{
    public StaffReplyRequestValidator() =>
        RuleFor(r => r.Message).NotEmpty().WithMessage("Write a message.").MaximumLength(SupportTicket.MaxMessageLength);
}

/// <summary>A reply (the customer is told on WhatsApp) or an internal note.</summary>
public sealed class ReplyToTicket(DbContext db, ICustomerDirectory customers, ICurrentUser currentUser, IClock clock) : IUseCase
{
    public async Task<Result<StaffTicketResponse>> HandleAsync(Guid id, StaffReplyRequest request, CancellationToken ct)
    {
        var ticket = await db.Set<SupportTicket>().Include(t => t.Messages).Include(t => t.Photos).FirstOrDefaultAsync(t => t.Id == id, ct);
        if (ticket is null)
        {
            return SupportErrors.NotFound;
        }

        var written = ticket.StaffWrites(currentUser.UserId, request.Message, request.Internal, clock.UtcNow);
        if (written.IsFailure)
        {
            return written.Error!;
        }

        await db.SaveChangesAsync(ct);
        return await new StaffViews(customers, clock).DetailAsync(ticket, ct);
    }
}

public sealed record UpdateTicketRequest(TicketStatus? Status, bool? AssignToMe);

public sealed class UpdateTicket(DbContext db, ICustomerDirectory customers, ICurrentUser currentUser, IClock clock) : IUseCase
{
    public async Task<Result<StaffTicketResponse>> HandleAsync(Guid id, UpdateTicketRequest request, CancellationToken ct)
    {
        var ticket = await db.Set<SupportTicket>().Include(t => t.Messages).Include(t => t.Photos).FirstOrDefaultAsync(t => t.Id == id, ct);
        if (ticket is null)
        {
            return SupportErrors.NotFound;
        }

        var now = clock.UtcNow;
        switch (request.Status)
        {
            case TicketStatus.Resolved:
                ticket.Resolve(now);
                break;
            case TicketStatus.Open:
                ticket.Reopen(now);
                break;
        }

        if (request.AssignToMe is { } assign)
        {
            ticket.AssignTo(assign ? currentUser.UserId : null);
        }

        await db.SaveChangesAsync(ct);
        return await new StaffViews(customers, clock).DetailAsync(ticket, ct);
    }
}

// ── WhatsApp assistant hand-over (n8n "escalate_to_human") ───────────────────

public sealed record AssistantTicketRequest(string IdempotencyKey, string Phone, string? Name, TicketCategory Category, string Summary);

internal sealed class AssistantTicketRequestValidator : AbstractValidator<AssistantTicketRequest>
{
    public AssistantTicketRequestValidator()
    {
        RuleFor(r => r.IdempotencyKey).NotEmpty().MaximumLength(100);
        RuleFor(r => r.Phone).NotEmpty();
        RuleFor(r => r.Name).MaximumLength(120);
        RuleFor(r => r.Category).IsInEnum();
        RuleFor(r => r.Summary).NotEmpty().MaximumLength(SupportTicket.MaxMessageLength);
    }
}

/// <summary>What n8n may tell the customer. No internal ids.</summary>
public sealed record AssistantTicketResponse(string Number, bool Duplicate, string Message);

public sealed class OpenTicketFromAssistant(
    DbContext db,
    TicketNumberGenerator numbers,
    ICustomerDirectory customers,
    ISettingsStore settings,
    IClock clock) : IUseCase
{
    public async Task<Result<AssistantTicketResponse>> HandleAsync(AssistantTicketRequest request, CancellationToken ct)
    {
        var phone = PhoneNumber.Create(request.Phone);
        if (phone.IsFailure)
        {
            return phone.Error!;
        }

        var key = request.IdempotencyKey.Trim();
        if (await db.Set<SupportTicket>().AsNoTracking().FirstOrDefaultAsync(t => t.ExternalReference == key, ct) is { } existing)
        {
            return Reply(existing.Number, duplicate: true);
        }

        var customer = await customers.FindByPhoneAsync(phone.Value, ct);
        var within = TimeSpan.FromMinutes(await settings.GetAsync(SupportSettings.FirstResponseMinutes, ct));
        var ticket = SupportTicket.Open(await numbers.NextAsync(ct), customer?.Id, customer is null ? phone.Value : null, request.Name, null, null,
            request.Category, RequestChannel.WhatsApp, MessageAuthor.Assistant, request.Summary, within, clock.UtcNow, key);
        if (ticket.IsFailure)
        {
            return ticket.Error!;
        }

        db.Set<SupportTicket>().Add(ticket.Value);
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException)
        {
            // The same hand-over delivered twice at once: the unique key keeps one.
            db.ChangeTracker.Clear();
            var winner = await db.Set<SupportTicket>().AsNoTracking().FirstAsync(t => t.ExternalReference == key, ct);
            return Reply(winner.Number, duplicate: true);
        }

        return Reply(ticket.Value.Number, duplicate: false);
    }

    private static AssistantTicketResponse Reply(string number, bool duplicate) =>
        new(number, duplicate, $"I've passed this to our team (reference {number}). Someone will reply to you here on WhatsApp.");
}
