using ServicePro.BuildingBlocks.Persistence;
using ServicePro.Contracts.Events;
using ServicePro.SharedKernel.Domain;
using ServicePro.SharedKernel.Results;

namespace ServicePro.Modules.Billing.Domain;

public enum InvoiceLineType
{
    Visit,
    Labour,
    Part,
    Other,
}

public enum InvoiceStatus
{
    Issued,
    PartiallyPaid,
    Paid,
    Void,
}

public enum PaymentMethod
{
    Cash,
    UpiQr,
    UpiLink,
    Card,
    BankTransfer,

    /// <summary>Paid through the payment gateway (UPI, card, net banking): confirmed by the gateway, not by a person.</summary>
    Online,
}

public sealed record InvoiceLineInput(InvoiceLineType Type, string Description, decimal Quantity, decimal UnitPrice);

internal static class Money
{
    public static decimal Round(decimal value) => Math.Round(value, 2, MidpointRounding.AwayFromZero);
}

/// <summary>The bill for one job (PLAN.md §7.9 `invoices`). Lines can change until money is received.</summary>
public sealed class Invoice : TenantOwnedAggregateRoot, IAudited
{
    private readonly List<InvoiceLine> _lines = [];

    private Invoice()
    {
    }

    public string InvoiceNumber { get; private set; } = string.Empty;

    public Guid ServiceRequestId { get; private set; }

    public string SrNumber { get; private set; } = string.Empty;

    public Guid CustomerId { get; private set; }

    public Guid? TechnicianId { get; private set; }

    public decimal Subtotal { get; private set; }

    public decimal TaxRatePercent { get; private set; }

    public decimal TaxAmount { get; private set; }

    public decimal Total { get; private set; }

    public decimal AmountPaid { get; private set; }

    public InvoiceStatus Status { get; private set; }

    public DateTimeOffset IssuedAt { get; private set; }

    public uint Version { get; private set; }

    public IReadOnlyCollection<InvoiceLine> Lines => _lines;

    public decimal Outstanding => Math.Max(0, Total - AmountPaid);

    public static Result<Invoice> Issue(
        string invoiceNumber,
        Guid serviceRequestId,
        string srNumber,
        Guid customerId,
        Guid? technicianId,
        IReadOnlyList<InvoiceLineInput> lines,
        decimal taxRatePercent,
        DateTimeOffset now)
    {
        var invoice = new Invoice
        {
            InvoiceNumber = invoiceNumber,
            ServiceRequestId = serviceRequestId,
            SrNumber = srNumber,
            CustomerId = customerId,
            TechnicianId = technicianId,
            Status = InvoiceStatus.Issued,
            IssuedAt = now,
        };

        var replaced = invoice.ReplaceLines(lines, taxRatePercent);
        return replaced.IsSuccess ? invoice : replaced.Error!;
    }

    public Result ReplaceLines(IReadOnlyList<InvoiceLineInput> lines, decimal taxRatePercent)
    {
        if (AmountPaid > 0 || Status == InvoiceStatus.Void)
        {
            return Error.Conflict("invoice.locked", "This bill already has a payment and can't be changed.");
        }

        if (lines.Count == 0)
        {
            return Error.Validation("invoice.empty", "Add at least one line to the bill.");
        }

        _lines.Clear();
        _lines.AddRange(lines.Select((l, i) => new InvoiceLine(Id, i + 1, l.Type, l.Description, l.Quantity, l.UnitPrice)));
        TaxRatePercent = taxRatePercent;
        Subtotal = Money.Round(_lines.Sum(l => l.Amount));
        TaxAmount = Money.Round(Subtotal * taxRatePercent / 100m);
        Total = Subtotal + TaxAmount;
        return Result.Success();
    }

    public Result ApplyPayment(decimal amount)
    {
        if (Status == InvoiceStatus.Void)
        {
            return Error.Conflict("invoice.void", "This bill was cancelled.");
        }

        if (amount <= 0 || amount > Outstanding)
        {
            return Error.Validation("payment.amount_invalid", $"Enter an amount between ₹1 and ₹{Outstanding:0.##}.");
        }

        AmountPaid += amount;
        Status = Outstanding == 0 ? InvoiceStatus.Paid : InvoiceStatus.PartiallyPaid;
        return Result.Success();
    }

    public Result Void()
    {
        if (AmountPaid > 0)
        {
            return Error.Conflict("invoice.has_payments", "A bill with payments can't be cancelled.");
        }

        Status = InvoiceStatus.Void;
        return Result.Success();
    }
}

public sealed class InvoiceLine : Entity
{
    private InvoiceLine()
    {
    }

    internal InvoiceLine(Guid invoiceId, int position, InvoiceLineType type, string description, decimal quantity, decimal unitPrice)
    {
        InvoiceId = invoiceId;
        Position = position;
        Type = type;
        Description = description.Trim();
        Quantity = quantity;
        UnitPrice = unitPrice;
        Amount = Money.Round(quantity * unitPrice);
    }

