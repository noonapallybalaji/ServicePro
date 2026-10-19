using FluentValidation;
using Microsoft.EntityFrameworkCore;
using ServicePro.BuildingBlocks.Application;
using ServicePro.BuildingBlocks.Persistence;
using ServicePro.BuildingBlocks.Security;
using ServicePro.BuildingBlocks.Settings;
using ServicePro.Contracts;
using ServicePro.Contracts.Ports;
using ServicePro.Modules.Billing.Domain;
using ServicePro.SharedKernel;
using ServicePro.SharedKernel.Abstractions;
using ServicePro.SharedKernel.Results;

namespace ServicePro.Modules.Billing.Application;

// ── DTOs ────────────────────────────────────────────────────────────────────

public sealed record InvoiceLineResponse(Guid Id, int Position, InvoiceLineType Type, string Description, decimal Quantity, decimal UnitPrice, decimal Amount);

public sealed record InvoiceResponse(
    Guid Id,
    string InvoiceNumber,
    Guid ServiceRequestId,
    string SrNumber,
    Guid CustomerId,
    Guid? TechnicianId,
    InvoiceStatus Status,
    decimal Subtotal,
    decimal TaxRatePercent,
    decimal TaxAmount,
    decimal Total,
    decimal AmountPaid,
    decimal Outstanding,
    DateTimeOffset IssuedAt,
    IReadOnlyList<InvoiceLineResponse> Lines);

public sealed record PaymentResponse(
    Guid Id,
    Guid InvoiceId,
    Guid ServiceRequestId,
    PaymentMethod Method,
    decimal Amount,
    string? Reference,
    Guid? CollectedByTechnicianId,
    DateTimeOffset ReceivedAt);

internal static class BillingMapping
{
    public static InvoiceResponse ToResponse(this Invoice i) => new(
        i.Id, i.InvoiceNumber, i.ServiceRequestId, i.SrNumber, i.CustomerId, i.TechnicianId, i.Status,
        i.Subtotal, i.TaxRatePercent, i.TaxAmount, i.Total, i.AmountPaid, i.Outstanding, i.IssuedAt,
        [.. i.Lines.OrderBy(l => l.Position).Select(l => new InvoiceLineResponse(l.Id, l.Position, l.Type, l.Description, l.Quantity, l.UnitPrice, l.Amount))]);

    public static PaymentResponse ToResponse(this Payment p) =>
        new(p.Id, p.InvoiceId, p.ServiceRequestId, p.Method, p.Amount, p.Reference, p.CollectedByTechnicianId, p.ReceivedAt);
}

internal static class BillingErrors
{
    public static readonly Error InvoiceNotFound = Error.NotFound("invoice.not_found", "There's no bill for this job yet.");
    public static readonly Error NotAssigned = Error.Forbidden("sr.not_assigned", "This job isn't assigned to you.");
}

/// <summary>Technicians may only bill and collect for their own jobs.</summary>
internal static class BillingAccess
{
    public static Error? Check(ICurrentUser user, BillingContext job) =>
        user.Role == UserRole.Technician && job.TechnicianId != user.TechnicianId ? BillingErrors.NotAssigned : null;
}

// ── Invoice ─────────────────────────────────────────────────────────────────

public sealed record SaveInvoiceRequest(IReadOnlyList<InvoiceLineInput> Lines);

internal sealed class SaveInvoiceRequestValidator : AbstractValidator<SaveInvoiceRequest>
{
    public SaveInvoiceRequestValidator()
    {
        RuleFor(r => r.Lines).NotEmpty().WithMessage("Add at least one line to the bill.");
        RuleForEach(r => r.Lines).ChildRules(line =>
        {
            line.RuleFor(l => l.Description).NotEmpty().MaximumLength(200);
            line.RuleFor(l => l.Quantity).GreaterThan(0).LessThanOrEqualTo(1000);
            line.RuleFor(l => l.UnitPrice).GreaterThanOrEqualTo(0).LessThanOrEqualTo(10_00_000);
        });
    }
}

