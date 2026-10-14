using System.Text.Json;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using ServicePro.BuildingBlocks.Application;
using ServicePro.BuildingBlocks.Messaging;
using ServicePro.BuildingBlocks.Persistence;
using ServicePro.Contracts;
using ServicePro.Contracts.Events;
using ServicePro.Contracts.Ports;
using ServicePro.Modules.Billing.Domain;
using ServicePro.SharedKernel.Abstractions;
using ServicePro.SharedKernel.Results;

namespace ServicePro.Modules.Billing.Application;

/*
 * Online payment of a completed job's bill, and refunds (PLAN.md §5, §7.9).
 * The customer pays on the gateway's page; only the gateway's word (signed webhook, or our own
 * status check against its API) records the payment — never the browser coming back.
 */

public sealed class BillingSiteOptions
{
    /// <summary>The customer website, for the "back to your booking" link after paying.</summary>
    public string PublicSiteUrl { get; set; } = string.Empty;
}

internal static class OnlinePaymentErrors
{
    public static readonly Error Unavailable = Error.Conflict("payments.unavailable", "Online payment isn't available. Please pay the technician by UPI or cash.");
    public static readonly Error NothingDue = Error.Conflict("payments.nothing_due", "There's nothing left to pay on this bill.");
    public static readonly Error NotReady = Error.Conflict("payments.not_ready", "You can pay once the job is complete and the bill is ready.");
    public static readonly Error LinkNotFound = Error.NotFound("payments.not_found", "We couldn't find this booking.");

    public static Error Gateway(PaymentGatewayException e) =>
        Error.Conflict("payments.gateway_error", $"The payment service didn't respond as expected. Please try again in a minute. ({e.Message})");
}

/// <summary>Creates (or reuses) the payment link for a job's outstanding bill.</summary>
public sealed class PaymentLinks(
    DbContext db,
    IPaymentGateway gateway,
    IServiceRequestWorkflow serviceRequests,
    ICustomerDirectory customers,
    IOptions<BillingSiteOptions> site,
    IClock clock)
{
    /// <summary>How long a link stays payable. Razorpay allows up to six months; a week keeps old links from lingering.</summary>
    public static readonly TimeSpan Lifetime = TimeSpan.FromDays(7);

    public async Task<Result<PaymentLink>> GetOrCreateAsync(Guid serviceRequestId, CancellationToken ct)
    {
        if (!gateway.IsConfigured)
        {
            return OnlinePaymentErrors.Unavailable;
        }

        var job = await serviceRequests.GetBillingContextAsync(serviceRequestId, ct);
        if (job.IsFailure)
        {
            return job.Error!;
        }

        var invoice = await db.Set<Invoice>().AsNoTracking()
            .FirstOrDefaultAsync(i => i.ServiceRequestId == serviceRequestId && i.Status != InvoiceStatus.Void, ct);
        if (invoice is { Outstanding: <= 0 })
        {
            return OnlinePaymentErrors.NothingDue;
        }

        if (invoice is null || job.Value.Status != ServiceRequestStatus.Completed)
        {
            return OnlinePaymentErrors.NotReady;
        }

        var now = clock.UtcNow;
        var open = await db.Set<PaymentLink>()
            .Where(l => l.ServiceRequestId == serviceRequestId && l.Status == PaymentLinkStatus.Created)
            .ToListAsync(ct);
        if (open.FirstOrDefault(l => l.CanReuse(invoice.Outstanding, now)) is { } reusable)
        {
            return reusable;
        }

        // The bill changed (or the link is about to expire): close old links so only one is payable.
        foreach (var stale in open)
        {
            try
            {
                await gateway.CancelLinkAsync(stale.ProviderLinkId, ct);
                stale.MarkClosed(PaymentLinkStatus.Cancelled);
            }
            catch (PaymentGatewayException)
            {
                // Already paid or expired at the gateway: the webhook or a status check will tell us.
            }
        }

        var customer = await customers.GetAsync(job.Value.CustomerId, ct);
        var token = await serviceRequests.GetTrackingTokenAsync(serviceRequestId, ct);
        var expires = now.Add(Lifetime);
        var referenceId = Guid.CreateVersion7().ToString("N");
        GatewayLink created;
        try
        {
            created = await gateway.CreateLinkAsync(new NewGatewayLink(
                referenceId,
                invoice.Outstanding,
                $"Bill {invoice.InvoiceNumber} for {job.Value.SrNumber}",
                customer?.FullName ?? "Customer",
                customer?.Phone.Value ?? string.Empty,
                $"{site.Value.PublicSiteUrl.TrimEnd('/')}/t/{token}?payment=done",
                expires), ct);
        }
        catch (PaymentGatewayException e)
        {
            await db.SaveChangesAsync(ct); // keep the cancellations
            return OnlinePaymentErrors.Gateway(e);
        }

        var link = new PaymentLink(invoice.Id, serviceRequestId, gateway.Provider, created.Id, created.Url, invoice.Outstanding, expires);
        db.Set<PaymentLink>().Add(link);
        return link;
    }
}

