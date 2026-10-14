using ServicePro.BuildingBlocks.Security;
using ServicePro.Contracts;
using ServicePro.Contracts.Events;
using ServicePro.SharedKernel.Abstractions;
using ServicePro.SharedKernel.Domain;
using ServicePro.SharedKernel.Results;
using ServicePro.SharedKernel.ValueObjects;

namespace ServicePro.Modules.ServiceRequests.Domain;

/// <summary>Everything that may accompany a status change.</summary>
public sealed record TransitionInput(
    string? ReasonCode = null,
    string? Note = null,
    string? CompletionCode = null,
    GeoLocation? Location = null,
    Guid? TechnicianId = null,
    bool HasAfterPhoto = false,
    bool CategoryRequiresPhotos = false);

/// <summary>Details captured when the request is created (PLAN.md §7.7).</summary>
public sealed record NewServiceRequest(
    string SrNumber,
    Guid CustomerId,
    Guid AddressId,
    Guid? ApplianceId,
    Guid CategoryId,
    Guid? IssueTypeId,
    string ProblemDescription,
    RequestChannel Channel,
    Priority Priority,
    decimal VisitCharge,
    DateTimeOffset? PreferredSlotStart,
    DateTimeOffset? PreferredSlotEnd,
    DateTimeOffset? ScheduledStart,
    DateTimeOffset? ScheduledEnd,
    bool IsWarrantyVisit,
    Guid? ParentServiceRequestId,
    bool AwaitsReview = false,
    string? ExternalReference = null);

/// <summary>
/// The job: from request to closure (PLAN.md §7.7, §8). Every status change goes through
/// <see cref="ServiceRequestWorkflow"/>, is written to history and raises an event.
/// </summary>
public sealed class ServiceRequest : TenantOwnedAggregateRoot
{
    public const int CompletionCodeDigits = 4;
    public const int CompletionCodeMaxAttempts = 5;

    private readonly List<StatusHistoryEntry> _history = [];
    private readonly List<ServiceRequestNote> _notes = [];
    private readonly List<ServiceRequestAttachment> _attachments = [];

    private ServiceRequest()
    {
    }

    public string SrNumber { get; private set; } = string.Empty;

    public Guid CustomerId { get; private set; }

    public Guid AddressId { get; private set; }

    public Guid? ApplianceId { get; private set; }

    public Guid CategoryId { get; private set; }

    public Guid? IssueTypeId { get; private set; }

    public string ProblemDescription { get; private set; } = string.Empty;

    public RequestChannel Channel { get; private set; }

    public Priority Priority { get; private set; }

    public ServiceRequestStatus Status { get; private set; }

    public string? StatusReason { get; private set; }

    public DateTimeOffset? PreferredSlotStart { get; private set; }

    public DateTimeOffset? PreferredSlotEnd { get; private set; }

    public DateTimeOffset? ScheduledStart { get; private set; }

    public DateTimeOffset? ScheduledEnd { get; private set; }

    public Guid? CurrentTechnicianId { get; private set; }

    public Guid? CurrentAssignmentId { get; private set; }

    public bool IsWarrantyVisit { get; private set; }

    public Guid? ParentServiceRequestId { get; private set; }

    public decimal VisitCharge { get; private set; }

    public decimal? FinalAmount { get; private set; }

    public PaymentStatus PaymentStatus { get; private set; }

    public string? CompletionCodeHash { get; private set; }

    public int CompletionCodeAttempts { get; private set; }

    /// <summary>Capability token in the customer's tracking link (/t/{token}).</summary>
    public string TrackingToken { get; private set; } = string.Empty;

    /// <summary>
    /// The caller's idempotency key for integration bookings (e.g. the WhatsApp message id of the
    /// customer's confirmation). Unique per channel, so a retried request finds the first booking.
    /// </summary>
    public string? ExternalReference { get; private set; }

    public DateTimeOffset LastStatusChangeAt { get; private set; }

    /// <summary>When we asked the customer to rate the visit (once per job).</summary>
    public DateTimeOffset? FeedbackRequestedAt { get; private set; }

    /// <summary>How many times the customer moved the visit themselves (capped by a setting).</summary>
    public int CustomerRescheduleCount { get; private set; }

    public DateTimeOffset? AcceptedAt { get; private set; }

    public DateTimeOffset? EnRouteAt { get; private set; }

