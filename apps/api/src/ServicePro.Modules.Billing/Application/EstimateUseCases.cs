using FluentValidation;
using Microsoft.EntityFrameworkCore;
using ServicePro.BuildingBlocks.Application;
using ServicePro.BuildingBlocks.Security;
using ServicePro.BuildingBlocks.Settings;
using ServicePro.Contracts;
using ServicePro.Contracts.Ports;
using ServicePro.Modules.Billing.Domain;
using ServicePro.SharedKernel.Abstractions;
using ServicePro.SharedKernel.Results;

namespace ServicePro.Modules.Billing.Application;

/*
 * Repair estimates (PLAN.md §4.4, §7.9). The technician sends what the repair will cost; the
 * customer approves or declines on their tracking link, confirming with a one-time code to their
 * phone. Approval starts the repair; declining means only the visiting charge applies.
 */

public static class EstimateSettings
{
    public static readonly SettingDefinition<decimal> CodeRequiredAbove = new(
        "estimates.code_required_above",
        0m,
        "Customers confirm estimates above this amount (₹) with a one-time code sent to their phone. 0 = always.");
}

public sealed record EstimateLineResponse(InvoiceLineType Type, string Description, decimal Quantity, decimal UnitPrice, decimal Amount);

public sealed record EstimateResponse(
    Guid Id,
    int Version,
    EstimateStatus Status,
    IReadOnlyList<EstimateLineResponse> Lines,
    decimal Subtotal,
    decimal TaxRatePercent,
    decimal TaxAmount,
    decimal Total,
    DateTimeOffset SentAt,
    DateTimeOffset? RespondedAt,
    EstimateApprovalMethod? ApprovalMethod,
    string? ResponseNote);

internal static class EstimateMapping
{
    public static EstimateResponse ToResponse(this Estimate e) => new(
        e.Id,
        e.Version,
        e.Status,
        [.. e.Lines.OrderBy(l => l.Position).Select(l => new EstimateLineResponse(l.Type, l.Description, l.Quantity, l.UnitPrice, l.Amount))],
        e.Subtotal,
        e.TaxRatePercent,
        e.TaxAmount,
        e.Total,
        e.SentAt,
        e.RespondedAt,
        e.ApprovalMethod,
        e.ResponseNote);
}

// ── Technician (or staff): send ──────────────────────────────────────────────

public sealed record SendEstimateRequest(IReadOnlyList<InvoiceLineInput> Lines);

internal sealed class SendEstimateRequestValidator : AbstractValidator<SendEstimateRequest>
{
    public SendEstimateRequestValidator()
    {
        RuleFor(r => r.Lines).NotEmpty().WithMessage("Add at least one line to the estimate.");
        RuleForEach(r => r.Lines).ChildRules(line =>
        {
            line.RuleFor(l => l.Description).NotEmpty().WithMessage("Describe each line.").MaximumLength(200);
            line.RuleFor(l => l.Quantity).GreaterThan(0).LessThanOrEqualTo(1000);
            line.RuleFor(l => l.UnitPrice).GreaterThanOrEqualTo(0).LessThanOrEqualTo(1_000_000);
        });
    }
}

/// <summary>Sends (or revises) the estimate and puts the job on hold until the customer answers.</summary>
public sealed class SendEstimate(
    DbContext db,
    IServiceRequestWorkflow serviceRequests,
    ISettingsStore settings,
    ICurrentUser currentUser,
    IClock clock) : IUseCase
{
    public async Task<Result<EstimateResponse>> HandleAsync(Guid serviceRequestId, SendEstimateRequest request, CancellationToken ct)
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

        if (job.Value.Status is not (ServiceRequestStatus.Diagnosing or ServiceRequestStatus.InProgress or ServiceRequestStatus.AwaitingEstimateApproval))
        {
            return Error.Conflict("estimate.not_now", "Estimates are sent after checking the appliance, before or during the repair.");
        }

        var previous = await db.Set<Estimate>().Where(e => e.ServiceRequestId == serviceRequestId).ToListAsync(ct);
        previous.ForEach(e => e.Supersede());

        var gst = await settings.GetAsync(BillingSettings.GstRatePercent, ct);
        var estimate = Estimate.Send(serviceRequestId, previous.Count + 1, request.Lines, gst, currentUser.UserId, clock.UtcNow);
        if (estimate.IsFailure)
        {
            return estimate.Error!;
        }

        var waiting = await serviceRequests.AwaitEstimateApprovalAsync(serviceRequestId, currentUser.ToActor(), currentUser.TechnicianId, ct);
        if (waiting.IsFailure)
        {
            return waiting.Error!;
        }

        estimate.Value.Announce(job.Value.CustomerId, job.Value.TechnicianId);
        db.Set<Estimate>().Add(estimate.Value);
        await db.SaveChangesAsync(ct);
        return estimate.Value.ToResponse();
    }
}

