using Microsoft.EntityFrameworkCore;
using ServicePro.BuildingBlocks.Application;
using ServicePro.BuildingBlocks.Settings;
using ServicePro.Contracts;
using ServicePro.Contracts.Ports;
using ServicePro.Modules.ServiceRequests.Domain;
using ServicePro.SharedKernel;
using ServicePro.SharedKernel.Abstractions;
using ServicePro.SharedKernel.Results;

namespace ServicePro.Modules.ServiceRequests.Application;

internal static class ServiceRequestErrors
{
    public static readonly Error NotFound = Error.NotFound("sr.not_found", "That service request doesn't exist.");
    public static readonly Error NotAssigned = Error.Forbidden("sr.not_assigned", "This job isn't assigned to you.");
}

internal static class ServiceRequestQueries
{
    public static IQueryable<ServiceRequest> WithDetails(this DbSet<ServiceRequest> set) =>
        set.Include(s => s.History).Include(s => s.Notes).Include(s => s.Attachments).AsSplitQuery();
}

public sealed record ServiceRequestFilter(
    IReadOnlyList<ServiceRequestStatus>? Statuses,
    Guid? TechnicianId,
    Guid? CustomerId,
    string? SrNumber,
    DateOnly? CreatedFrom,
    DateOnly? CreatedTo,
    bool? OnlyStuck);

public sealed class ListServiceRequests(DbContext db, ServiceRequestViewBuilder views, ISettingsStore settings, IClock clock) : IUseCase
{
    public async Task<PagedResult<ServiceRequestCard>> HandleAsync(ServiceRequestFilter filter, PageRequest page, CancellationToken ct)
    {
        var zone = await settings.GetTimeZoneAsync(ct);
        var stuckAfter = TimeSpan.FromMinutes(await settings.GetAsync(OpsSettings.StuckAfterMinutes, ct));
        var now = clock.UtcNow;

        var query = db.Set<ServiceRequest>().AsNoTracking();
        if (filter.Statuses is { Count: > 0 } statuses)
        {
            query = query.Where(s => statuses.Contains(s.Status));
        }

        if (filter.TechnicianId is { } technicianId)
        {
            query = query.Where(s => s.CurrentTechnicianId == technicianId);
        }

        if (filter.CustomerId is { } customerId)
        {
            query = query.Where(s => s.CustomerId == customerId);
        }

        if (!string.IsNullOrWhiteSpace(filter.SrNumber))
        {
            var number = filter.SrNumber.Trim().ToUpperInvariant();
            query = query.Where(s => s.SrNumber.Contains(number));
        }

        if (filter.CreatedFrom is { } from)
        {
            var start = BusinessSettings.LocalDay(from, zone).Start;
            query = query.Where(s => s.CreatedAt >= start);
        }

        if (filter.CreatedTo is { } to)
        {
            var end = BusinessSettings.LocalDay(to, zone).End;
            query = query.Where(s => s.CreatedAt < end);
        }

        if (filter.OnlyStuck == true)
        {
            var threshold = now - stuckAfter;
            query = query.Where(s =>
                s.LastStatusChangeAt < threshold &&
                s.Status != ServiceRequestStatus.Completed && s.Status != ServiceRequestStatus.WaitingForParts &&
                s.Status != ServiceRequestStatus.Closed && s.Status != ServiceRequestStatus.ClosedNoRepair &&
                s.Status != ServiceRequestStatus.Cancelled);
        }

        var total = await query.CountAsync(ct);
        var requests = await query
            .OrderByDescending(s => s.CreatedAt)
            .Skip(page.Skip).Take(page.SafePageSize)
            .ToListAsync(ct);

        var cards = await views.BuildCardsAsync(requests, stuckAfter, now, ct);
        return new PagedResult<ServiceRequestCard>(cards, total, page.SafePage, page.SafePageSize);
    }
}