    public DateTimeOffset? ArrivedAt { get; private set; }

    public DateTimeOffset? CompletedAt { get; private set; }

    public DateTimeOffset? ClosedAt { get; private set; }

    public DateTimeOffset? CancelledAt { get; private set; }

    /// <summary>Optimistic concurrency (PostgreSQL xmin): two people can't move the same job at once.</summary>
    public uint Version { get; private set; }

    public IReadOnlyCollection<StatusHistoryEntry> History => _history;

    public IReadOnlyCollection<ServiceRequestNote> Notes => _notes;

    public IReadOnlyCollection<ServiceRequestAttachment> Attachments => _attachments;

    public bool IsTerminal => ServiceRequestWorkflow.Terminal.Contains(Status);

    /// <summary>
    /// Staff-entered requests are verified at creation (PLAN.md §4: owner logs the call),
    /// so they start ready for assignment.
    /// </summary>
    public static ServiceRequest Create(NewServiceRequest details, Actor actor, DateTimeOffset now)
    {
        var request = new ServiceRequest
        {
            SrNumber = details.SrNumber,
            CustomerId = details.CustomerId,
            AddressId = details.AddressId,
            ApplianceId = details.ApplianceId,
            CategoryId = details.CategoryId,
            IssueTypeId = details.IssueTypeId,
            ProblemDescription = details.ProblemDescription.Trim(),
            Channel = details.Channel,
            Priority = details.Priority,
            VisitCharge = details.VisitCharge,
            PreferredSlotStart = Utc(details.PreferredSlotStart),
            PreferredSlotEnd = Utc(details.PreferredSlotEnd),
            ScheduledStart = Utc(details.ScheduledStart),
            ScheduledEnd = Utc(details.ScheduledEnd),
            IsWarrantyVisit = details.IsWarrantyVisit,
            ParentServiceRequestId = details.ParentServiceRequestId,
            PaymentStatus = details.IsWarrantyVisit ? PaymentStatus.Waived : PaymentStatus.NotDue,
            Status = ServiceRequestStatus.New,
            TrackingToken = SecureTokens.Generate(18),
            ExternalReference = string.IsNullOrWhiteSpace(details.ExternalReference) ? null : details.ExternalReference.Trim(),
            LastStatusChangeAt = now,
        };

        request.Raise(new ServiceRequestCreated(request.Id, request.SrNumber, request.CustomerId, details.AwaitsReview));

        // Self-service bookings stay NEW until staff check them; staff-created jobs are ready at once.
        if (!details.AwaitsReview)
        {
            request.ApplyTransition(ServiceRequestStatus.ReadyForAssignment, actor, new TransitionInput(ReasonCode: "CREATED"), now);
        }

        return request;
    }

    /// <summary>PostgreSQL stores instants in UTC; clients may send any offset (e.g. +05:30).</summary>
    private static DateTimeOffset? Utc(DateTimeOffset? value) => value?.ToUniversalTime();

    public void UpdateDetails(
        Guid? applianceId,
        Guid? issueTypeId,
        string problemDescription,
        Priority priority,
        DateTimeOffset? preferredSlotStart,
        DateTimeOffset? preferredSlotEnd,
        DateTimeOffset? scheduledStart,
        DateTimeOffset? scheduledEnd)
    {
        ApplianceId = applianceId;
        IssueTypeId = issueTypeId;
        ProblemDescription = problemDescription.Trim();
        Priority = priority;
        PreferredSlotStart = Utc(preferredSlotStart);
        PreferredSlotEnd = Utc(preferredSlotEnd);
        ScheduledStart = Utc(scheduledStart);
        ScheduledEnd = Utc(scheduledEnd);
    }

    /// <summary>A manual (non-dispatch) transition by staff or the assigned technician.</summary>
    public Result Transition(ServiceRequestStatus to, Actor actor, TransitionInput input, DateTimeOffset now)
    {
        var rule = ServiceRequestWorkflow.Find(Status, to);
        if (rule is { DispatchOnly: true })
        {
            return Error.Conflict("sr.use_dispatch", "Use dispatch to assign, offer or unassign technicians.");
        }

        if (rule is { EstimateOnly: true })
        {
            return Error.Conflict("sr.use_estimate", "Send an estimate for the customer to approve.");
        }

        // A technician may only move jobs assigned to them. Dispatch-owned transitions
        // (accept/decline an offer) verify the technician themselves.
        if (actor.Type == ActorType.Technician && (CurrentTechnicianId is null || input.TechnicianId != CurrentTechnicianId))
        {
            return Error.Forbidden("sr.not_assigned", "This job isn't assigned to you.");
        }

        return Apply(rule, to, actor, input, now);
    }

