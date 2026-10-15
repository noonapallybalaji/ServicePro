using Microsoft.EntityFrameworkCore;
using ServicePro.BuildingBlocks.Application;
using ServicePro.BuildingBlocks.Persistence;
using ServicePro.BuildingBlocks.Storage;
using ServicePro.Contracts;
using ServicePro.Contracts.Ports;
using ServicePro.Modules.ServiceRequests.Domain;
using ServicePro.SharedKernel.Abstractions;
using ServicePro.SharedKernel.Results;
using ServicePro.SharedKernel.ValueObjects;

namespace ServicePro.Modules.ServiceRequests.Application;

public sealed record TrackingTimelineEntry(ServiceRequestStatus Status, DateTimeOffset OccurredAt);

public sealed record TrackingTechnician(string FullName, string? PhotoUrl, string Specialty, decimal? RatingAverage, int CompletedJobs, string? Phone);

public sealed record TrackingPhoto(Guid Id, AttachmentKind Kind, string Url, DateTimeOffset CreatedAt);

/// <summary>
/// What the customer sees at /t/{token} (UX-ARCHITECTURE.md §7): what's happening, who, what it costs,
/// what's next. Deliberately minimal personal data: first name, locality, no full address.
/// </summary>
public sealed record TrackingResponse(
    string SrNumber,
    ServiceRequestStatus Status,
    string? StatusReason,
    string CategoryName,
    string ProblemDescription,
    string CustomerFirstName,
    string Locality,
    string City,
    DateTimeOffset? PreferredSlotStart,
    DateTimeOffset? PreferredSlotEnd,
    DateTimeOffset? ScheduledStart,
    DateTimeOffset? ScheduledEnd,
    decimal VisitCharge,
    decimal? FinalAmount,
    PaymentStatus PaymentStatus,
    DateTimeOffset CreatedAt,
    IReadOnlyList<TrackingTimelineEntry> Timeline,
    TrackingTechnician? Technician,
    IReadOnlyList<TrackingPhoto> Photos,
    IReadOnlyList<string> Messages,
    InvoiceSummary? Invoice,
    ReviewResponse? Review = null,
    bool CanReview = false,
    LiveLocationResponse? Live = null);

/// <summary>
/// Where the technician is while on the way, and roughly how long until they arrive. Only while
/// EN_ROUTE and only from a recent report; the customer's own pin is never included, because
/// tracking links can be forwarded.
/// </summary>
public sealed record LiveLocationResponse(double Latitude, double Longitude, DateTimeOffset At, int? EtaMinutes);

internal static class TrackingRules
{
    /// <summary>Tracking links stop working 30 days after a job ends (PLAN.md §14.1).</summary>
    public static readonly TimeSpan LinkLifetimeAfterClose = TimeSpan.FromDays(30);

    /// <summary>The technician's number is shared only while they're actively handling the job.</summary>
    public static readonly IReadOnlySet<ServiceRequestStatus> PhoneVisible = new HashSet<ServiceRequestStatus>
    {
        ServiceRequestStatus.Accepted,
        ServiceRequestStatus.EnRoute,
        ServiceRequestStatus.Arrived,
        ServiceRequestStatus.Diagnosing,
        ServiceRequestStatus.InProgress,
    };

    public static readonly Error Expired = Error.NotFound("tracking.not_found", "This tracking link has expired or doesn't exist.");

    public static async Task<ServiceRequest?> FindByTokenAsync(DbContext db, TenantScope tenant, string token, IClock clock, CancellationToken ct)
    {
        var request = await db.Set<ServiceRequest>().IgnoreQueryFilters()
            .Include(s => s.History).Include(s => s.Notes).Include(s => s.Attachments).AsSplitQuery()
            .AsNoTracking()
            .FirstOrDefaultAsync(s => s.TrackingToken == token, ct);
        if (request is null)
        {
            return null;
        }

        var endedAt = request.ClosedAt ?? request.CancelledAt;
        if (endedAt is { } ended && clock.UtcNow - ended > LinkLifetimeAfterClose)
        {
            return null;
        }

        // Public requests carry no tenant claim; everything after this runs in the job's tenant.
        tenant.Use(request.TenantId);
        return request;
    }
}

