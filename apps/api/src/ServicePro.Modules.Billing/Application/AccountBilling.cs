using Microsoft.EntityFrameworkCore;
using ServicePro.BuildingBlocks.Application;
using ServicePro.Modules.Billing.Domain;
using ServicePro.SharedKernel.Abstractions;
using ServicePro.SharedKernel.Results;

namespace ServicePro.Modules.Billing.Application;

/// <summary>A bill in the customer's own account ("My bills").</summary>
public sealed record MyInvoiceResponse(
    Guid Id,
    string InvoiceNumber,
    Guid ServiceRequestId,
    string SrNumber,
    decimal Total,
    decimal AmountPaid,
    InvoiceStatus Status,
    DateTimeOffset IssuedAt);

internal static class MyInvoices
{
    public static readonly Error NotSignedIn = Error.Unauthorized("account.not_signed_in", "Please sign in to see your bills.");
    public static readonly Error NotFound = Error.NotFound("invoice.not_found", "We couldn't find this bill in your account.");
}

/// <summary>The signed-in customer's bills, newest first. Scoped by the customer id in their token.</summary>
public sealed class ListMyInvoices(DbContext db, ICurrentUser currentUser) : IUseCase
{
    public async Task<Result<IReadOnlyList<MyInvoiceResponse>>> HandleAsync(CancellationToken ct)
    {
        if (currentUser.CustomerId is not { } customerId)
        {
            return MyInvoices.NotSignedIn;
        }

        var invoices = await db.Set<Invoice>().AsNoTracking()
            .Where(i => i.CustomerId == customerId && i.Status != InvoiceStatus.Void)
            .OrderByDescending(i => i.IssuedAt)
            .Take(100)
            .Select(i => new MyInvoiceResponse(i.Id, i.InvoiceNumber, i.ServiceRequestId, i.SrNumber, i.Total, i.AmountPaid, i.Status, i.IssuedAt))
            .ToListAsync(ct);
        return invoices;
    }
}

/// <summary>Download one of the signed-in customer's bills as a PDF.</summary>
public sealed class DownloadMyInvoice(DbContext db, ICurrentUser currentUser, RenderInvoicePdf pdf) : IUseCase
{
    public async Task<Result<(byte[] Pdf, string FileName)>> HandleAsync(Guid invoiceId, CancellationToken ct)
    {
        if (currentUser.CustomerId is not { } customerId)
        {
            return MyInvoices.NotSignedIn;
        }

        var serviceRequestId = await db.Set<Invoice>().AsNoTracking()
            .Where(i => i.Id == invoiceId && i.CustomerId == customerId && i.Status != InvoiceStatus.Void)
            .Select(i => (Guid?)i.ServiceRequestId)
            .FirstOrDefaultAsync(ct);
        return serviceRequestId is { } id ? await pdf.ForServiceRequestAsync(id, ct) : MyInvoices.NotFound;
    }
}
