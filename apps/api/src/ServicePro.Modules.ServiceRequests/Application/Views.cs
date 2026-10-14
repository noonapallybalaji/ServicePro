using ServicePro.Contracts;
using ServicePro.Contracts.Ports;
using ServicePro.Modules.ServiceRequests.Domain;
using ServicePro.SharedKernel.Abstractions;

namespace ServicePro.Modules.ServiceRequests.Application;

/// <summary>Compact job representation for lists, boards and the technician's day.</summary>
public sealed record ServiceRequestCard(
    Guid Id,
    string SrNumber,
    ServiceRequestStatus Status,
    string? StatusReason,
    Priority Priority,
    Guid CategoryId,
    string CategoryName,
    string CategoryCode,
    string ProblemSummary,
    Guid CustomerId,
    string CustomerName,
    string CustomerPhone,
    string Locality,
    string Pincode,
    Guid? TechnicianId,
    string? TechnicianName,
    DateTimeOffset? ScheduledStart,
    DateTimeOffset? ScheduledEnd,
    DateTimeOffset CreatedAt,
    DateTimeOffset LastStatusChangeAt,
    PaymentStatus PaymentStatus,
    bool IsStuck);

public sealed record HistoryEntryResponse(
    Guid Id,
    ServiceRequestStatus From,
    ServiceRequestStatus To,
    string? ReasonCode,
    string? Note,
    ActorType ActorType,
    Guid? ActorUserId,
    DateTimeOffset OccurredAt);

public sealed record NoteResponse(Guid Id, string Body, NoteVisibility Visibility, ActorType AuthorType, Guid? AuthorUserId, DateTimeOffset CreatedAt);

public sealed record AttachmentResponse(Guid Id, AttachmentKind Kind, string ContentType, long SizeBytes, string Url, DateTimeOffset CreatedAt);

public sealed record AvailableTransition(ServiceRequestStatus To, bool RequiresReason, bool RequiresCompletionCode, bool RequiresAfterPhoto);

public sealed record AddressView(string Line1, string? Line2, string? Landmark, string Locality, string City, string Pincode, double? Latitude, double? Longitude);

public sealed record TechnicianView(Guid Id, string FullName, string Phone, string? PhotoUrl, string Specialty, decimal? RatingAverage, int CompletedJobs, TechnicianDutyStatus DutyStatus);

public sealed record ServiceRequestDetail(
    ServiceRequestCard Card,
    string ProblemDescription,
    RequestChannel Channel,
    Guid AddressId,
    AddressView Address,
    Guid? ApplianceId,
    string? ApplianceDescription,
    Guid? IssueTypeId,
    string? IssueTypeName,
    decimal VisitCharge,
    decimal? FinalAmount,
    DateTimeOffset? PreferredSlotStart,
    DateTimeOffset? PreferredSlotEnd,
    DateTimeOffset? AcceptedAt,
    DateTimeOffset? EnRouteAt,
    DateTimeOffset? ArrivedAt,
    DateTimeOffset? CompletedAt,
    DateTimeOffset? ClosedAt,
    bool IsWarrantyVisit,
    Guid? ParentServiceRequestId,
    string TrackingPath,
    bool RequiresPhotos,
    TechnicianView? Technician,
    IReadOnlyList<HistoryEntryResponse> History,
    IReadOnlyList<NoteResponse> Notes,
    IReadOnlyList<AttachmentResponse> Attachments,
    IReadOnlyList<AvailableTransition> AvailableTransitions,
    InvoiceSummary? Invoice,
    ReviewResponse? Review = null);

/// <summary>The customer's rating of the job.</summary>
public sealed record ReviewResponse(int Rating, string? Comment, DateTimeOffset SubmittedAt);

/// <summary>
/// Joins service requests with names from other modules through their ports, in batches
/// (one query per module, never one per row).
/// </summary>
public sealed class ServiceRequestViewBuilder(ICustomerDirectory customers, ICatalogDirectory catalog, ITechnicianDirectory technicians)
{
    private const int SummaryLength = 140;

