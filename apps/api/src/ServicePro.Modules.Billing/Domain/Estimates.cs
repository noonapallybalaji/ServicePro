using ServicePro.Contracts.Events;
using ServicePro.SharedKernel.Domain;
using ServicePro.SharedKernel.Results;

namespace ServicePro.Modules.Billing.Domain;

public enum EstimateStatus
{
    Sent,
    Approved,
    Rejected,

    /// <summary>Replaced by a newer version before the customer answered.</summary>
    Superseded,
}

public enum EstimateApprovalMethod
{
    /// <summary>The customer tapped Approve on their tracking link.</summary>
    LinkTap,

    /// <summary>Tapped Approve and confirmed with a one-time code sent to their phone.</summary>
    Otp,

    /// <summary>Staff recorded an approval the customer gave by phone (with a note).</summary>
    StaffRecorded,
}

/// <summary>
/// The repair cost the customer agrees to before work starts (PLAN.md §7.9 `estimates`).
/// Each revision is a new version; only the latest sent one can be answered.
/// </summary>
public sealed class Estimate : TenantOwnedAggregateRoot, ServicePro.BuildingBlocks.Persistence.IAudited
{
    private readonly List<EstimateLine> _lines = [];

    private Estimate()
    {
    }

    public Guid ServiceRequestId { get; private set; }

    public int Version { get; private set; }

    public IReadOnlyCollection<EstimateLine> Lines => _lines;

    public decimal Subtotal { get; private set; }

    public decimal TaxRatePercent { get; private set; }

    public decimal TaxAmount { get; private set; }

    public decimal Total { get; private set; }

    public EstimateStatus Status { get; private set; }

    public Guid? SentByUserId { get; private set; }

    public DateTimeOffset SentAt { get; private set; }

    public DateTimeOffset? RespondedAt { get; private set; }

    public EstimateApprovalMethod? ApprovalMethod { get; private set; }

    /// <summary>The customer's reason for declining, or staff's note on a recorded approval.</summary>
    public string? ResponseNote { get; private set; }

    public Guid? RecordedByUserId { get; private set; }

    public static Result<Estimate> Send(Guid serviceRequestId, int version, IReadOnlyList<InvoiceLineInput> lines, decimal taxRatePercent, Guid? sentBy, DateTimeOffset now)
    {
        if (lines.Count == 0)
        {
            return Error.Validation("estimate.empty", "Add at least one line to the estimate.");
        }

        var estimate = new Estimate
        {
            ServiceRequestId = serviceRequestId,
            Version = version,
            TaxRatePercent = taxRatePercent,
            Status = EstimateStatus.Sent,
            SentByUserId = sentBy,
            SentAt = now,
        };
        for (var i = 0; i < lines.Count; i++)
        {
            estimate._lines.Add(new EstimateLine(estimate.Id, i + 1, lines[i]));
        }

        estimate.Subtotal = estimate._lines.Sum(l => l.Amount);
        estimate.TaxAmount = Money.Round(estimate.Subtotal * taxRatePercent / 100m);
        estimate.Total = estimate.Subtotal + estimate.TaxAmount;
        return estimate;
    }

    /// <summary>Announces the estimate to the customer (WhatsApp) once the job is waiting for them.</summary>
    public void Announce(Guid customerId, Guid? technicianId) =>
        Raise(new EstimateSent(Id, ServiceRequestId, customerId, technicianId, Total));

    public void Supersede()
    {
        if (Status == EstimateStatus.Sent)
        {
            Status = EstimateStatus.Superseded;
        }
    }

    public Result Approve(EstimateApprovalMethod method, string? note, Guid? recordedBy, DateTimeOffset now)
    {
        if (Status != EstimateStatus.Sent)
        {
            return EstimateErrors.AlreadyAnswered;
        }

        Status = EstimateStatus.Approved;
        ApprovalMethod = method;
        ResponseNote = Clean(note);
        RecordedByUserId = recordedBy;
        RespondedAt = now;
        Raise(new EstimateAnswered(Id, ServiceRequestId, Approved: true, Total));
        return Result.Success();
    }

    public Result Reject(string? reason, DateTimeOffset now)
    {
        if (Status != EstimateStatus.Sent)
        {
            return EstimateErrors.AlreadyAnswered;
        }

        Status = EstimateStatus.Rejected;
        ResponseNote = Clean(reason);
        RespondedAt = now;
        Raise(new EstimateAnswered(Id, ServiceRequestId, Approved: false, Total));
        return Result.Success();
    }

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}

public sealed class EstimateLine : Entity
{
    private EstimateLine()
    {
    }

    internal EstimateLine(Guid estimateId, int position, InvoiceLineInput input)
    {
        EstimateId = estimateId;
        Position = position;
        Type = input.Type;
        Description = input.Description.Trim();
        Quantity = input.Quantity;
        UnitPrice = input.UnitPrice;
        Amount = Money.Round(input.Quantity * input.UnitPrice);
    }

    public Guid EstimateId { get; private set; }

    public int Position { get; private set; }

    public InvoiceLineType Type { get; private set; }

    public string Description { get; private set; } = string.Empty;

    public decimal Quantity { get; private set; }

    public decimal UnitPrice { get; private set; }

    public decimal Amount { get; private set; }
}

internal static class EstimateErrors
{
    public static readonly Error AlreadyAnswered = Error.Conflict("estimate.already_answered", "This estimate has already been answered or replaced by a newer one.");
}