/// <summary>
/// Records money the gateway confirmed. Idempotent: the gateway's payment id is unique, so the
/// webhook and a status check can both report the same payment safely.
/// </summary>
public sealed partial class OnlinePaymentPosting(
    DbContext db,
    IServiceRequestWorkflow serviceRequests,
    ITechnicianDirectory technicians,
    IClock clock,
    ILogger<OnlinePaymentPosting> logger)
{
    public async Task PostAsync(PaymentLink link, string providerPaymentId, decimal amount, CancellationToken ct)
    {
        var now = clock.UtcNow;
        link.MarkPaid(now);
        if (await db.Set<Payment>().AnyAsync(p => p.ProviderPaymentId == providerPaymentId, ct) ||
            db.Set<Payment>().Local.Any(p => p.ProviderPaymentId == providerPaymentId))
        {
            return;
        }

        var invoice = await db.Set<Invoice>().FirstAsync(i => i.Id == link.InvoiceId, ct);
        var applied = invoice.Status == InvoiceStatus.Void ? 0 : Math.Min(amount, invoice.Outstanding);
        if (applied > 0)
        {
            invoice.ApplyPayment(applied);
        }

        var payment = Payment.Record(invoice, PaymentMethod.Online, amount, link.ProviderLinkId, null, null, now, providerPaymentId);
        db.Set<Payment>().Add(payment);

        // Paid twice (e.g. cash to the technician, then online): the extra is queued for staff to refund.
        if (amount > applied)
        {
            var excess = Refund.Request(payment, amount - applied, "Paid more than the bill", RefundStatus.NeedsReview, null, now);
            db.Set<Refund>().Add(excess.Value);
            LogOverpayment(link.ServiceRequestId, amount - applied);
        }

        if (applied <= 0)
        {
            return;
        }

        var job = await serviceRequests.GetBillingContextAsync(link.ServiceRequestId, ct);
        var fullyPaid = invoice.Status == InvoiceStatus.Paid;
        if (fullyPaid && job.IsSuccess && job.Value.TechnicianId is { } technicianId &&
            await technicians.GetCommissionTermsAsync(technicianId, ct) is { } terms)
        {
            var commission = Commission.Calculate(terms, invoice.Subtotal);
            if (commission > 0)
            {
                db.Set<TechnicianLedgerEntry>().Add(new TechnicianLedgerEntry(technicianId, LedgerEntryType.CommissionEarned, commission, link.ServiceRequestId, invoice.InvoiceNumber, null, now));
            }
        }

        var update = await serviceRequests.ApplyPaymentAsync(link.ServiceRequestId, fullyPaid ? PaymentStatus.Paid : PaymentStatus.Partial, invoice.Total, Actor.System, ct);
        if (update.IsFailure)
        {
            // The money is real either way; staff see the payment and can fix the job's status.
            LogJobNotUpdated(link.ServiceRequestId, update.Error!.Message);
        }
    }

    /// <summary>Asks the gateway about a job's open links, and records any payment it reports.</summary>
    public async Task CheckLinksAsync(Guid serviceRequestId, IPaymentGateway gateway, CancellationToken ct)
    {
        var open = await db.Set<PaymentLink>()
            .Where(l => l.ServiceRequestId == serviceRequestId && l.Status == PaymentLinkStatus.Created)
            .ToListAsync(ct);
        foreach (var link in open)
        {
            var state = await gateway.GetLinkAsync(link.ProviderLinkId, ct);
            foreach (var paid in state.Payments.Where(p => p.Status == "captured"))
            {
                await PostAsync(link, paid.PaymentId, paid.Amount, ct);
            }

            if (state.Status is "expired")
            {
                link.MarkClosed(PaymentLinkStatus.Expired);
            }
            else if (state.Status is "cancelled")
            {
                link.MarkClosed(PaymentLinkStatus.Cancelled);
            }
        }
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Overpayment of {Amount} on service request {ServiceRequestId}: refund queued for review")]
    private partial void LogOverpayment(Guid serviceRequestId, decimal amount);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Online payment recorded but service request {ServiceRequestId} was not updated: {Reason}")]
    private partial void LogJobNotUpdated(Guid serviceRequestId, string reason);
}

// ── Customer: pay from the tracking page ──────────────────────────────────────

public sealed record PayOnlineResponse(string Url, decimal Amount);

/// <summary>"Pay online" on the tracking page: the tracking token is the customer's proof.</summary>
public sealed class StartOnlinePayment(DbContext db, IServiceRequestWorkflow serviceRequests, PaymentLinks links) : IUseCase
{
    public async Task<Result<PayOnlineResponse>> HandleAsync(string trackingToken, CancellationToken ct)
    {
        if (await serviceRequests.FindIdByTrackingTokenAsync(trackingToken, ct) is not { } serviceRequestId)
        {
            return OnlinePaymentErrors.LinkNotFound;
        }

        var link = await links.GetOrCreateAsync(serviceRequestId, ct);
        if (link.IsFailure)
        {
            return link.Error!;
        }

        await db.SaveChangesAsync(ct);
        return new PayOnlineResponse(link.Value.Url, link.Value.Amount);
    }
}

public sealed record PaymentCheckResponse(bool Paid, decimal AmountDue);

/// <summary>
/// After the customer returns from the payment page: ask the gateway directly, so the page
/// updates even if the webhook is slow or not set up.
/// </summary>
public sealed class CheckOnlinePayment(DbContext db, IServiceRequestWorkflow serviceRequests, IPaymentGateway gateway, OnlinePaymentPosting posting) : IUseCase
{
    public async Task<Result<PaymentCheckResponse>> HandleAsync(string trackingToken, CancellationToken ct)
    {
        if (await serviceRequests.FindIdByTrackingTokenAsync(trackingToken, ct) is not { } serviceRequestId)
        {
            return OnlinePaymentErrors.LinkNotFound;
        }

        if (gateway.IsConfigured)
        {
            try
            {
                await posting.CheckLinksAsync(serviceRequestId, gateway, ct);
                await db.SaveChangesAsync(ct);
            }
            catch (PaymentGatewayException e)
            {
                return OnlinePaymentErrors.Gateway(e);
            }
        }

        var invoice = await db.Set<Invoice>().AsNoTracking()
            .FirstOrDefaultAsync(i => i.ServiceRequestId == serviceRequestId && i.Status != InvoiceStatus.Void, ct);
        return new PaymentCheckResponse(invoice is { Outstanding: 0 }, invoice?.Outstanding ?? 0);
    }
}

// ── Staff / technician: send the link on WhatsApp ────────────────────────────

/// <summary>Creates the payment link and sends it to the customer on WhatsApp.</summary>
public sealed class SendPaymentLink(DbContext db, IServiceRequestWorkflow serviceRequests, PaymentLinks links, ICurrentUser currentUser) : IUseCase
{
    public async Task<Result<PayOnlineResponse>> HandleAsync(Guid serviceRequestId, CancellationToken ct)
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

        var link = await links.GetOrCreateAsync(serviceRequestId, ct);
        if (link.IsFailure)
        {
            return link.Error!;
        }

        link.Value.SendToCustomer();
        await db.SaveChangesAsync(ct);
        return new PayOnlineResponse(link.Value.Url, link.Value.Amount);
    }
}