public sealed class ListEstimates(DbContext db, IServiceRequestWorkflow serviceRequests, ICurrentUser currentUser) : IUseCase
{
    public async Task<Result<IReadOnlyList<EstimateResponse>>> HandleAsync(Guid serviceRequestId, CancellationToken ct)
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

        var estimates = await db.Set<Estimate>().AsNoTracking().Include(e => e.Lines)
            .Where(e => e.ServiceRequestId == serviceRequestId)
            .OrderByDescending(e => e.Version)
            .ToListAsync(ct);
        return estimates.Select(e => e.ToResponse()).ToList();
    }
}

// ── Customer: review and answer on the tracking link ─────────────────────────

/// <summary>The estimate on the tracking page, and whether approving needs a code.</summary>
public sealed record CustomerEstimateResponse(EstimateResponse Estimate, bool CodeRequired);

internal sealed class EstimateAccess(DbContext db, IServiceRequestWorkflow serviceRequests)
{
    public static readonly Error NotFound = Error.NotFound("estimate.not_found", "There's no estimate waiting for you.");

    /// <summary>The latest estimate for the job behind this tracking token.</summary>
    public async Task<(Estimate? Estimate, BillingContext? Job)> LatestAsync(string trackingToken, CancellationToken ct)
    {
        if (await serviceRequests.FindIdByTrackingTokenAsync(trackingToken, ct) is not { } serviceRequestId)
        {
            return (null, null);
        }

        var job = await serviceRequests.GetBillingContextAsync(serviceRequestId, ct);
        var estimate = await db.Set<Estimate>().Include(e => e.Lines)
            .Where(e => e.ServiceRequestId == serviceRequestId && e.Status != EstimateStatus.Superseded)
            .OrderByDescending(e => e.Version)
            .FirstOrDefaultAsync(ct);
        return (estimate, job.IsSuccess ? job.Value : null);
    }
}

public sealed class GetCustomerEstimate(DbContext db, IServiceRequestWorkflow serviceRequests, ISettingsStore settings) : IUseCase
{
    public async Task<Result<CustomerEstimateResponse>> HandleAsync(string trackingToken, CancellationToken ct)
    {
        var (estimate, _) = await new EstimateAccess(db, serviceRequests).LatestAsync(trackingToken, ct);
        if (estimate is null)
        {
            return EstimateAccess.NotFound;
        }

        var codeAbove = await settings.GetAsync(EstimateSettings.CodeRequiredAbove, ct);
        return new CustomerEstimateResponse(estimate.ToResponse(), estimate.Total > codeAbove || codeAbove == 0);
    }
}

public sealed record EstimateCodeResponse(DateTimeOffset ExpiresAt, int CodeLength, string? DevelopmentCode);

/// <summary>Texts the customer a code to confirm their approval (to the phone on the booking, never one typed in).</summary>
public sealed class RequestEstimateCode(DbContext db, IServiceRequestWorkflow serviceRequests, ICustomerDirectory customers, IPhoneVerification verification) : IUseCase
{
    public async Task<Result<EstimateCodeResponse>> HandleAsync(string trackingToken, CancellationToken ct)
    {
        var (estimate, job) = await new EstimateAccess(db, serviceRequests).LatestAsync(trackingToken, ct);
        if (estimate is not { Status: EstimateStatus.Sent } || job is null)
        {
            return EstimateAccess.NotFound;
        }

        var customer = await customers.GetAsync(job.CustomerId, ct);
        if (customer is null)
        {
            return EstimateAccess.NotFound;
        }

        var issued = await verification.IssueAsync(customer.Phone, OtpPurpose.EstimateApproval, ct);
        if (issued.IsFailure)
        {
            return issued.Error!;
        }

        await db.SaveChangesAsync(ct);
        return new EstimateCodeResponse(issued.Value.ExpiresAt, issued.Value.CodeLength, issued.Value.DevelopmentCode);
    }
}

public sealed record AnswerEstimateRequest(bool Approve, string? Code, string? Reason);