public sealed class GetInvoiceForServiceRequest(DbContext db, IServiceRequestWorkflow serviceRequests, ICurrentUser currentUser) : IUseCase
{
    public async Task<Result<InvoiceResponse>> HandleAsync(Guid serviceRequestId, CancellationToken ct)
    {
        var job = await serviceRequests.GetBillingContextAsync(serviceRequestId, ct);
        if (job.IsFailure)
        {
            return job.Error!;
        }

        if (BillingAccess.Check(currentUser, job.Value) is { } denied)
        {
            return denied;
        }

        var invoice = await db.Set<Invoice>().Include(i => i.Lines).AsNoTracking()
            .FirstOrDefaultAsync(i => i.ServiceRequestId == serviceRequestId && i.Status != InvoiceStatus.Void, ct);
        return invoice is null ? BillingErrors.InvoiceNotFound : invoice.ToResponse();
    }
}

/// <summary>Creates the job's bill, or replaces its lines while nothing has been paid.</summary>
public sealed class SaveInvoice(
    DbContext db,
    IServiceRequestWorkflow serviceRequests,
    ISettingsStore settings,
    ICurrentUser currentUser,
    IClock clock) : IUseCase
{
    private static readonly HashSet<ServiceRequestStatus> _billableStatuses =
        [ServiceRequestStatus.Diagnosing, ServiceRequestStatus.InProgress, ServiceRequestStatus.Completed, ServiceRequestStatus.UnableToRepair];

    public async Task<Result<InvoiceResponse>> HandleAsync(Guid serviceRequestId, SaveInvoiceRequest request, CancellationToken ct)
    {
        var job = await serviceRequests.GetBillingContextAsync(serviceRequestId, ct);
        if (job.IsFailure)
        {
            return job.Error!;
        }

        if (BillingAccess.Check(currentUser, job.Value) is { } denied)
        {
            return denied;
        }

        if (!_billableStatuses.Contains(job.Value.Status))
        {
            return Error.Conflict("invoice.not_billable", "A bill can be prepared once the technician is diagnosing the job.");
        }

        var taxRate = await settings.GetAsync(BillingSettings.GstRatePercent, ct);
        var invoice = await db.Set<Invoice>().Include(i => i.Lines)
            .FirstOrDefaultAsync(i => i.ServiceRequestId == serviceRequestId && i.Status != InvoiceStatus.Void, ct);

        if (invoice is null)
        {
            var issued = Invoice.Issue(await NextInvoiceNumberAsync(ct), job.Value.ServiceRequestId, job.Value.SrNumber,
                job.Value.CustomerId, job.Value.TechnicianId, request.Lines, taxRate, clock.UtcNow);
            if (issued.IsFailure)
            {
                return issued.Error!;
            }

            invoice = issued.Value;
            db.Set<Invoice>().Add(invoice);
        }
        else
        {
            var replaced = invoice.ReplaceLines(request.Lines, taxRate);
            if (replaced.IsFailure)
            {
                return replaced.Error!;
            }
        }

        await db.SaveChangesAsync(ct);
        return invoice.ToResponse();
    }

    private async Task<string> NextInvoiceNumberAsync(CancellationToken ct)
    {
        var next = await db.Database
            .SqlQueryRaw<long>("SELECT nextval('billing.invoice_number_seq') AS \"Value\"")
            .SingleAsync(ct);
        return $"INV-{clock.UtcNow.Year}-{next:D5}";
    }
}

// ── Payments ────────────────────────────────────────────────────────────────

public sealed record RecordPaymentRequest(PaymentMethod Method, decimal Amount, string? Reference);

internal sealed class RecordPaymentRequestValidator : AbstractValidator<RecordPaymentRequest>
{
    public RecordPaymentRequestValidator()
    {
        RuleFor(r => r.Amount).GreaterThan(0);
        RuleFor(r => r.Reference).MaximumLength(100);
    }
}