// ── Gateway webhook ──────────────────────────────────────────────────────────

/// <summary>
/// Razorpay webhook: payment_link.paid records the payment; refund.processed / refund.failed
/// settle refunds. Unsigned or wrongly signed calls are rejected.
/// </summary>
public sealed class HandleRazorpayWebhook(
    DbContext db,
    IOptions<RazorpayOptions> options,
    TenantScope tenant,
    OnlinePaymentPosting posting,
    IClock clock) : IUseCase
{
    public async Task<Result> HandleAsync(string body, string? signature, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(options.Value.WebhookSecret))
        {
            return Error.NotFound("webhook.not_configured", "Not found.");
        }

        if (!RazorpayGateway.IsValidWebhookSignature(body, signature, options.Value.WebhookSecret))
        {
            return Error.Unauthorized("webhook.bad_signature", "Invalid signature.");
        }

        using var json = JsonDocument.Parse(body);
        var root = json.RootElement;
        var payload = root.GetProperty("payload");
        switch (root.GetProperty("event").GetString())
        {
            case "payment_link.paid":
                await PaymentLinkPaidAsync(payload, ct);
                break;
            case "refund.processed":
            case "refund.failed":
                await RefundUpdatedAsync(payload.GetProperty("refund").GetProperty("entity"), ct);
                break;
            default:
                return Result.Success();
        }

        await db.SaveChangesAsync(ct);
        return Result.Success();
    }

    private async Task PaymentLinkPaidAsync(JsonElement payload, CancellationToken ct)
    {
        var linkId = payload.GetProperty("payment_link").GetProperty("entity").GetProperty("id").GetString();
        var payment = payload.GetProperty("payment").GetProperty("entity");
        var link = await db.Set<PaymentLink>().IgnoreQueryFilters().FirstOrDefaultAsync(l => l.ProviderLinkId == linkId, ct);
        if (link is null)
        {
            return; // Not ours (another app on the same Razorpay account).
        }

        // Webhooks carry no tenant: act in the link's.
        tenant.Use(link.TenantId);
        await posting.PostAsync(link, payment.GetProperty("id").GetString()!, RazorpayGateway.FromPaise(payment.GetProperty("amount").GetInt64()), ct);
    }

    private async Task RefundUpdatedAsync(JsonElement entity, CancellationToken ct)
    {
        var refundId = entity.GetProperty("id").GetString();
        var refund = await db.Set<Refund>().IgnoreQueryFilters().FirstOrDefaultAsync(r => r.Reference == refundId, ct);
        if (refund is null)
        {
            return;
        }

        tenant.Use(refund.TenantId);
        if (entity.GetProperty("status").GetString() == "processed")
        {
            refund.MarkProcessed(null, clock.UtcNow);
        }
        else
        {
            var payment = await db.Set<Payment>().FirstAsync(p => p.Id == refund.PaymentId, ct);
            refund.MarkFailed(payment, "The payment gateway couldn't complete the refund.");
        }
    }
}

