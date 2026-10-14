using Microsoft.EntityFrameworkCore;
using ServicePro.BuildingBlocks.Messaging;
using ServicePro.Contracts;
using ServicePro.Contracts.Events;
using ServicePro.Modules.Technicians.Domain;

namespace ServicePro.Modules.Technicians.Application;

/// <summary>
/// Keeps duty status truthful without the technician tapping anything: travelling or working
/// means "on a job"; finishing or pausing a job means "available" again.
/// </summary>
public sealed class DutyStatusAutomation(DbContext db) : IEventHandler<ServiceRequestStatusChanged>
{
    private static readonly HashSet<ServiceRequestStatus> Working =
    [
        ServiceRequestStatus.EnRoute,
        ServiceRequestStatus.Arrived,
        ServiceRequestStatus.Diagnosing,
        ServiceRequestStatus.InProgress,
    ];

    private static readonly HashSet<ServiceRequestStatus> Released =
    [
        ServiceRequestStatus.Completed,
        ServiceRequestStatus.UnableToRepair,
        ServiceRequestStatus.CustomerUnavailable,
        ServiceRequestStatus.WaitingForParts,
        ServiceRequestStatus.Rescheduled,
        ServiceRequestStatus.Cancelled,
    ];

    public async Task HandleAsync(ServiceRequestStatusChanged domainEvent, CancellationToken ct)
    {
        if (domainEvent.TechnicianId is not { } technicianId)
        {
            return;
        }

        var technician = await db.Set<Technician>().FirstOrDefaultAsync(t => t.Id == technicianId, ct);
        if (technician is null)
        {
            return;
        }

        if (Working.Contains(domainEvent.To) && technician.DutyStatus == TechnicianDutyStatus.Available)
        {
            technician.ChangeDutyStatus(TechnicianDutyStatus.OnJob);
        }
        else if (Released.Contains(domainEvent.To) && technician.DutyStatus == TechnicianDutyStatus.OnJob)
        {
            technician.ChangeDutyStatus(TechnicianDutyStatus.Available);
        }
    }
}

/// <summary>Maintains the cached "jobs completed" KPI shown to customers and used in matching.</summary>
public sealed class CompletedJobsCounter(DbContext db) : IEventHandler<ServiceRequestStatusChanged>
{
    public async Task HandleAsync(ServiceRequestStatusChanged domainEvent, CancellationToken ct)
    {
        if (domainEvent.To != ServiceRequestStatus.Completed || domainEvent.TechnicianId is not { } technicianId)
        {
            return;
        }

        var technician = await db.Set<Technician>().FirstOrDefaultAsync(t => t.Id == technicianId, ct);
        technician?.RecordJobClosed();
    }
}

/// <summary>Customer ratings feed the technician's average (shown to customers, used by dispatch).</summary>
public sealed class TechnicianRatingUpdater(DbContext db) : IEventHandler<ReviewSubmitted>
{
    public async Task HandleAsync(ReviewSubmitted domainEvent, CancellationToken ct)
    {
        if (domainEvent.TechnicianId is not { } technicianId)
        {
            return;
        }

        var technician = await db.Set<Technician>().FirstOrDefaultAsync(t => t.Id == technicianId, ct);
        technician?.AddRating(domainEvent.Rating);
    }
}