/// <summary>Builds the full job view for staff or for the assigned technician.</summary>
public sealed class GetServiceRequestDetail(
    DbContext db,
    ServiceRequestViewBuilder views,
    ICustomerDirectory customers,
    ICatalogDirectory catalog,
    ITechnicianDirectory technicians,
    IBillingDirectory billing,
    ISettingsStore settings,
    ICurrentUser currentUser,
    IClock clock) : IUseCase
{
    public async Task<Result<ServiceRequestDetail>> HandleAsync(Guid serviceRequestId, CancellationToken ct)
    {
        var request = await db.Set<ServiceRequest>().WithDetails().AsNoTracking().FirstOrDefaultAsync(s => s.Id == serviceRequestId, ct);
        if (request is null)
        {
            return ServiceRequestErrors.NotFound;
        }

        var isTechnician = currentUser.Role == UserRole.Technician;
        if (isTechnician && request.CurrentTechnicianId != currentUser.TechnicianId)
        {
            return ServiceRequestErrors.NotAssigned;
        }

        var stuckAfter = TimeSpan.FromMinutes(await settings.GetAsync(OpsSettings.StuckAfterMinutes, ct));
        var card = (await views.BuildCardsAsync([request], stuckAfter, clock.UtcNow, ct))[0];
        var address = await customers.GetAddressAsync(request.AddressId, ct);
        var appliance = request.ApplianceId is { } applianceId ? await customers.GetApplianceAsync(applianceId, ct) : null;
        var issueType = request.IssueTypeId is { } issueTypeId ? await catalog.GetIssueTypeAsync(issueTypeId, ct) : null;
        var category = await catalog.GetCategoryAsync(request.CategoryId, ct);
        var technician = request.CurrentTechnicianId is { } technicianId ? await technicians.GetAsync(technicianId, ct) : null;
        var invoice = await billing.GetInvoiceForServiceRequestAsync(request.Id, ct);
        var actorType = isTechnician ? ActorType.Technician : ActorType.User;
        var review = await db.Set<Review>().AsNoTracking().FirstOrDefaultAsync(r => r.ServiceRequestId == request.Id, ct);

        return new ServiceRequestDetail(
            card,
            request.ProblemDescription,
            request.Channel,
            request.AddressId,
            address is null
                ? new AddressView(string.Empty, null, null, string.Empty, string.Empty, string.Empty, null, null)
                : new AddressView(address.Line1, address.Line2, address.Landmark, address.Locality, address.City, address.Pincode,
                    address.Location?.Latitude, address.Location?.Longitude),
            request.ApplianceId,
            appliance is null ? null : string.Join(" ", new[] { appliance.Brand, appliance.ModelNumber }.Where(s => !string.IsNullOrWhiteSpace(s))),
            request.IssueTypeId,
            issueType?.Name,
            request.VisitCharge,
            request.FinalAmount,
            request.PreferredSlotStart,
            request.PreferredSlotEnd,
            request.AcceptedAt,
            request.EnRouteAt,
            request.ArrivedAt,
            request.CompletedAt,
            request.ClosedAt,
            request.IsWarrantyVisit,
            request.ParentServiceRequestId,
            $"/t/{request.TrackingToken}",
            category?.RequiresPhotos ?? false,
            technician is null ? null : ServiceRequestViewBuilder.ToView(technician),
            [.. request.History.OrderByDescending(h => h.OccurredAt).Select(ServiceRequestViewBuilder.ToResponse)],
            [.. request.Notes.OrderByDescending(n => n.CreatedAt).Select(ServiceRequestViewBuilder.ToResponse)],
            [.. request.Attachments.OrderBy(a => a.CreatedAt).Select(a => new AttachmentResponse(
                a.Id, a.Kind, a.ContentType, a.SizeBytes, $"/api/v1/service-requests/{request.Id}/attachments/{a.Id}", a.CreatedAt))],
            [.. request.AvailableTransitions(actorType).Select(ServiceRequestViewBuilder.ToAvailable)],
            invoice,
            review is null ? null : new ReviewResponse(review.Rating, review.Comment, review.SubmittedAt));
    }
}

// ── Live board & dashboard ──────────────────────────────────────────────────

public sealed record BoardResponse(DateOnly Date, IReadOnlyList<ServiceRequestCard> Cards);

public sealed record DashboardSummaryResponse(
    DateOnly Date,
    int CreatedToday,
    int AwaitingAssignment,
    int Offered,
    int Assigned,
    int InProgress,
    int OnHold,
    int CompletedToday,
    int CancelledToday,
    int Stuck,
    int UnpaidCompleted);

/// <summary>All open jobs plus those finished on the chosen day (the owner's "what's happening" view).</summary>
public sealed class GetLiveBoard(DbContext db, ServiceRequestViewBuilder views, ISettingsStore settings, IClock clock) : IUseCase
{
    public async Task<BoardResponse> HandleAsync(DateOnly? date, CancellationToken ct)
    {
        var zone = await settings.GetTimeZoneAsync(ct);
        var stuckAfter = TimeSpan.FromMinutes(await settings.GetAsync(OpsSettings.StuckAfterMinutes, ct));
        var now = clock.UtcNow;
        var day = date ?? BusinessSettings.Today(now, zone);
        var (start, end) = BusinessSettings.LocalDay(day, zone);

        var requests = await BoardQuery.Load(db, start, end).ToListAsync(ct);
        var cards = await views.BuildCardsAsync(requests, stuckAfter, now, ct);
        return new BoardResponse(day, cards);
    }
}