    public Guid InvoiceId { get; private set; }

    public int Position { get; private set; }

    public InvoiceLineType Type { get; private set; }

    public string Description { get; private set; } = string.Empty;

    public decimal Quantity { get; private set; }

    public decimal UnitPrice { get; private set; }

    public decimal Amount { get; private set; }
}

/// <summary>Money received (PLAN.md §7.9 `payments`). Phase 1 records cash/UPI manually.</summary>
public sealed class Payment : TenantOwnedAggregateRoot, IAudited
{
    private Payment()
    {
    }

    public Guid InvoiceId { get; private set; }

    public Guid ServiceRequestId { get; private set; }

    public PaymentMethod Method { get; private set; }

    public decimal Amount { get; private set; }

    public string? Reference { get; private set; }

    public Guid? CollectedByTechnicianId { get; private set; }

    public Guid? RecordedByUserId { get; private set; }

    public DateTimeOffset ReceivedAt { get; private set; }

    /// <summary>The gateway's payment id (e.g. Razorpay "pay_…"); unique, so a payment is never recorded twice.</summary>
    public string? ProviderPaymentId { get; private set; }

    /// <summary>Total refunded from this payment so far (requested refunds that haven't failed).</summary>
    public decimal AmountRefunded { get; private set; }

    public decimal Refundable => Amount - AmountRefunded;

    internal Result Reserve(decimal amount)
    {
        if (amount <= 0 || amount > Refundable)
        {
            return Error.Validation("refund.amount_invalid", $"Enter an amount between ₹1 and ₹{Refundable:0.##}.");
        }

        AmountRefunded += amount;
        return Result.Success();
    }

    /// <summary>A refund failed at the gateway: the money is refundable again.</summary>
    internal void Release(decimal amount) => AmountRefunded = Math.Max(0, AmountRefunded - amount);

    public static Payment Record(
        Invoice invoice,
        PaymentMethod method,
        decimal amount,
        string? reference,
        Guid? technicianId,
        Guid? recordedBy,
        DateTimeOffset now,
        string? providerPaymentId = null)
    {
        var payment = new Payment
        {
            InvoiceId = invoice.Id,
            ServiceRequestId = invoice.ServiceRequestId,
            Method = method,
            Amount = amount,
            Reference = string.IsNullOrWhiteSpace(reference) ? null : reference.Trim(),
            CollectedByTechnicianId = technicianId,
            RecordedByUserId = recordedBy,
            ReceivedAt = now,
            ProviderPaymentId = providerPaymentId,
        };
        payment.Raise(new PaymentRecorded(payment.Id, payment.ServiceRequestId, amount, method.ToString(), technicianId));
        return payment;
    }
}

public enum LedgerEntryType
{
    /// <summary>Technician received cash from a customer: they now hold the business's money.</summary>
    CashCollected,

    /// <summary>Technician handed cash to the office.</summary>
    CashDeposited,

    CommissionEarned,
    Payout,
    Adjustment,
}

/// <summary>
/// Append-only technician money log (PLAN.md §7.9 `technician_ledger`). Two running balances:
/// cash in hand (owed to the business) and earnings due (owed to the technician).
/// </summary>
public sealed class TechnicianLedgerEntry : TenantOwnedEntity
{
    private TechnicianLedgerEntry()
    {
    }

    public TechnicianLedgerEntry(Guid technicianId, LedgerEntryType type, decimal amount, Guid? serviceRequestId, string? note, Guid? recordedBy, DateTimeOffset at)
    {
        TechnicianId = technicianId;
        Type = type;
        Amount = amount;
        ServiceRequestId = serviceRequestId;
        Note = note;
        RecordedByUserId = recordedBy;
        OccurredAt = at;
    }

    public Guid TechnicianId { get; private set; }

    public LedgerEntryType Type { get; private set; }

    /// <summary>Always positive; the type gives the direction. Adjustments may be negative.</summary>
    public decimal Amount { get; private set; }

    public Guid? ServiceRequestId { get; private set; }

    public string? Note { get; private set; }

    public Guid? RecordedByUserId { get; private set; }

    public DateTimeOffset OccurredAt { get; private set; }
}

public sealed record LedgerBalances(decimal CashInHand, decimal EarningsDue)
{
    public static LedgerBalances From(IEnumerable<TechnicianLedgerEntry> entries)
    {
        decimal cash = 0, earnings = 0;
        foreach (var e in entries)
        {
            switch (e.Type)
            {
                case LedgerEntryType.CashCollected:
                    cash += e.Amount;
                    break;
                case LedgerEntryType.CashDeposited:
                    cash -= e.Amount;
                    break;
                case LedgerEntryType.CommissionEarned:
                    earnings += e.Amount;
                    break;
                case LedgerEntryType.Payout:
                    earnings -= e.Amount;
                    break;
                case LedgerEntryType.Adjustment:
                    earnings += e.Amount;
                    break;
            }
        }

        return new LedgerBalances(cash, earnings);
    }
}