/// <summary>
/// Records money received for a completed job. Cash goes on the technician's ledger,
/// the job is closed once fully paid, and commission is earned on full payment.
/// </summary>
public sealed class RecordPayment(
    DbContext db,
    IServiceRequestWorkflow serviceRequests,
    ITechnicianDirectory technicians,
    ICurrentUser currentUser,
    IClock clock) : IUseCase
{
    public async Task<Result<PaymentResponse>> HandleAsync(Guid serviceRequestId, RecordPaymentRequest request, CancellationToken ct)
    {
        var job = await serviceRequests.GetBillingContextAsync(serviceRequestId, ct);
        if (job.IsFailure)
        {
            return job.Error!;
        }

        if (BillingAccess.Check(currentUser, job.Value) is { } denied)
        {
            return denied;
        }

        if (job.Value.Status != ServiceRequestStatus.Completed)
        {
            return Error.Conflict("payment.not_completed", "Payment is collected after the job is completed with the customer's code.");
        }

        var invoice = await db.Set<Invoice>().Include(i => i.Lines)
            .FirstOrDefaultAsync(i => i.ServiceRequestId == serviceRequestId && i.Status != InvoiceStatus.Void, ct);
        if (invoice is null)
        {
            return BillingErrors.InvoiceNotFound;
        }

        var applied = invoice.ApplyPayment(request.Amount);
        if (applied.IsFailure)
        {
            return applied.Error!;
        }

        var now = clock.UtcNow;
        var collectedBy = currentUser.Role == UserRole.Technician ? currentUser.TechnicianId : null;
        var payment = Payment.Record(invoice, request.Method, request.Amount, request.Reference, collectedBy, currentUser.UserId, now);
        db.Set<Payment>().Add(payment);

        if (request.Method == PaymentMethod.Cash && collectedBy is { } technicianId)
        {
            db.Set<TechnicianLedgerEntry>().Add(new TechnicianLedgerEntry(technicianId, LedgerEntryType.CashCollected, request.Amount, serviceRequestId, invoice.InvoiceNumber, currentUser.UserId, now));
        }

        var fullyPaid = invoice.Status == InvoiceStatus.Paid;
        if (fullyPaid && job.Value.TechnicianId is { } jobTechnician && await technicians.GetCommissionTermsAsync(jobTechnician, ct) is { } terms)
        {
            var commission = Commission.Calculate(terms, invoice.Subtotal);
            if (commission > 0)
            {
                db.Set<TechnicianLedgerEntry>().Add(new TechnicianLedgerEntry(jobTechnician, LedgerEntryType.CommissionEarned, commission, serviceRequestId, invoice.InvoiceNumber, null, now));
            }
        }

        var paymentStatus = fullyPaid ? PaymentStatus.Paid : PaymentStatus.Partial;
        var srUpdate = await serviceRequests.ApplyPaymentAsync(serviceRequestId, paymentStatus, invoice.Total, currentUser.ToActor(), ct);
        if (srUpdate.IsFailure)
        {
            return srUpdate.Error!;
        }

        await db.SaveChangesAsync(ct);
        return payment.ToResponse();
    }
}

internal static class Commission
{
    public static decimal Calculate(CommissionTerms terms, decimal subtotal) => terms.Type switch
    {
        "Percent" => Math.Round(subtotal * terms.Value / 100m, 2, MidpointRounding.AwayFromZero),
        "Fixed" => terms.Value,
        _ => 0,
    };
}

public sealed record WaivePaymentRequest(string Reason);

/// <summary>Owner closes a completed job without charging (goodwill, warranty).</summary>
public sealed class WaivePayment(IServiceRequestWorkflow serviceRequests, DbContext db, ICurrentUser currentUser) : IUseCase
{
    public async Task<Result> HandleAsync(Guid serviceRequestId, WaivePaymentRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Reason))
        {
            return Error.Validation("payment.reason_required", "Say why the payment is waived.");
        }

        var result = await serviceRequests.ApplyPaymentAsync(serviceRequestId, PaymentStatus.Waived, 0, currentUser.ToActor(), ct);
        if (result.IsSuccess)
        {
            await db.SaveChangesAsync(ct);
        }

        return result;
    }
}

public sealed record PaymentListItem(PaymentResponse Payment, string InvoiceNumber, string SrNumber);

public sealed class ListPayments(DbContext db, ISettingsStore settings) : IUseCase
{
    public async Task<PagedResult<PaymentListItem>> HandleAsync(DateOnly? from, DateOnly? to, PaymentMethod? method, PageRequest page, CancellationToken ct)
    {
        var zone = await settings.GetTimeZoneAsync(ct);
        var query = db.Set<Payment>().AsNoTracking();
        if (from is { } f)
        {
            var start = BusinessSettings.LocalDay(f, zone).Start;
            query = query.Where(p => p.ReceivedAt >= start);
        }

        if (to is { } t)
        {
            var end = BusinessSettings.LocalDay(t, zone).End;
            query = query.Where(p => p.ReceivedAt < end);
        }

        if (method is { } m)
        {
            query = query.Where(p => p.Method == m);
        }

        var total = await query.CountAsync(ct);
        var items = await query
            .OrderByDescending(p => p.ReceivedAt)
            .Skip(page.Skip).Take(page.SafePageSize)
            .Join(db.Set<Invoice>(), p => p.InvoiceId, i => i.Id, (p, i) => new { Payment = p, i.InvoiceNumber, i.SrNumber })
            .ToListAsync(ct);

        return new PagedResult<PaymentListItem>(
            [.. items.Select(x => new PaymentListItem(x.Payment.ToResponse(), x.InvoiceNumber, x.SrNumber))],
            total, page.SafePage, page.SafePageSize);
    }
}