public sealed class GetDashboardSummary(DbContext db, ISettingsStore settings, IClock clock) : IUseCase
{
    public async Task<DashboardSummaryResponse> HandleAsync(CancellationToken ct)
    {
        var zone = await settings.GetTimeZoneAsync(ct);
        var stuckAfter = TimeSpan.FromMinutes(await settings.GetAsync(OpsSettings.StuckAfterMinutes, ct));
        var now = clock.UtcNow;
        var day = BusinessSettings.Today(now, zone);
        var (start, end) = BusinessSettings.LocalDay(day, zone);

        var requests = await BoardQuery.Load(db, start, end).AsNoTracking().ToListAsync(ct);
        var createdToday = await db.Set<ServiceRequest>().CountAsync(s => s.CreatedAt >= start && s.CreatedAt < end, ct);

        int Count(params ServiceRequestStatus[] statuses) => requests.Count(r => statuses.Contains(r.Status));

        return new DashboardSummaryResponse(
            day,
            createdToday,
            Count(ServiceRequestStatus.New, ServiceRequestStatus.ReadyForAssignment),
            Count(ServiceRequestStatus.Offered),
            Count(ServiceRequestStatus.Accepted),
            Count(ServiceRequestStatus.EnRoute, ServiceRequestStatus.Arrived, ServiceRequestStatus.Diagnosing, ServiceRequestStatus.InProgress, ServiceRequestStatus.AwaitingEstimateApproval),
            Count(ServiceRequestStatus.WaitingForParts, ServiceRequestStatus.Rescheduled, ServiceRequestStatus.CustomerUnavailable, ServiceRequestStatus.UnableToRepair),
            requests.Count(r => r.CompletedAt >= start && r.CompletedAt < end),
            requests.Count(r => r.CancelledAt >= start && r.CancelledAt < end),
            requests.Count(r => ServiceRequestViewBuilder.IsStuck(r, stuckAfter, now)),
            requests.Count(r => r.Status == ServiceRequestStatus.Completed && r.PaymentStatus is PaymentStatus.Pending or PaymentStatus.Partial));
    }
}

internal static class BoardQuery
{
    /// <summary>Open jobs, plus jobs completed/closed/cancelled within [start, end).</summary>
    public static IQueryable<ServiceRequest> Load(DbContext db, DateTimeOffset start, DateTimeOffset end) =>
        db.Set<ServiceRequest>().AsNoTracking().Where(s =>
            (s.Status != ServiceRequestStatus.Closed && s.Status != ServiceRequestStatus.ClosedNoRepair && s.Status != ServiceRequestStatus.Cancelled)
            || (s.ClosedAt >= start && s.ClosedAt < end)
            || (s.CancelledAt >= start && s.CancelledAt < end)
            || (s.CompletedAt >= start && s.CompletedAt < end));
}

// ── Technician's day ────────────────────────────────────────────────────────

public sealed record MyJobsResponse(IReadOnlyList<ServiceRequestCard> Active, IReadOnlyList<ServiceRequestCard> CompletedToday);

public sealed class ListMyJobs(DbContext db, ServiceRequestViewBuilder views, ISettingsStore settings, ICurrentUser currentUser, IClock clock) : IUseCase
{
    private static readonly ServiceRequestStatus[] Finished =
        [ServiceRequestStatus.Completed, ServiceRequestStatus.Closed, ServiceRequestStatus.ClosedNoRepair, ServiceRequestStatus.Cancelled, ServiceRequestStatus.UnableToRepair];

    public async Task<MyJobsResponse> HandleAsync(CancellationToken ct)
    {
        var technicianId = currentUser.TechnicianId;
        var zone = await settings.GetTimeZoneAsync(ct);
        var stuckAfter = TimeSpan.FromMinutes(await settings.GetAsync(OpsSettings.StuckAfterMinutes, ct));
        var now = clock.UtcNow;
        var (start, end) = BusinessSettings.LocalDay(now, zone);

        // Offers live in Dispatch; here only jobs this technician has accepted.
        var requests = await db.Set<ServiceRequest>().AsNoTracking()
            .Where(s => s.CurrentTechnicianId == technicianId && s.Status != ServiceRequestStatus.Offered)
            .Where(s => !Finished.Contains(s.Status) || (s.CompletedAt >= start && s.CompletedAt < end) || (s.ClosedAt >= start && s.ClosedAt < end))
            .OrderBy(s => s.ScheduledStart ?? s.CreatedAt)
            .ToListAsync(ct);

        var cards = await views.BuildCardsAsync(requests, stuckAfter, now, ct);
        return new MyJobsResponse(
            [.. cards.Where(c => !Finished.Contains(c.Status))],
            [.. cards.Where(c => Finished.Contains(c.Status))]);
    }
}

// ── Workflow metadata ───────────────────────────────────────────────────────

public sealed record TransitionRuleResponse(
    ServiceRequestStatus From,
    ServiceRequestStatus To,
    IReadOnlyList<string> Actors,
    bool RequiresReason,
    bool RequiresCompletionCode,
    bool RequiresAfterPhoto,
    bool DispatchOnly);

public sealed class GetWorkflowMetadata : IUseCase
{
    public IReadOnlyList<TransitionRuleResponse> Handle() =>
        [.. ServiceRequestWorkflow.Rules.Select(r => new TransitionRuleResponse(
            r.From,
            r.To,
            [.. Enum.GetValues<TransitionActors>().Where(a => a != TransitionActors.None && r.Actors.HasFlag(a)).Select(a => a.ToString())],
            r.Requirements.HasFlag(TransitionRequirements.Reason),
            r.Requirements.HasFlag(TransitionRequirements.CompletionCode),
            r.Requirements.HasFlag(TransitionRequirements.AfterPhoto),
            r.DispatchOnly))];
}
