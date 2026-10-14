using Microsoft.EntityFrameworkCore;
using ServicePro.BuildingBlocks.Messaging;
using ServicePro.Contracts.Events;
using ServicePro.Modules.Support.Domain;

namespace ServicePro.Modules.Support.Application;

/// <summary>Account deletion: the customer's support conversations lose their text.</summary>
public sealed class RedactErasedCustomerTickets(DbContext db) : IEventHandler<CustomerErased>
{
    public async Task HandleAsync(CustomerErased e, CancellationToken ct)
    {
        var tickets = await db.Set<SupportTicket>().Include(t => t.Messages).Where(t => t.CustomerId == e.CustomerId).ToListAsync(ct);
        tickets.ForEach(t => t.Redact());
        await db.SaveChangesAsync(ct);
    }
}