    // ── Dispatch-owned transitions (called through IServiceRequestWorkflow) ──

    public Result Offer(Guid technicianId, Guid assignmentId, Actor actor, DateTimeOffset now)
    {
        var result = Apply(ServiceRequestWorkflow.Find(Status, ServiceRequestStatus.Offered), ServiceRequestStatus.Offered, actor,
            new TransitionInput(ReasonCode: "OFFERED"), now, technicianId);
        if (result.IsSuccess)
        {
            CurrentAssignmentId = assignmentId;
        }

        return result;
    }

    public Result AcceptOffer(Guid technicianId, Actor actor, DateTimeOffset now)
    {
        if (CurrentTechnicianId != technicianId)
        {
            return Error.Conflict("sr.offer_not_yours", "This job was offered to someone else.");
        }

        return Apply(ServiceRequestWorkflow.Find(Status, ServiceRequestStatus.Accepted), ServiceRequestStatus.Accepted, actor,
            new TransitionInput(ReasonCode: "ACCEPTED"), now);
    }

    public Result ReturnToQueue(string reasonCode, Actor actor, DateTimeOffset now)
    {
        // Only the technician holding the offer may decline it; the office and the system may always return a job.
        if (actor.Type == ActorType.Technician && Status != ServiceRequestStatus.Offered)
        {
            return Error.Forbidden("sr.not_assigned", "Only an open offer can be declined.");
        }

        var result = Apply(ServiceRequestWorkflow.Find(Status, ServiceRequestStatus.ReadyForAssignment), ServiceRequestStatus.ReadyForAssignment,
            actor, new TransitionInput(ReasonCode: reasonCode), now);
        if (result.IsSuccess)
        {
            CurrentTechnicianId = null;
            CurrentAssignmentId = null;
        }

        return result;
    }

    // ── Estimates (called through IServiceRequestWorkflow by Billing) ──

    /// <summary>An estimate was sent: wait for the customer. Sending a revision while waiting changes nothing here.</summary>
    public Result AwaitEstimateApproval(Actor actor, Guid? technicianId, DateTimeOffset now)
    {
        if (Status == ServiceRequestStatus.AwaitingEstimateApproval)
        {
            return Result.Success();
        }

        if (actor.Type == ActorType.Technician && technicianId != CurrentTechnicianId)
        {
            return Error.Forbidden("sr.not_assigned", "This job isn't assigned to you.");
        }

        return Apply(ServiceRequestWorkflow.Find(Status, ServiceRequestStatus.AwaitingEstimateApproval), ServiceRequestStatus.AwaitingEstimateApproval,
            actor, new TransitionInput(ReasonCode: "ESTIMATE_SENT", TechnicianId: technicianId), now);
    }

    /// <summary>Approved: the repair goes ahead. Declined: only the visiting charge applies.</summary>
    public Result ResolveEstimate(bool approved, Actor actor, DateTimeOffset now) =>
        approved
            ? Apply(ServiceRequestWorkflow.Find(Status, ServiceRequestStatus.InProgress), ServiceRequestStatus.InProgress, actor,
                new TransitionInput(ReasonCode: "ESTIMATE_APPROVED"), now)
            : Apply(ServiceRequestWorkflow.Find(Status, ServiceRequestStatus.UnableToRepair), ServiceRequestStatus.UnableToRepair, actor,
                new TransitionInput(ReasonCode: "ESTIMATE_DECLINED"), now);

    public void RequestFeedback(DateTimeOffset now)
    {
        if (FeedbackRequestedAt is not null)
        {
            return;
        }

        FeedbackRequestedAt = now;
        Raise(new FeedbackRequested(Id, SrNumber, CustomerId, CurrentTechnicianId));
    }

    // ── Customer self-service ──

    public bool CustomerCanChange => ServiceRequestWorkflow.CustomerChangeable.Contains(Status);

