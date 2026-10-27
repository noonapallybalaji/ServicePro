using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using ServicePro.BuildingBlocks.Security;
using ServicePro.Contracts.Ports;
using ServicePro.SharedKernel.Abstractions;

namespace ServicePro.Api.Realtime;

/// <summary>Group names: one per tenant for staff, one per technician.</summary>
public static class RealtimeGroups
{
    public static string Ops(Guid tenantId) => $"tenant:{tenantId}:ops";

    public static string Technician(Guid tenantId, Guid technicianId) => $"tenant:{tenantId}:tech:{technicianId}";

    /// <summary>Customers watching one job's tracking page (job ids are unique across tenants).</summary>
    public static string Tracking(Guid serviceRequestId) => $"track:{serviceRequestId}";
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
    public const string TrackingChanged = "trackingChanged";
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
public sealed class TechHub(ITenantContext tenant, ICurrentUser user, ITechnicianPresence presence, IHubContext<OpsHub> ops) : Hub
{
    public override async Task OnConnectedAsync()
    {
        if (user.TechnicianId is { } technicianId)
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, RealtimeGroups.Technician(tenant.TenantId, technicianId));
            // Presence for the office: the app is open and reachable.
            await presence.AppConnectedAsync(technicianId, Context.ConnectionAborted);
            await ops.Clients.Group(RealtimeGroups.Ops(tenant.TenantId)).SendAsync(RealtimeMessages.TechnicianChanged, new { technicianId }, Context.ConnectionAborted);
        }

        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        if (user.TechnicianId is { } technicianId)
        {
            await presence.AppDisconnectedAsync(technicianId, CancellationToken.None);
            await ops.Clients.Group(RealtimeGroups.Ops(tenant.TenantId)).SendAsync(RealtimeMessages.TechnicianChanged, new { technicianId }, CancellationToken.None);
        }

        await base.OnDisconnectedAsync(exception);
    }
}

/// <summary>
/// Live updates for a customer's tracking page. Anyone holding the link may listen, exactly as
/// they may open the page; messages only say "refetch", so nothing leaks through the hub itself.
/// </summary>
[AllowAnonymous]
public sealed class TrackingHub(IServiceRequestWorkflow requests) : Hub
{
    /// <summary>Starts updates for the job behind the link; false when the link is unknown or expired.</summary>
    public async Task<bool> Join(string token)
    {
        if (string.IsNullOrWhiteSpace(token) || token.Length > 64 || await requests.FindTrackableIdAsync(token, Context.ConnectionAborted) is not { } id)
        {
            return false;
        }

        await Groups.AddToGroupAsync(Context.ConnectionId, RealtimeGroups.Tracking(id));
        return true;
    }
}

/// <summary>
/// Origins allowed to open live connections from another site: <c>Realtime:AllowedOrigins</c>, comma
/// separated (for example the public site, admin and technician app). Empty means same-origin only.
/// </summary>
public static class RealtimeCors
{
    public const string Policy = "realtime";

    public static string[] Origins(IConfiguration configuration) =>
        (configuration["Realtime:AllowedOrigins"] ?? string.Empty)
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(origin => origin.TrimEnd('/'))
            .ToArray();
}
