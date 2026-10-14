using Microsoft.EntityFrameworkCore;
using ServicePro.BuildingBlocks.Application;
using ServicePro.BuildingBlocks.Persistence;
using ServicePro.Contracts.Ports;
using ServicePro.Modules.Customers.Domain;
using ServicePro.SharedKernel.Abstractions;
using ServicePro.SharedKernel.Results;

namespace ServicePro.Modules.Customers.Application;

/*
 * Right to erasure (DPDP Act 2023). The customer row stays so past jobs and invoices still add
 * up (tax law requires keeping invoices), but everything that identifies the person is removed:
 * name, phone, email, notes, street address, pin location, serial numbers, sessions, pending
 * sign-in codes, audit history of the record, and the text of messages sent to them.
 */

/// <summary>Shared by the customer's own "Delete my account" and staff acting on a request.</summary>
public sealed class CustomerEraser(
    DbContext db,
    IServiceRequestWorkflow serviceRequests,
    ICustomerSessions sessions,
    IMessageHistory messages,
    IClock clock)
{
    public async Task<Result> EraseAsync(Guid customerId, CancellationToken ct)
    {
        var customer = await db.Set<Customer>()
            .Include(c => c.Addresses)
            .Include(c => c.Appliances)
            .FirstOrDefaultAsync(c => c.Id == customerId, ct);
        if (customer is null)
        {
            return Error.NotFound("customer.not_found", "Customer not found.");
        }

        if (customer.ErasedAt is null && await serviceRequests.HasOpenRequestsAsync(customerId, ct))
        {
            return Error.Conflict(
                "account.open_bookings",
                "You have a booking that isn't finished yet. Once it's completed or cancelled, you can delete your account.");
        }

        if (customer.ErasedAt is null)
        {
            await sessions.ForgetCustomerAsync(customerId, customer.PrimaryPhone, ct);
            await messages.ForgetRecipientAsync(customer.PrimaryPhone, ct);
            customer.Erase(clock.UtcNow);
        }

        // Saving writes an audit entry holding the old values, so redaction runs after it, atomically.
        var entityId = customerId.ToString();
        var strategy = db.Database.CreateExecutionStrategy();
        await strategy.ExecuteAsync(async () =>
        {
            await using var transaction = await db.Database.BeginTransactionAsync(ct);
            await db.SaveChangesAsync(ct);
            await db.Set<AuditLog>()
                .Where(a => a.EntityType == nameof(Customer) && a.EntityId == entityId)
                .ExecuteUpdateAsync(set => set.SetProperty(a => a.Changes, "{\"redacted\":true}"), ct);
            await transaction.CommitAsync(ct);
        });

        return Result.Success();
    }
}

/// <summary>"Delete my account" on the customer site.</summary>
public sealed class DeleteMyAccount(CustomerEraser eraser, ICurrentUser currentUser) : IUseCase
{
    public Task<Result> HandleAsync(CancellationToken ct) =>
        currentUser.CustomerId is { } customerId ? eraser.EraseAsync(customerId, ct) : Task.FromResult(Result.Failure(AccountErrors.NotSignedIn));
}

/// <summary>Staff erasing a customer who asked by phone or email.</summary>
public sealed class EraseCustomer(CustomerEraser eraser) : IUseCase
{
    public Task<Result> HandleAsync(Guid customerId, CancellationToken ct) => eraser.EraseAsync(customerId, ct);
}