    public Result CancelByCustomer(string? reason, DateTimeOffset now)
    {
        if (!CustomerCanChange)
        {
            return CustomerChangeErrors.TooLate;
        }

        return Apply(ServiceRequestWorkflow.Find(Status, ServiceRequestStatus.Cancelled), ServiceRequestStatus.Cancelled, Actor.Customer,
            new TransitionInput(ReasonCode: "CUSTOMER_CANCELLED", Note: string.IsNullOrWhiteSpace(reason) ? null : reason.Trim()), now);
    }

    /// <summary>
    /// Moves the visit window. Before a technician accepts, only the time changes. Once one has
    /// accepted, the job goes to RESCHEDULED so the office confirms the new time with them.
    /// </summary>
    public Result RescheduleByCustomer(DateTimeOffset slotStart, DateTimeOffset slotEnd, int maxReschedules, DateTimeOffset now)
    {
        if (!CustomerCanChange)
        {
            return CustomerChangeErrors.TooLate;
        }

        if (CustomerRescheduleCount >= maxReschedules)
        {
            return Error.Conflict("booking.reschedule_limit", "This booking has been moved as many times as we can do online. Please call us to change it.");
        }

        if (Status == ServiceRequestStatus.Accepted)
        {
            var moved = Apply(ServiceRequestWorkflow.Find(Status, ServiceRequestStatus.Rescheduled), ServiceRequestStatus.Rescheduled, Actor.Customer,
                new TransitionInput(ReasonCode: "CUSTOMER_RESCHEDULED"), now);
            if (moved.IsFailure)
            {
                return moved;
            }
        }

        PreferredSlotStart = Utc(slotStart);
        PreferredSlotEnd = Utc(slotEnd);
        ScheduledStart = null;
        ScheduledEnd = null;
        CustomerRescheduleCount++;
        Raise(new BookingTimeChanged(Id, SrNumber, CustomerId, CurrentTechnicianId, PreferredSlotStart!.Value, PreferredSlotEnd!.Value));
        return Result.Success();
    }

    public Result ApplyPayment(PaymentStatus paymentStatus, decimal finalAmount, Actor actor, DateTimeOffset now)
    {
        PaymentStatus = paymentStatus;
        FinalAmount = finalAmount;

        if (Status == ServiceRequestStatus.Completed && paymentStatus is PaymentStatus.Paid or PaymentStatus.Waived)
        {
            return ApplyTransition(ServiceRequestStatus.Closed, actor, new TransitionInput(ReasonCode: paymentStatus.ToString().ToUpperInvariant()), now);
        }

        return Result.Success();
    }

    /// <summary>The customer lost the code: issue a fresh one (old one stops working).</summary>
    public Result ReissueCompletionCode()
    {
        if (!ServiceRequestWorkflow.OnSite.Contains(Status))
        {
            return Error.Conflict("sr.code_not_available", "A completion code is only available once the technician has arrived.");
        }

        IssueCompletionCode();
        return Result.Success();
    }

    public ServiceRequestNote AddNote(string body, NoteVisibility visibility, Actor actor)
    {
        var note = new ServiceRequestNote(Id, body, visibility, actor);
        _notes.Add(note);
        return note;
    }

    public ServiceRequestAttachment AddAttachment(AttachmentKind kind, string storageKey, string contentType, long sizeBytes, Actor actor)
    {
        var attachment = new ServiceRequestAttachment(Id, kind, storageKey, contentType, sizeBytes, actor);
        _attachments.Add(attachment);
        return attachment;
    }

    /// <summary>Which transitions this actor could make right now (drives the technician's action bar).</summary>
    public IEnumerable<TransitionRule> AvailableTransitions(ActorType actorType)
    {
        var actor = ServiceRequestWorkflow.ToTransitionActor(actorType);
        return ServiceRequestWorkflow.From(Status).Where(r => !r.DispatchOnly && !r.EstimateOnly && r.Actors.HasFlag(actor));
    }

    private Result Apply(TransitionRule? rule, ServiceRequestStatus to, Actor actor, TransitionInput input, DateTimeOffset now, Guid? offeredTechnicianId = null)
    {
        if (rule is null)
        {
            return Error.Conflict("sr.invalid_transition", $"A job can't move from {Status} to {to}.");
        }

        var transitionActor = ServiceRequestWorkflow.ToTransitionActor(actor.Type);
        if (!rule.Actors.HasFlag(transitionActor))
        {
            return Error.Forbidden("sr.transition_forbidden", "You can't make this change.");
        }

        var requirements = CheckRequirements(rule, actor, input);
        if (requirements.IsFailure)
        {
            return requirements;
        }

        if (offeredTechnicianId is { } technicianId)
        {
            CurrentTechnicianId = technicianId;
        }

        return ApplyTransition(to, actor, input, now);
    }