public sealed class GetTracking(
    DbContext db,
    TenantScope tenant,
    ICustomerDirectory customers,
    ICatalogDirectory catalog,
    ITechnicianDirectory technicians,
    IBillingDirectory billing,
    IClock clock) : IUseCase
{
    public async Task<Result<TrackingResponse>> HandleAsync(string token, CancellationToken ct)
    {
        var request = await TrackingRules.FindByTokenAsync(db, tenant, token, clock, ct);
        if (request is null)
        {
            return TrackingRules.Expired;
        }

        var customer = await customers.GetAsync(request.CustomerId, ct);
        var address = await customers.GetAddressAsync(request.AddressId, ct);
        var category = await catalog.GetCategoryAsync(request.CategoryId, ct);
        var technician = request.CurrentTechnicianId is { } technicianId && request.Status != ServiceRequestStatus.Offered
            ? await technicians.GetAsync(technicianId, ct)
            : null;
        var invoice = await billing.GetInvoiceForServiceRequestAsync(request.Id, ct);
        var review = await db.Set<Review>().AsNoTracking().FirstOrDefaultAsync(r => r.ServiceRequestId == request.Id, ct);
        var live = request.Status == ServiceRequestStatus.EnRoute ? LiveLocation.For(technician, address?.Location, clock.UtcNow) : null;

        return new TrackingResponse(
            request.SrNumber,
            request.Status,
            request.StatusReason,
            category?.Name ?? "Service",
            request.ProblemDescription,
            customer?.FullName.Split(' ', StringSplitOptions.RemoveEmptyEntries).FirstOrDefault() ?? "there",
            address?.Locality ?? string.Empty,
            address?.City ?? string.Empty,
            request.PreferredSlotStart,
            request.PreferredSlotEnd,
            request.ScheduledStart,
            request.ScheduledEnd,
            request.VisitCharge,
            request.FinalAmount,
            request.PaymentStatus,
            request.CreatedAt,
            [.. request.History.OrderBy(h => h.OccurredAt).Select(h => new TrackingTimelineEntry(h.ToStatus, h.OccurredAt))],
            technician is null
                ? null
                : new TrackingTechnician(
                    technician.FullName,
                    technician.PhotoUrl,
                    technician.Specialty,
                    technician.RatingAverage,
                    technician.CompletedJobs,
                    TrackingRules.PhoneVisible.Contains(request.Status) ? technician.Phone.Value : null),
            [.. request.Attachments.Where(a => a.IsCustomerVisible).OrderBy(a => a.CreatedAt)
                .Select(a => new TrackingPhoto(a.Id, a.Kind, $"/api/v1/public/track/{token}/photos/{a.Id}", a.CreatedAt))],
            [.. request.Notes.Where(n => n.Visibility == NoteVisibility.Customer).OrderBy(n => n.CreatedAt).Select(n => n.Body)],
            invoice,
            review is null ? null : new ReviewResponse(review.Rating, review.Comment, review.SubmittedAt),
            review is null && Reviews.Finished.Contains(request.Status),
            live);
    }
}

public sealed class OpenTrackingPhoto(DbContext db, TenantScope tenant, IFileStorage storage, IClock clock) : IUseCase
{
    public async Task<Result<AttachmentContent>> HandleAsync(string token, Guid attachmentId, CancellationToken ct)
    {
        var request = await TrackingRules.FindByTokenAsync(db, tenant, token, clock, ct);
        var attachment = request?.Attachments.FirstOrDefault(a => a.Id == attachmentId && a.IsCustomerVisible);
        if (attachment is null)
        {
            return TrackingRules.Expired;
        }

        var stream = await storage.OpenReadAsync(attachment.StorageKey, ct);
        return stream is null ? TrackingRules.Expired : new AttachmentContent(stream, attachment.ContentType);
    }
}

internal static class LiveLocation
{
    /// <summary>Older reports aren't shown: the phone may have stopped sharing.</summary>
    private static readonly TimeSpan FreshFor = TimeSpan.FromMinutes(10);

    /// <summary>Road distance is longer than a straight line; ~1.4× is typical in Indian cities.</summary>
    private const double RoadFactor = 1.4;

    /// <summary>A cautious average city speed for two-wheelers in traffic.</summary>
    private const double CitySpeedKmh = 20;

    public static LiveLocationResponse? For(TechnicianInfo? technician, GeoLocation? destination, DateTimeOffset now)
    {
        if (technician is not { LastLocation: { } at, LastLocationAt: { } when } || now - when > FreshFor)
        {
            return null;
        }

        return new LiveLocationResponse(at.Latitude, at.Longitude, when, destination is null ? null : EtaMinutes(at.DistanceKmTo(destination)));
    }

    /// <summary>Rounded up to 5 minutes, at least 5: an honest "about", not a promise.</summary>
    public static int EtaMinutes(double straightLineKm)
    {
        var minutes = straightLineKm * RoadFactor / CitySpeedKmh * 60;
        return Math.Max(5, (int)Math.Ceiling(minutes / 5) * 5);
    }
}
