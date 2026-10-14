using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using ServicePro.BuildingBlocks.Security;
using ServicePro.SharedKernel.Abstractions;

namespace ServicePro.Api.Realtime;

/// <summary>Group names: one per tenant for staff, one per technician.</summary>
public static class RealtimeGroups
{
    public static string Ops(Guid tenantId) => $"tenant:{tenantId}:ops";

    public static string Technician(Guid tenantId, Guid technicianId) => $"tenant:{tenantId}:tech:{technicianId}";
}

/// <summary>Messages pushed to clients. Clients treat them as "refetch" signals, never as data of record.</summary>
public static class RealtimeMessages
{
    public const string ServiceRequestChanged = "serviceRequestChanged";
    public const string TechnicianChanged = "technicianChanged";
    public const string JobChanged = "jobChanged";
    public const string OfferReceived = "offerReceived";
    public const string OfferResolved = "offerResolved";
    public const string SupportChanged = "supportChanged";
}

/// <summary>Live board for the owner/dispatcher (PLAN.md §5.2).</summary>
[Authorize(Policy = AuthPolicies.Staff)]
public sealed class OpsHub(ITenantContext tenant) : Hub
{
    public override async Task OnConnectedAsync()
    {
        await Groups.AddToGroupAsync(Context.ConnectionId, RealtimeGroups.Ops(tenant.TenantId));
        await base.OnConnectedAsync();
    }
}

/// <summary>Offers and job updates for one technician.</summary>
[Authorize(Policy = AuthPolicies.Technician)]
public sealed class TechHub(ITenantContext tenant, ICurrentUser user) : Hub
{
    public override async Task OnConnectedAsync()
    {
        if (user.TechnicianId is { } technicianId)
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, RealtimeGroups.Technician(tenant.TenantId, technicianId));
        }

        await base.OnConnectedAsync();
    }
}
