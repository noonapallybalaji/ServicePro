using ServicePro.Contracts.Events;
using ServicePro.SharedKernel.Domain;
using ServicePro.SharedKernel.Results;

namespace ServicePro.Modules.Billing.Domain;

public enum PaymentLinkStatus
{
    Created,
    Paid,
    Cancelled,
    Expired,
}

/// <summary>
/// A gateway payment page for one bill (Razorpay Payment Link). The gateway, not the customer's
/// browser, tells us when it's paid (webhook or a status check).
/// </summary>
public sealed class PaymentLink : TenantOwnedAggregateRoot
{
    private PaymentLink()
    {
    }

    public PaymentLink(Guid invoiceId, Guid serviceRequestId, string provider, string providerLinkId, string url, decimal amount, DateTimeOffset expiresAt)
    {
        InvoiceId = invoiceId;
        ServiceRequestId = serviceRequestId;
        Provider = provider;
        ProviderLinkId = providerLinkId;
        Url = url;
        Amount = amount;
        ExpiresAt = expiresAt;
        Status = PaymentLinkStatus.Created;
    }

    public Guid InvoiceId { get; private set; }

    public Guid ServiceRequestId { get; private set; }

    public string Provider { get; private set; } = string.Empty;

    public string ProviderLinkId { get; private set; } = string.Empty;

    public string Url { get; private set; } = string.Empty;

    public decimal Amount { get; private set; }

    public PaymentLinkStatus Status { get; private set; }

    public DateTimeOffset ExpiresAt { get; private set; }

    public DateTimeOffset? PaidAt { get; private set; }

    /// <summary>Usable for this amount: still open, and not about to expire.</summary>
    public bool CanReuse(decimal amount, DateTimeOffset now) =>
        Status == PaymentLinkStatus.Created && Amount == amount && ExpiresAt > now.AddMinutes(30);

    /// <summary>Sends the link to the customer on WhatsApp (via the outbox).</summary>
    public void SendToCustomer() => Raise(new PaymentLinkSent(ServiceRequestId, Amount, Url));

    public void MarkPaid(DateTimeOffset at)
    {
        Status = PaymentLinkStatus.Paid;
        PaidAt ??= at;
    }

    public void MarkClosed(PaymentLinkStatus status)
    {
        if (Status == PaymentLinkStatus.Created)
        {
            Status = status;
        }
    }
}

public enum RefundStatus
{
    /// <summary>Money arrived beyond the bill (e.g. paid online after paying cash): waiting for staff to refund it.</summary>
    NeedsReview,
    Pending,
    Processed,
    Failed,
}

/// <summary>Money returned to a customer, against one payment.</summary>
public sealed class Refund : TenantOwnedAggregateRoot
{
    private Refund()
    {
    }

    public Guid PaymentId { get; private set; }

    public Guid InvoiceId { get; private set; }

    public Guid ServiceRequestId { get; private set; }

    public decimal Amount { get; private set; }

    public string Reason { get; private set; } = string.Empty;

    public RefundStatus Status { get; private set; }

    /// <summary>Gateway refund id ("rfnd_…"), or the reference staff entered for a cash/UPI refund.</summary>
    public string? Reference { get; private set; }

    public string? FailureReason { get; private set; }

    public Guid? RequestedByUserId { get; private set; }

    public DateTimeOffset RequestedAt { get; private set; }

    public DateTimeOffset? ProcessedAt { get; private set; }

    /// <summary>Starts a refund; the payment's refundable balance is reserved straight away.</summary>
    public static Result<Refund> Request(Payment payment, decimal amount, string reason, RefundStatus status, Guid? requestedBy, DateTimeOffset now)
    {
        var reserved = payment.Reserve(amount);
        if (reserved.IsFailure)
        {
            return reserved.Error!;
        }

        return new Refund
        {
            PaymentId = payment.Id,
            InvoiceId = payment.InvoiceId,
            ServiceRequestId = payment.ServiceRequestId,
            Amount = amount,
            Reason = reason.Trim(),
            Status = status,
            RequestedByUserId = requestedBy,
            RequestedAt = now,
        };
    }

    public void MarkPending(string providerRefundId)
    {
        Status = RefundStatus.Pending;
        Reference = providerRefundId;
    }

    public void MarkProcessed(string? reference, DateTimeOffset at)
    {
        if (Status == RefundStatus.Processed)
        {
            return;
        }

        Status = RefundStatus.Processed;
        Reference = reference ?? Reference;
        ProcessedAt = at;
        Raise(new RefundProcessed(Id, ServiceRequestId, Amount));
    }

    public void MarkFailed(Payment payment, string reason)
    {
        if (Status is RefundStatus.Failed or RefundStatus.Processed)
        {
            return;
        }

        Status = RefundStatus.Failed;
        FailureReason = reason.Length > 500 ? reason[..500] : reason;
        payment.Release(Amount);
    }
}
