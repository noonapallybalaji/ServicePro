using Microsoft.EntityFrameworkCore;
using ServicePro.Contracts;
using ServicePro.Contracts.Ports;
using ServicePro.Modules.ServiceRequests.Domain;
using ServicePro.SharedKernel.Abstractions;
using ServicePro.SharedKernel.Results;

namespace ServicePro.Modules.ServiceRequests.Application;

/// <summary>
/// Lets Dispatch and Billing drive the job lifecycle without touching its tables (ADR 0001).
/// Changes join the caller's unit of work: nothing here calls SaveChanges.
/// </summary>
internal sealed class ServiceRequestWorkflowPort(DbContext db, ICustomerDirectory customers, ICatalogDirectory catalog, IClock clock)
    : IServiceRequestWorkflow
{
    public async Task<Result<DispatchContext>> GetDispatchContextAsync(Guid serviceRequestId, CancellationToken ct)
    {
        var request = await db.Set<ServiceRequest>().AsNoTracking().FirstOrDefaultAsync(s => s.Id == serviceRequestId, ct);
        if (request is null)
        {
            return ServiceRequestErrors.NotFound;
        }

        var address = await customers.GetAddressAsync(request.AddressId, ct);
        var minSkill = request.IssueTypeId is { } issueTypeId ? (await catalog.GetIssueTypeAsync(issueTypeId, ct))?.MinSkillLevel ?? 1 : 1;

        return new DispatchContext(
            request.Id,
            request.SrNumber,
            request.Status,
            request.CustomerId,
            request.CategoryId,
            minSkill,
            address?.Locality ?? string.Empty,
            address?.Pincode ?? string.Empty,
            address?.Location,
            request.ScheduledStart ?? request.PreferredSlotStart,
            request.Priority);
    }

    public Task<Result> OfferAsync(Guid serviceRequestId, Guid technicianId, Guid assignmentId, Actor actor, CancellationToken ct) =>
        MutateAsync(serviceRequestId, s => s.Offer(technicianId, assignmentId, actor, clock.UtcNow), ct);

    public Task<Result> AcceptOfferAsync(Guid serviceRequestId, Guid technicianId, Actor actor, CancellationToken ct) =>
        MutateAsync(serviceRequestId, s => s.AcceptOffer(technicianId, actor, clock.UtcNow), ct);

    public Task<Result> ReturnToQueueAsync(Guid serviceRequestId, string reasonCode, Actor actor, CancellationToken ct) =>
        MutateAsync(serviceRequestId, s => s.ReturnToQueue(reasonCode, actor, clock.UtcNow), ct);

    public async Task<Result<BillingContext>> GetBillingContextAsync(Guid serviceRequestId, CancellationToken ct)
    {
        var request = await db.Set<ServiceRequest>().AsNoTracking().FirstOrDefaultAsync(s => s.Id == serviceRequestId, ct);
        return request is null
            ? ServiceRequestErrors.NotFound
            : new BillingContext(request.Id, request.SrNumber, request.Status, request.CustomerId, request.CurrentTechnicianId, request.VisitCharge, request.PaymentStatus);
    }

    public Task<Result> ApplyPaymentAsync(Guid serviceRequestId, PaymentStatus paymentStatus, decimal finalAmount, Actor actor, CancellationToken ct) =>
        MutateAsync(serviceRequestId, s => s.ApplyPayment(paymentStatus, finalAmount, actor, clock.UtcNow), ct);

    public async Task<Guid?> FindIdByTrackingTokenAsync(string trackingToken, CancellationToken ct) =>
        await db.Set<ServiceRequest>().AsNoTracking()
            .Where(s => s.TrackingToken == trackingToken)
            .Select(s => (Guid?)s.Id)
            .FirstOrDefaultAsync(ct);

    public async Task<string?> GetTrackingTokenAsync(Guid serviceRequestId, CancellationToken ct) =>
        await db.Set<ServiceRequest>().AsNoTracking()
            .Where(s => s.Id == serviceRequestId)
            .Select(s => s.TrackingToken)
            .FirstOrDefaultAsync(ct);

    private async Task<Result> MutateAsync(Guid serviceRequestId, Func<ServiceRequest, Result> change, CancellationToken ct)
    {
        var request = await db.Set<ServiceRequest>().FirstOrDefaultAsync(s => s.Id == serviceRequestId, ct);
        return request is null ? ServiceRequestErrors.NotFound : change(request);
    }
}