// ── Refunds (admin) ──────────────────────────────────────────────────────────

public sealed record RefundRequest(decimal Amount, string Reason, string? Reference);

internal sealed class RefundRequestValidator : AbstractValidator<RefundRequest>
{
    public RefundRequestValidator()
    {
        RuleFor(r => r.Amount).GreaterThan(0);
        RuleFor(r => r.Reason).NotEmpty().WithMessage("Say why the money is being returned.").MaximumLength(300);
        RuleFor(r => r.Reference).MaximumLength(100);
    }
}

public sealed record ProcessRefundRequest(string? Reference);

public sealed record RefundResponse(
    Guid Id,
    Guid PaymentId,
    decimal Amount,
    string Reason,
    RefundStatus Status,
    string? Reference,
    string? FailureReason,
    DateTimeOffset RequestedAt,
    DateTimeOffset? ProcessedAt);

internal static class RefundMapping
{
    public static RefundResponse ToResponse(this Refund r) =>
        new(r.Id, r.PaymentId, r.Amount, r.Reason, r.Status, r.Reference, r.FailureReason, r.RequestedAt, r.ProcessedAt);
}

/// <summary>
/// Gives money back. Online payments are refunded through the gateway (to the way the customer
/// paid); cash or UPI paid in person is returned by staff, who record it here.
/// </summary>
public sealed class RefundPayment(DbContext db, IPaymentGateway gateway, ICurrentUser currentUser, IClock clock) : IUseCase
{
    public async Task<Result<RefundResponse>> HandleAsync(Guid serviceRequestId, Guid paymentId, RefundRequest request, CancellationToken ct)
    {
        var payment = await db.Set<Payment>().FirstOrDefaultAsync(p => p.Id == paymentId && p.ServiceRequestId == serviceRequestId, ct);
        if (payment is null)
        {
            return Error.NotFound("payment.not_found", "Payment not found.");
        }

        var refund = Refund.Request(payment, request.Amount, request.Reason, RefundStatus.Pending, currentUser.UserId, clock.UtcNow);
        if (refund.IsFailure)
        {
            return refund.Error!;
        }

        var sent = await RefundExecution.ExecuteAsync(refund.Value, payment, gateway, request.Reference, clock.UtcNow, ct);
        if (sent.IsFailure)
        {
            return sent.Error!;
        }

        db.Set<Refund>().Add(refund.Value);
        await db.SaveChangesAsync(ct);
        return refund.Value.ToResponse();
    }
}

