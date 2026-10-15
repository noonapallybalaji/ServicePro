using Microsoft.EntityFrameworkCore;
using ServicePro.BuildingBlocks.Application;
using ServicePro.Contracts;
using ServicePro.Contracts.Ports;
using ServicePro.Modules.ServiceRequests.Domain;
using ServicePro.SharedKernel.Abstractions;
using ServicePro.SharedKernel.Results;

namespace ServicePro.Modules.ServiceRequests.Application;

/// <summary>One booking as the customer sees it in "My bookings". The tracking page has the full detail.</summary>
public sealed record MyBookingResponse(
    Guid Id,
    string SrNumber,
    string CategoryName,
    string CategoryCode,
    ServiceRequestStatus Status,
    string ProblemDescription,
    string Locality,
    DateTimeOffset CreatedAt,
    DateTimeOffset? PreferredSlotStart,
    DateTimeOffset? PreferredSlotEnd,
    DateTimeOffset? ScheduledStart,
    DateTimeOffset? ScheduledEnd,
    string? TechnicianName,
    PaymentStatus PaymentStatus,
    decimal VisitCharge,
    decimal? FinalAmount,
    string TrackingPath,
    bool CanCancel,
    bool CanReschedule);

/// <summary>The signed-in customer's bookings, newest first. Scoped by the customer id in their token.</summary>
public sealed class ListMyBookings(
    DbContext db,
    ICurrentUser currentUser,
    ICatalogDirectory catalog,
    ICustomerDirectory customers,
    ITechnicianDirectory technicians,
    CustomerChangePolicy policy) : IUseCase
{
    private const int Limit = 50;

    public async Task<Result<IReadOnlyList<MyBookingResponse>>> HandleAsync(CancellationToken ct)
    {
        if (currentUser.CustomerId is not { } customerId)
        {
            return Error.Unauthorized("account.not_signed_in", "Please sign in to see your bookings.");
        }

        var requests = await db.Set<ServiceRequest>().AsNoTracking()
            .Where(s => s.CustomerId == customerId)
            .OrderByDescending(s => s.CreatedAt)
            .Take(Limit)
            .ToListAsync(ct);

        var categories = await catalog.GetCategoriesAsync(requests.Select(r => r.CategoryId), ct);
        var addresses = await customers.GetAddressesAsync(requests.Select(r => r.AddressId), ct);
        var techs = await technicians.GetManyAsync(requests.Where(r => r.CurrentTechnicianId.HasValue).Select(r => r.CurrentTechnicianId!.Value), ct);

        var allowed = new Dictionary<Guid, (bool CanCancel, bool CanReschedule)>();
        foreach (var r in requests)
        {
            allowed[r.Id] = await policy.EvaluateAsync(r, ct);
        }

        return requests.Select(r =>
        {
            var category = categories.GetValueOrDefault(r.CategoryId);
            var technician = r.CurrentTechnicianId is { } techId ? techs.GetValueOrDefault(techId) : null;
            return new MyBookingResponse(
                r.Id,
                r.SrNumber,
                category?.Name ?? "Service",
                category?.Code ?? string.Empty,
                r.Status,
                r.ProblemDescription,
                addresses.GetValueOrDefault(r.AddressId)?.Locality ?? string.Empty,
                r.CreatedAt,
                r.PreferredSlotStart,
                r.PreferredSlotEnd,
                r.ScheduledStart,
                r.ScheduledEnd,
                technician?.FullName,
                r.PaymentStatus,
                r.VisitCharge,
                r.FinalAmount,
                $"/t/{r.TrackingToken}",
                allowed[r.Id].CanCancel,
                allowed[r.Id].CanReschedule);
        }).ToList();
    }
}

/// <summary>
/// One booking inside "My bookings": the same live view as the tracking page, plus what the
/// customer can do with it. Tracking is null once the job's tracking link has expired.
/// </summary>
public sealed record MyBookingDetailResponse(MyBookingResponse Booking, string TrackingToken, TrackingResponse? Tracking);

public sealed class GetMyBooking(DbContext db, ICurrentUser currentUser, ListMyBookings bookings, GetTracking tracking) : IUseCase
{
    public async Task<Result<MyBookingDetailResponse>> HandleAsync(Guid id, CancellationToken ct)
    {
        var booking = await MyBookingLookup.FindAsync(db, currentUser, id, ct);
        if (booking.IsFailure)
        {
            return booking.Error!;
        }

        var all = await bookings.HandleAsync(ct);
        var summary = all.IsSuccess ? all.Value.FirstOrDefault(b => b.Id == id) : null;
        if (summary is null)
        {
            return MyBookingLookup.NotFound;
        }

        var token = booking.Value.TrackingToken;
        var view = await tracking.HandleAsync(token, ct);
        return new MyBookingDetailResponse(summary, token, view.IsSuccess ? view.Value : null);
    }
}
