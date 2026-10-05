using Microsoft.AspNetCore.SignalR;
using ServicePro.BuildingBlocks.Messaging;
using ServicePro.Contracts;
using ServicePro.Contracts.Events;
using ServicePro.SharedKernel.Abstractions;

namespace ServicePro.Api.Realtime;

/*
 * Outbox → SignalR (PLAN.md §5.3). Delivery is at-least-once, which is fine: every message
 * only tells clients to refetch. The tenant comes from the outbox envelope (ITenantContext).
 */

public sealed class PushServiceRequestCreated(IHubContext<OpsHub> ops, ITenantContext tenant) : IEventHandler<ServiceRequestCreated>
{
    public Task HandleAsync(ServiceRequestCreated e, CancellationToken ct) =>
        ops.Clients.Group(RealtimeGroups.Ops(tenant.TenantId))
            .SendAsync(RealtimeMessages.ServiceRequestChanged, new { e.ServiceRequestId, e.SrNumber, status = ServiceRequestStatus.ReadyForAssignment }, ct);
}

public sealed class PushStatusChange(IHubContext<OpsHub> ops, IHubContext<TechHub> tech, ITenantContext tenant) : IEventHandler<ServiceRequestStatusChanged>
{
    public async Task HandleAsync(ServiceRequestStatusChanged e, CancellationToken ct)
    {
        var payload = new { e.ServiceRequestId, e.SrNumber, status = e.To, from = e.From };
        await ops.Clients.Group(RealtimeGroups.Ops(tenant.TenantId)).SendAsync(RealtimeMessages.ServiceRequestChanged, payload, ct);

        if (e.TechnicianId is { } technicianId)
        {
            await tech.Clients.Group(RealtimeGroups.Technician(tenant.TenantId, technicianId)).SendAsync(RealtimeMessages.JobChanged, payload, ct);
        }
    }
}

public sealed class PushOffer(IHubContext<OpsHub> ops, IHubContext<TechHub> tech, ITenantContext tenant) : IEventHandler<JobOffered>
{
    public async Task HandleAsync(JobOffered e, CancellationToken ct)
    {
        await tech.Clients.Group(RealtimeGroups.Technician(tenant.TenantId, e.TechnicianId))
            .SendAsync(RealtimeMessages.OfferReceived, new { e.AssignmentId, e.ServiceRequestId, e.ExpiresAt }, ct);
        await ops.Clients.Group(RealtimeGroups.Ops(tenant.TenantId))
            .SendAsync(RealtimeMessages.ServiceRequestChanged, new { e.ServiceRequestId }, ct);
    }
}

public sealed class PushOfferResolved(IHubContext<OpsHub> ops, IHubContext<TechHub> tech, ITenantContext tenant) : IEventHandler<JobOfferResolved>
{
    public async Task HandleAsync(JobOfferResolved e, CancellationToken ct)
    {
        await tech.Clients.Group(RealtimeGroups.Technician(tenant.TenantId, e.TechnicianId))
            .SendAsync(RealtimeMessages.OfferResolved, new { e.AssignmentId, e.ServiceRequestId, e.Outcome }, ct);
        await ops.Clients.Group(RealtimeGroups.Ops(tenant.TenantId))
            .SendAsync(RealtimeMessages.ServiceRequestChanged, new { e.ServiceRequestId }, ct);
    }
}

public sealed class PushTechnicianDuty(IHubContext<OpsHub> ops, ITenantContext tenant) : IEventHandler<TechnicianDutyChanged>
{
    public Task HandleAsync(TechnicianDutyChanged e, CancellationToken ct) =>
        ops.Clients.Group(RealtimeGroups.Ops(tenant.TenantId))
            .SendAsync(RealtimeMessages.TechnicianChanged, new { e.TechnicianId, e.DutyStatus }, ct);
}

public sealed class PushPayment(IHubContext<OpsHub> ops, ITenantContext tenant) : IEventHandler<PaymentRecorded>
{
    public Task HandleAsync(PaymentRecorded e, CancellationToken ct) =>
        ops.Clients.Group(RealtimeGroups.Ops(tenant.TenantId))
            .SendAsync(RealtimeMessages.ServiceRequestChanged, new { e.ServiceRequestId }, ct);
}