/// <summary>Staff approve a refund the system queued (an overpayment).</summary>
public sealed class ProcessQueuedRefund(DbContext db, IPaymentGateway gateway, IClock clock) : IUseCase
{
    public async Task<Result<RefundResponse>> HandleAsync(Guid serviceRequestId, Guid refundId, ProcessRefundRequest request, CancellationToken ct)
    {
        var refund = await db.Set<Refund>().FirstOrDefaultAsync(r => r.Id == refundId && r.ServiceRequestId == serviceRequestId, ct);
        if (refund is null)
        {
            return Error.NotFound("refund.not_found", "Refund not found.");
        }

        if (refund.Status != RefundStatus.NeedsReview)
        {
            return Error.Conflict("refund.already_started", "This refund has already been started.");
        }

        var payment = await db.Set<Payment>().FirstAsync(p => p.Id == refund.PaymentId, ct);
        var sent = await RefundExecution.ExecuteAsync(refund, payment, gateway, request.Reference, clock.UtcNow, ct);
        if (sent.IsFailure)
        {
            return sent.Error!;
        }

        await db.SaveChangesAsync(ct);
        return refund.ToResponse();
    }
}

internal static class RefundExecution
{
    public static async Task<Result> ExecuteAsync(Refund refund, Payment payment, IPaymentGateway gateway, string? reference, DateTimeOffset now, CancellationToken ct)
    {
        if (payment is not { Method: PaymentMethod.Online, ProviderPaymentId: { } providerPaymentId })
        {
            // Returned in person (cash/UPI): staff confirm it's done.
            refund.MarkProcessed(string.IsNullOrWhiteSpace(reference) ? null : reference.Trim(), now);
            return Result.Success();
        }

        if (!gateway.IsConfigured)
        {
            return OnlinePaymentErrors.Unavailable;
        }

        try
        {
            var result = await gateway.RefundAsync(providerPaymentId, refund.Amount, refund.Id.ToString("N"), ct);
            if (result.Status == "processed")
            {
                refund.MarkProcessed(result.Id, now);
            }
            else
            {
                refund.MarkPending(result.Id);
            }

            return Result.Success();
        }
        catch (PaymentGatewayException e)
        {
            return OnlinePaymentErrors.Gateway(e);
        }
    }
}