    public async Task<IReadOnlyList<ServiceRequestCard>> BuildCardsAsync(IReadOnlyList<ServiceRequest> requests, TimeSpan stuckAfter, DateTimeOffset now, CancellationToken ct)
    {
        if (requests.Count == 0)
        {
            return [];
        }

        var customerMap = await customers.GetManyAsync(requests.Select(r => r.CustomerId), ct);
        var addressMap = await customers.GetAddressesAsync(requests.Select(r => r.AddressId), ct);
        var categoryMap = await catalog.GetCategoriesAsync(requests.Select(r => r.CategoryId), ct);
        var technicianMap = await technicians.GetManyAsync(requests.Where(r => r.CurrentTechnicianId.HasValue).Select(r => r.CurrentTechnicianId!.Value), ct);

        return [.. requests.Select(r => ToCard(r, customerMap, addressMap, categoryMap, technicianMap, stuckAfter, now))];
    }

    public static AvailableTransition ToAvailable(TransitionRule rule) => new(
        rule.To,
        rule.Requirements.HasFlag(TransitionRequirements.Reason),
        rule.Requirements.HasFlag(TransitionRequirements.CompletionCode),
        rule.Requirements.HasFlag(TransitionRequirements.AfterPhoto));

    public static HistoryEntryResponse ToResponse(StatusHistoryEntry h) =>
        new(h.Id, h.FromStatus, h.ToStatus, h.ReasonCode, h.Note, h.ActorType, h.ActorUserId, h.OccurredAt);

    public static NoteResponse ToResponse(ServiceRequestNote n) =>
        new(n.Id, n.Body, n.Visibility, n.AuthorType, n.AuthorUserId, n.CreatedAt);

    public static TechnicianView ToView(TechnicianInfo t) =>
        new(t.Id, t.FullName, t.Phone.Value, t.PhotoUrl, t.Specialty, t.RatingAverage, t.CompletedJobs, t.DutyStatus);

    /// <summary>Statuses where nothing moving for a while means someone should look.</summary>
    public static bool IsStuck(ServiceRequest r, TimeSpan stuckAfter, DateTimeOffset now) =>
        !r.IsTerminal && r.Status is not ServiceRequestStatus.Completed and not ServiceRequestStatus.WaitingForParts
            && now - r.LastStatusChangeAt > stuckAfter;

    private static ServiceRequestCard ToCard(
        ServiceRequest r,
        IReadOnlyDictionary<Guid, CustomerInfo> customerMap,
        IReadOnlyDictionary<Guid, AddressInfo> addressMap,
        IReadOnlyDictionary<Guid, CategoryInfo> categoryMap,
        IReadOnlyDictionary<Guid, TechnicianInfo> technicianMap,
        TimeSpan stuckAfter,
        DateTimeOffset now)
    {
        var customer = customerMap.GetValueOrDefault(r.CustomerId);
        var address = addressMap.GetValueOrDefault(r.AddressId);
        var category = categoryMap.GetValueOrDefault(r.CategoryId);
        var technician = r.CurrentTechnicianId is { } tid ? technicianMap.GetValueOrDefault(tid) : null;

        return new ServiceRequestCard(
            r.Id,
            r.SrNumber,
            r.Status,
            r.StatusReason,
            r.Priority,
            r.CategoryId,
            category?.Name ?? "Service",
            category?.Code ?? "OTHER",
            r.ProblemDescription.Length > SummaryLength ? r.ProblemDescription[..SummaryLength] + "…" : r.ProblemDescription,
            r.CustomerId,
            customer?.FullName ?? "Unknown customer",
            customer?.Phone.Value ?? string.Empty,
            address?.Locality ?? string.Empty,
            address?.Pincode ?? string.Empty,
            r.CurrentTechnicianId,
            technician?.FullName,
            r.ScheduledStart,
            r.ScheduledEnd,
            r.CreatedAt,
            r.LastStatusChangeAt,
            r.PaymentStatus,
            IsStuck(r, stuckAfter, now));
    }
}