// ── Technician ledger ───────────────────────────────────────────────────────

public sealed record LedgerEntryResponse(Guid Id, LedgerEntryType Type, decimal Amount, Guid? ServiceRequestId, string? Note, DateTimeOffset OccurredAt);

public sealed record LedgerResponse(Guid TechnicianId, decimal CashInHand, decimal EarningsDue, IReadOnlyList<LedgerEntryResponse> Entries);

public sealed record LedgerEntryRequest(LedgerEntryType Type, decimal Amount, string? Note);

internal sealed class LedgerEntryRequestValidator : AbstractValidator<LedgerEntryRequest>
{
    public LedgerEntryRequestValidator()
    {
        RuleFor(r => r.Type).Must(t => t is LedgerEntryType.CashDeposited or LedgerEntryType.Payout or LedgerEntryType.Adjustment)
            .WithMessage("Only deposits, payouts and adjustments can be entered by hand.");
        RuleFor(r => r.Amount).NotEqual(0);
        RuleFor(r => r.Amount).GreaterThan(0).When(r => r.Type != LedgerEntryType.Adjustment);
        RuleFor(r => r.Note).MaximumLength(200);
    }
}

public sealed class TechnicianLedger(DbContext db, ITechnicianDirectory technicians, ICurrentUser currentUser, IClock clock) : IUseCase
{
    public async Task<LedgerResponse> GetAsync(Guid technicianId, int take, CancellationToken ct)
    {
        var all = await db.Set<TechnicianLedgerEntry>().AsNoTracking()
            .Where(e => e.TechnicianId == technicianId)
            .OrderByDescending(e => e.OccurredAt)
            .ToListAsync(ct);
        var balances = LedgerBalances.From(all);
        return new LedgerResponse(technicianId, balances.CashInHand, balances.EarningsDue,
            [.. all.Take(Math.Clamp(take, 1, 500)).Select(e => new LedgerEntryResponse(e.Id, e.Type, e.Amount, e.ServiceRequestId, e.Note, e.OccurredAt))]);
    }

    public async Task<Result<LedgerResponse>> AddEntryAsync(Guid technicianId, LedgerEntryRequest request, CancellationToken ct)
    {
        if (await technicians.GetAsync(technicianId, ct) is null)
        {
            return Error.NotFound("technician.not_found", "That technician doesn't exist.");
        }

        db.Set<TechnicianLedgerEntry>().Add(new TechnicianLedgerEntry(technicianId, request.Type, request.Amount, null, request.Note, currentUser.UserId, clock.UtcNow));
        await db.SaveChangesAsync(ct);
        return await GetAsync(technicianId, 50, ct);
    }
}

/// <summary>Read port for the tracking page and job detail (ADR 0001).</summary>
internal sealed class BillingDirectory(DbContext db) : IBillingDirectory
{
    public async Task<InvoiceSummary?> GetInvoiceForServiceRequestAsync(Guid serviceRequestId, CancellationToken ct)
    {
        var invoice = await db.Set<Invoice>().Include(i => i.Lines).AsNoTracking()
            .FirstOrDefaultAsync(i => i.ServiceRequestId == serviceRequestId && i.Status != InvoiceStatus.Void, ct);
        return invoice is null
            ? null
            : new InvoiceSummary(invoice.Id, invoice.InvoiceNumber, invoice.Total, invoice.AmountPaid,
                [.. invoice.Lines.OrderBy(l => l.Position).Select(l => new InvoiceLineSummary(EnumText.ToText(l.Type), l.Description, l.Quantity, l.UnitPrice, l.Amount))]);
    }
}