// ── Staff view of a job's online payments and refunds ────────────────────────

public sealed record PaymentLinkResponse(Guid Id, string Url, decimal Amount, PaymentLinkStatus Status, DateTimeOffset CreatedAt, DateTimeOffset ExpiresAt, DateTimeOffset? PaidAt);

public sealed record RefundablePaymentResponse(Guid Id, PaymentMethod Method, decimal Amount, decimal Refundable, DateTimeOffset ReceivedAt);

public sealed record PaymentActivityResponse(
    bool OnlinePaymentsAvailable,
    IReadOnlyList<RefundablePaymentResponse> Payments,
    IReadOnlyList<PaymentLinkResponse> Links,
    IReadOnlyList<RefundResponse> Refunds);

public sealed class GetPaymentActivity(DbContext db, IPaymentGateway gateway, IServiceRequestWorkflow serviceRequests, ICurrentUser currentUser) : IUseCase
{
    public async Task<Result<PaymentActivityResponse>> HandleAsync(Guid serviceRequestId, CancellationToken ct)
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

        var payments = await db.Set<Payment>().AsNoTracking().Where(p => p.ServiceRequestId == serviceRequestId).OrderBy(p => p.ReceivedAt).ToListAsync(ct);
        var links = await db.Set<PaymentLink>().AsNoTracking().Where(l => l.ServiceRequestId == serviceRequestId).OrderByDescending(l => l.CreatedAt).ToListAsync(ct);
        var refunds = await db.Set<Refund>().AsNoTracking().Where(r => r.ServiceRequestId == serviceRequestId).OrderByDescending(r => r.RequestedAt).ToListAsync(ct);
        return new PaymentActivityResponse(
            gateway.IsConfigured,
            [.. payments.Select(p => new RefundablePaymentResponse(p.Id, p.Method, p.Amount, p.Refundable, p.ReceivedAt))],
            [.. links.Select(l => new PaymentLinkResponse(l.Id, l.Url, l.Amount, l.Status, l.CreatedAt, l.ExpiresAt, l.PaidAt))],
            [.. refunds.Select(r => r.ToResponse())]);
    }
}

// ── Keep links in step with the bill ─────────────────────────────────────────

/// <summary>Once a bill is settled another way (cash, UPI to the technician), its open links are cancelled.</summary>
public sealed class CloseLinksWhenSettled(DbContext db, IPaymentGateway gateway) : IEventHandler<PaymentRecorded>
{
    public async Task HandleAsync(PaymentRecorded e, CancellationToken ct)
    {
        var invoice = await db.Set<Invoice>().AsNoTracking()
            .FirstOrDefaultAsync(i => i.ServiceRequestId == e.ServiceRequestId && i.Status != InvoiceStatus.Void, ct);
        if (invoice is not { Outstanding: 0 } || !gateway.IsConfigured)
        {
            return;
        }

        var open = await db.Set<PaymentLink>().Where(l => l.ServiceRequestId == e.ServiceRequestId && l.Status == PaymentLinkStatus.Created).ToListAsync(ct);
        foreach (var link in open)
        {
            try
            {
                await gateway.CancelLinkAsync(link.ProviderLinkId, ct);
                link.MarkClosed(PaymentLinkStatus.Cancelled);
            }
            catch (PaymentGatewayException)
            {
                // Paid meanwhile: the webhook records it, and the extra is queued for refund.
            }
        }

        await db.SaveChangesAsync(ct);
    }
}

/// <summary>Adds "can pay online" to the invoice summary the tracking page shows.</summary>
internal sealed class OnlinePaymentsBillingDirectory(BillingDirectory inner, IPaymentGateway gateway) : IBillingDirectory
{
    public async Task<InvoiceSummary?> GetInvoiceForServiceRequestAsync(Guid serviceRequestId, CancellationToken ct) =>
        await inner.GetInvoiceForServiceRequestAsync(serviceRequestId, ct) is { } summary
            ? summary with { CanPayOnline = gateway.IsConfigured && summary.Total > summary.AmountPaid }
            : null;
}
