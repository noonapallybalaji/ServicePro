using FluentValidation;
using Microsoft.EntityFrameworkCore;
using ServicePro.BuildingBlocks.Application;
using ServicePro.BuildingBlocks.Messaging;
using ServicePro.BuildingBlocks.Settings;
using ServicePro.Contracts;
using ServicePro.Contracts.Events;
using ServicePro.Contracts.Ports;
using ServicePro.Modules.ServiceRequests.Domain;
using ServicePro.SharedKernel.Abstractions;
using ServicePro.SharedKernel.Results;

namespace ServicePro.Modules.ServiceRequests.Application;

/*
 * Service warranty (gap analysis 9.2, 9.3). A warranty is a promise only the business can make,
 * so there is none until the owner sets warranty.days. When a repaired job closes, its warranty
 * end date is fixed (later setting changes don't rewrite old jobs). While it lasts, the customer
 * can ask for a free re-visit, which staff confirm like any self-service booking.
 */

public static class WarrantySettings
{
    public static readonly SettingDefinition<int> Days = new(
        "warranty.days",
        0,
        "Days of service warranty on repaired jobs, from the day the job is closed. 0 = no warranty is offered or shown.");

    public static readonly SettingDefinition<string> Terms = new(
        "warranty.terms",
        string.Empty,
        "What the warranty covers, in the customer's words (shown on the warranty card). Empty: \"the same problem, on the work we did\".");
}

/// <summary>Fixes the warranty end date when a repaired job closes.</summary>
public sealed class StampWarrantyOnClose(DbContext db, ISettingsStore settings) : IEventHandler<ServiceRequestStatusChanged>
{
    public async Task HandleAsync(ServiceRequestStatusChanged e, CancellationToken ct)
    {
        if (e.To != ServiceRequestStatus.Closed)
        {
            return;
        }

        var days = await settings.GetAsync(WarrantySettings.Days, ct);
        if (days <= 0)
        {
            return;
        }

        var job = await db.Set<ServiceRequest>().FirstOrDefaultAsync(s => s.Id == e.ServiceRequestId, ct);
        job?.GrantWarranty(e.OccurredAt.AddDays(days));
        await db.SaveChangesAsync(ct);
    }
}

/// <summary>The warranty card the customer sees for one job.</summary>
public sealed record WarrantyCardResponse(DateTimeOffset Until, string Terms, bool Active, bool CanRequestRevisit, string? OpenRevisitSrNumber);

public sealed class WarrantyCards(DbContext db, ISettingsStore settings, IClock clock)
{
    public const string DefaultTerms = "The same problem, on the work we did.";

    public async Task<WarrantyCardResponse?> ForAsync(ServiceRequest job, CancellationToken ct)
    {
        if (job.WarrantyUntil is not { } until)
        {
            return null;
        }

        var terms = await settings.GetAsync(WarrantySettings.Terms, ct);
        var open = await OpenRevisitAsync(job.Id, ct);
        var active = clock.UtcNow < until;
        return new WarrantyCardResponse(until, string.IsNullOrWhiteSpace(terms) ? DefaultTerms : terms.Trim(), active, active && open is null, open);
    }

    public async Task<string?> OpenRevisitAsync(Guid parentId, CancellationToken ct)
    {
        var finished = ServiceRequestWorkflow.Terminal.ToArray();
        return await db.Set<ServiceRequest>().AsNoTracking()
            .Where(s => s.ParentServiceRequestId == parentId && s.IsWarrantyVisit && !finished.Contains(s.Status))
            .Select(s => s.SrNumber)
            .FirstOrDefaultAsync(ct);
    }
}

public sealed record RevisitRequest(string Description, DateTimeOffset PreferredSlotStart, DateTimeOffset PreferredSlotEnd);

internal sealed class RevisitRequestValidator : AbstractValidator<RevisitRequest>
{
    public RevisitRequestValidator()
    {
        RuleFor(r => r.Description).NotEmpty().WithMessage("Tell us what's happening again.").MaximumLength(1000);
        RuleFor(r => r.PreferredSlotEnd).GreaterThan(r => r.PreferredSlotStart).WithMessage("Choose a time slot.");
    }
}

public sealed record RevisitResponse(Guid ServiceRequestId, string SrNumber, string TrackingPath);

/// <summary>"The problem came back": a free warranty visit for a job still under warranty.</summary>
public sealed class RequestWarrantyRevisit(
    DbContext db,
    ICurrentUser currentUser,
    WarrantyCards warranty,
    SlotAvailability availability,
    ICustomerDirectory customers,
    SrNumberGenerator srNumbers,
    IClock clock) : IUseCase
{
    public async Task<Result<RevisitResponse>> HandleAsync(Guid id, RevisitRequest request, CancellationToken ct)
    {
        var parent = await MyBookingLookup.FindAsync(db, currentUser, id, ct);
        if (parent.IsFailure)
        {
            return parent.Error!;
        }

        var job = parent.Value;
        var card = await warranty.ForAsync(job, ct);
        if (card is null || !card.Active)
        {
            return Error.Conflict("warranty.expired", "This job isn't under warranty any more. You can book a new visit instead.");
        }

        if (card.OpenRevisitSrNumber is { } open)
        {
            return Error.Conflict("warranty.revisit_open", $"We already have a re-visit for this ({open}). You can follow it in My bookings.");
        }

        if (BookingRules.ValidateSlot(clock, request.PreferredSlotStart, request.PreferredSlotEnd) is { } invalid)
        {
            return invalid;
        }

        var address = await customers.GetAddressAsync(job.AddressId, ct);
        if (await availability.CheckAsync(job.CategoryId, address?.Pincode ?? string.Empty, request.PreferredSlotStart, request.PreferredSlotEnd, null, ct) is { } full)
        {
            return full;
        }

        var revisit = ServiceRequest.Create(
            new NewServiceRequest(
                await srNumbers.NextAsync(ct),
                job.CustomerId,
                job.AddressId,
                job.ApplianceId,
                job.CategoryId,
                job.IssueTypeId,
                $"Warranty re-visit for {job.SrNumber}: {request.Description.Trim()}",
                RequestChannel.Website,
                Priority.High,
                0m,
                request.PreferredSlotStart,
                request.PreferredSlotEnd,
                ScheduledStart: null,
                ScheduledEnd: null,
                IsWarrantyVisit: true,
                ParentServiceRequestId: job.Id,
                AwaitsReview: true),
            Actor.Customer,
            clock.UtcNow);
        revisit.SetVisitDetails(job.AccessNotes, job.VisitContactName, job.VisitContactPhone, job.ApplianceUnderWarranty);
        db.Set<ServiceRequest>().Add(revisit);
        await db.SaveChangesAsync(ct);
        return new RevisitResponse(revisit.Id, revisit.SrNumber, $"/t/{revisit.TrackingToken}");
    }
}
