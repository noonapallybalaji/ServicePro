using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using ServicePro.BuildingBlocks.Messaging;
using ServicePro.BuildingBlocks.Settings;
using ServicePro.Contracts;
using ServicePro.Contracts.Events;
using ServicePro.Modules.Dispatch.Domain;
using ServicePro.SharedKernel.Abstractions;

namespace ServicePro.Modules.Dispatch.Application;

/*
 * Automatic dispatch (PLAN.md §10 AUTO_OFFER). Off by default: the owner turns it on once they
 * trust the recommendations. When a job reaches the queue, it is offered to the best recommended
 * technician; a decline or a timeout moves it to the next one, up to a limit, after which the
 * job waits for staff. Jobs staff took off someone, or reassigned, are left to staff.
 */

public static class AutoDispatchSettings
{
    public static readonly SettingDefinition<bool> AutoOffer = new(
        "dispatch.auto_offer",
        false,
        "Offer each job to the best recommended technician automatically, instead of waiting for staff to pick.");

    public static readonly SettingDefinition<int> MaxAutoOffers = new(
        "dispatch.auto_offer_max_attempts",
        3,
        "How many technicians a job is offered to automatically before it waits for staff.");
}

public sealed partial class AutoOfferWhenReady(
    DbContext db,
    ISettingsStore settings,
    GetCandidates candidates,
    JobOffers offers,
    ILogger<AutoOfferWhenReady> logger) : IEventHandler<ServiceRequestStatusChanged>
{
    public async Task HandleAsync(ServiceRequestStatusChanged e, CancellationToken ct)
    {
        // A technician taken off the job by staff, or a staff reassignment: staff are in charge.
        if (e.To != ServiceRequestStatus.ReadyForAssignment || e.From == ServiceRequestStatus.Accepted || e.ReasonCode == "REASSIGNED")
        {
            return;
        }

        if (!await settings.GetAsync(AutoDispatchSettings.AutoOffer, ct))
        {
            return;
        }

        // The event is handled later than it happened: only act if the job is still waiting.
        if (await db.Set<TechnicianAssignment>().AnyAsync(a => a.ServiceRequestId == e.ServiceRequestId &&
                (a.Status == AssignmentStatus.Offered || a.Status == AssignmentStatus.Accepted), ct))
        {
            return;
        }

        var tried = await db.Set<TechnicianAssignment>().Where(a => a.ServiceRequestId == e.ServiceRequestId).Select(a => a.TechnicianId).ToListAsync(ct);
        var attempts = tried.Count;
        if (attempts >= await settings.GetAsync(AutoDispatchSettings.MaxAutoOffers, ct))
        {
            LogGaveUp(e.SrNumber, attempts);
            return;
        }

        var ranked = await candidates.HandleAsync(e.ServiceRequestId, ct);
        // Never the same technician twice: they declined or let the offer lapse.
        var best = ranked.IsSuccess
            ? ranked.Value.Where(c => c.IsRecommended && !tried.Contains(c.TechnicianId)).OrderBy(c => c.Rank).FirstOrDefault()
            : null;
        if (best is null)
        {
            LogNoCandidate(e.SrNumber);
            return;
        }

        var offered = await offers.OfferAsync(e.ServiceRequestId, best.TechnicianId, null, markAccepted: false, Actor.System, ct);
        if (offered.IsFailure)
        {
            LogOfferFailed(e.SrNumber, offered.Error!.Message);
            return;
        }

        await db.SaveChangesAsync(ct);
    }

    [LoggerMessage(Level = LogLevel.Information, Message = "Auto-dispatch: {SrNumber} was offered {Attempts} times; leaving it for staff")]
    private partial void LogGaveUp(string srNumber, int attempts);

    [LoggerMessage(Level = LogLevel.Information, Message = "Auto-dispatch: no recommended technician for {SrNumber}; leaving it for staff")]
    private partial void LogNoCandidate(string srNumber);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Auto-dispatch: offering {SrNumber} failed: {Reason}")]
    private partial void LogOfferFailed(string srNumber, string reason);
}
