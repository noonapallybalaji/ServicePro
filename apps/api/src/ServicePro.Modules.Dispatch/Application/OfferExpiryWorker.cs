using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using ServicePro.BuildingBlocks.Persistence;
using ServicePro.Contracts.Ports;
using ServicePro.Modules.Dispatch.Domain;
using ServicePro.SharedKernel.Abstractions;

namespace ServicePro.Modules.Dispatch.Application;

/// <summary>
/// Returns unanswered offers to the queue when they time out (PLAN.md §4.3, ADR 0006).
/// Each expiry runs in its own scope and transaction; a concurrent accept wins via the
/// row-version check, so an offer is never both accepted and expired.
/// </summary>
public sealed partial class OfferExpiryWorker(IServiceScopeFactory scopeFactory, IClock clock, ILogger<OfferExpiryWorker> logger) : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromSeconds(15);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await ExpireDueOffersAsync(stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                LogSweepFailed(ex);
            }

            await Task.Delay(Interval, stoppingToken);
        }
    }

    public async Task<int> ExpireDueOffersAsync(CancellationToken ct)
    {
        List<(Guid Id, Guid TenantId)> due;
        await using (var scope = scopeFactory.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<DbContext>();
            var now = clock.UtcNow;
            due = (await db.Set<TechnicianAssignment>().IgnoreQueryFilters().AsNoTracking()
                    .Where(a => a.Status == AssignmentStatus.Offered && a.OfferExpiresAt <= now)
                    .OrderBy(a => a.OfferExpiresAt)
                    .Select(a => new { a.Id, a.TenantId })
                    .Take(100)
                    .ToListAsync(ct))
                .Select(a => (a.Id, a.TenantId))
                .ToList();
        }

        var expired = 0;
        foreach (var (id, tenantId) in due)
        {
            try
            {
                if (await ExpireAsync(id, tenantId, ct))
                {
                    expired++;
                }
            }
            catch (DbUpdateConcurrencyException)
            {
                // Accepted or cancelled at the same moment: nothing to do.
            }
        }

        return expired;
    }

    private async Task<bool> ExpireAsync(Guid assignmentId, Guid tenantId, CancellationToken ct)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        scope.ServiceProvider.GetRequiredService<TenantScope>().Use(tenantId);
        var db = scope.ServiceProvider.GetRequiredService<DbContext>();
        var workflow = scope.ServiceProvider.GetRequiredService<IServiceRequestWorkflow>();

        var assignment = await db.Set<TechnicianAssignment>().FirstOrDefaultAsync(a => a.Id == assignmentId, ct);
        if (assignment is null || assignment.Expire(clock.UtcNow).IsFailure)
        {
            return false;
        }

        var returned = await workflow.ReturnToQueueAsync(assignment.ServiceRequestId, "OFFER_EXPIRED", Actor.System, ct);
        if (returned.IsFailure)
        {
            LogReturnFailed(assignment.ServiceRequestId, returned.Error!.Message);
        }

        await db.SaveChangesAsync(ct);
        return true;
    }

    [LoggerMessage(Level = LogLevel.Error, Message = "Offer expiry sweep failed")]
    private partial void LogSweepFailed(Exception ex);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Expired offer for {ServiceRequestId} but couldn't return it to the queue: {Reason}")]
    private partial void LogReturnFailed(Guid serviceRequestId, string reason);
}
