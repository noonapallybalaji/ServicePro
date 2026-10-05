using Microsoft.EntityFrameworkCore;
using ServicePro.BuildingBlocks.Messaging;
using ServicePro.Contracts;
using ServicePro.Contracts.Events;
using ServicePro.Modules.Dispatch.Domain;
using ServicePro.SharedKernel.Abstractions;

namespace ServicePro.Modules.Dispatch.Application;

/// <summary>Closes the open assignment when its job finishes or is cancelled.</summary>
public sealed class CloseAssignmentOnJobEnd(DbContext db, IClock clock) : IEventHandler<ServiceRequestStatusChanged>
{
    public async Task HandleAsync(ServiceRequestStatusChanged domainEvent, CancellationToken ct)
    {
        if (domainEvent.To is not (ServiceRequestStatus.Completed or ServiceRequestStatus.UnableToRepair or ServiceRequestStatus.Cancelled))
        {
            return;
        }

        var open = await db.Set<TechnicianAssignment>()
            .Where(a => a.ServiceRequestId == domainEvent.ServiceRequestId && (a.Status == AssignmentStatus.Offered || a.Status == AssignmentStatus.Accepted))
            .ToListAsync(ct);

        foreach (var assignment in open)
        {
            if (domainEvent.To == ServiceRequestStatus.Cancelled)
            {
                assignment.Cancel("JOB_CANCELLED", clock.UtcNow);
            }
            else
            {
                assignment.MarkCompleted();
            }
        }
    }
}