internal sealed class AnswerEstimateRequestValidator : AbstractValidator<AnswerEstimateRequest>
{
    public AnswerEstimateRequestValidator()
    {
        RuleFor(r => r.Code).Matches("^[0-9]{4,8}$").WithMessage("Enter the numeric code we sent you.").When(r => !string.IsNullOrEmpty(r.Code));
        RuleFor(r => r.Reason).MaximumLength(300);
    }
}

/// <summary>The customer approves (with the code, when required) or declines the estimate.</summary>
public sealed class AnswerEstimate(
    DbContext db,
    IServiceRequestWorkflow serviceRequests,
    ICustomerDirectory customers,
    IPhoneVerification verification,
    ISettingsStore settings,
    IClock clock) : IUseCase
{
    public async Task<Result<EstimateResponse>> HandleAsync(string trackingToken, Guid estimateId, AnswerEstimateRequest request, CancellationToken ct)
    {
        var (estimate, job) = await new EstimateAccess(db, serviceRequests).LatestAsync(trackingToken, ct);
        if (estimate is null || job is null || estimate.Id != estimateId)
        {
            return EstimateAccess.NotFound;
        }

        if (estimate.Status != EstimateStatus.Sent)
        {
            return EstimateErrors.AlreadyAnswered;
        }

        var now = clock.UtcNow;
        Result answered;
        if (request.Approve)
        {
            var codeAbove = await settings.GetAsync(EstimateSettings.CodeRequiredAbove, ct);
            var method = EstimateApprovalMethod.LinkTap;
            if (codeAbove == 0 || estimate.Total > codeAbove)
            {
                if (string.IsNullOrEmpty(request.Code))
                {
                    return Error.Validation("estimate.code_required", "Enter the code we sent to your phone to approve.");
                }

                var customer = await customers.GetAsync(job.CustomerId, ct);
                var verified = customer is null
                    ? Error.Validation("otp.invalid", "That code isn't right.")
                    : await verification.VerifyAsync(customer.Phone, OtpPurpose.EstimateApproval, request.Code, ct);
                if (verified.IsFailure)
                {
                    await db.SaveChangesAsync(ct); // count the attempt
                    return verified.Error!;
                }

                method = EstimateApprovalMethod.Otp;
            }

            answered = estimate.Approve(method, null, null, now);
        }
        else
        {
            answered = estimate.Reject(request.Reason, now);
        }

        if (answered.IsFailure)
        {
            return answered.Error!;
        }

        var resolved = await serviceRequests.ResolveEstimateAsync(job.ServiceRequestId, request.Approve, Actor.Customer, ct);
        if (resolved.IsFailure)
        {
            return resolved.Error!;
        }

        await db.SaveChangesAsync(ct);
        return estimate.ToResponse();
    }
}

// ── Staff: the customer approved by phone ─────────────────────────────────────

public sealed record RecordEstimateApprovalRequest(string Note);

internal sealed class RecordEstimateApprovalRequestValidator : AbstractValidator<RecordEstimateApprovalRequest>
{
    public RecordEstimateApprovalRequestValidator() =>
        RuleFor(r => r.Note).NotEmpty().WithMessage("Say how the customer approved (e.g. who called whom, and when).").MaximumLength(300);
}

/// <summary>Staff record an approval the customer gave by phone. Technicians can't: the approval must not come from the person doing the work.</summary>
public sealed class RecordEstimateApproval(DbContext db, IServiceRequestWorkflow serviceRequests, ICurrentUser currentUser, IClock clock) : IUseCase
{
    public async Task<Result<EstimateResponse>> HandleAsync(Guid serviceRequestId, Guid estimateId, RecordEstimateApprovalRequest request, CancellationToken ct)
    {
        var estimate = await db.Set<Estimate>().Include(e => e.Lines).FirstOrDefaultAsync(e => e.Id == estimateId && e.ServiceRequestId == serviceRequestId, ct);
        if (estimate is null)
        {
            return Error.NotFound("estimate.not_found", "Estimate not found.");
        }

        var approved = estimate.Approve(EstimateApprovalMethod.StaffRecorded, request.Note, currentUser.UserId, clock.UtcNow);
        if (approved.IsFailure)
        {
            return approved.Error!;
        }

        var resolved = await serviceRequests.ResolveEstimateAsync(serviceRequestId, true, currentUser.ToActor(), ct);
        if (resolved.IsFailure)
        {
            return resolved.Error!;
        }

        await db.SaveChangesAsync(ct);
        return estimate.ToResponse();
    }
}