    private Result CheckRequirements(TransitionRule rule, Actor actor, TransitionInput input)
    {
        var staffOverride = actor.Type == ActorType.User;

        if (rule.Requirements.HasFlag(TransitionRequirements.Reason) && string.IsNullOrWhiteSpace(input.ReasonCode))
        {
            return Error.Validation("sr.reason_required", "Choose a reason for this change.");
        }

        if (rule.Requirements.HasFlag(TransitionRequirements.AfterPhoto) && input.CategoryRequiresPhotos && !input.HasAfterPhoto && !staffOverride)
        {
            return Error.Validation("sr.photo_required", "Add an after-photo before completing the job.");
        }

        if (rule.Requirements.HasFlag(TransitionRequirements.CompletionCode))
        {
            if (staffOverride)
            {
                return string.IsNullOrWhiteSpace(input.ReasonCode)
                    ? Error.Validation("sr.reason_required", "Completing without the customer's code needs a reason.")
                    : Result.Success();
            }

            return VerifyCompletionCode(input.CompletionCode);
        }

        return Result.Success();
    }

    private Result VerifyCompletionCode(string? code)
    {
        if (CompletionCodeHash is null)
        {
            return Error.Conflict("sr.code_missing", "No completion code was issued for this job. Ask the office to complete it.");
        }

        if (CompletionCodeAttempts >= CompletionCodeMaxAttempts)
        {
            return Error.Conflict("sr.code_locked", "Too many wrong codes. Send the customer a new code.");
        }

        CompletionCodeAttempts++;
        if (string.IsNullOrWhiteSpace(code) || !SecureTokens.FixedTimeEquals(CompletionCodeHash, SecureTokens.Hash(code.Trim())))
        {
            return Error.Validation("sr.code_mismatch", "That code doesn't match. Ask the customer to check their WhatsApp.");
        }

        return Result.Success();
    }

    private Result ApplyTransition(ServiceRequestStatus to, Actor actor, TransitionInput input, DateTimeOffset now)
    {
        var from = Status;
        Status = to;
        StatusReason = input.ReasonCode;
        LastStatusChangeAt = now;
        StampMilestone(to, now);

        if (to == ServiceRequestStatus.Arrived)
        {
            IssueCompletionCode();
        }

        if (to == ServiceRequestStatus.Completed && PaymentStatus == PaymentStatus.NotDue)
        {
            PaymentStatus = PaymentStatus.Pending;
        }

        _history.Add(new StatusHistoryEntry(Id, from, to, input.ReasonCode, input.Note, actor, input.Location, now));
        Raise(new ServiceRequestStatusChanged(Id, SrNumber, CustomerId, CurrentTechnicianId, from, to, input.ReasonCode, actor.Type, now));
        return Result.Success();
    }

    private void IssueCompletionCode()
    {
        var code = SecureTokens.NumericCode(CompletionCodeDigits);
        CompletionCodeHash = SecureTokens.Hash(code);
        CompletionCodeAttempts = 0;
        Raise(new CompletionCodeIssued(Id, SrNumber, CustomerId, code));
    }

    private void StampMilestone(ServiceRequestStatus to, DateTimeOffset now)
    {
        switch (to)
        {
            case ServiceRequestStatus.Accepted:
                AcceptedAt = now;
                break;
            case ServiceRequestStatus.EnRoute:
                EnRouteAt = now;
                break;
            case ServiceRequestStatus.Arrived:
                ArrivedAt = now;
                break;
            case ServiceRequestStatus.Completed:
                CompletedAt = now;
                break;
            case ServiceRequestStatus.Closed or ServiceRequestStatus.ClosedNoRepair:
                ClosedAt = now;
                break;
            case ServiceRequestStatus.Cancelled:
                CancelledAt = now;
                break;
        }
    }
}

internal static class CustomerChangeErrors
{
    public static readonly Error TooLate = Error.Conflict(
        "booking.too_late_to_change", "Your technician is already on the way, so this can't be changed online. Please call us.");
}
