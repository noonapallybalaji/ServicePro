using ServicePro.Contracts.Events;
using ServicePro.SharedKernel.Abstractions;
using ServicePro.SharedKernel.Domain;
using ServicePro.SharedKernel.Results;

namespace ServicePro.Modules.Dispatch.Domain;

public enum AssignmentStatus
{
    Offered,
    Accepted,
    Declined,
    Expired,
    Cancelled,
    Completed,
}

/// <summary>
/// One offer of one job to one technician (PLAN.md §7.8 `technician_assignments`).
/// The score breakdown is kept so the owner can always see why someone was chosen.
/// </summary>
public sealed class TechnicianAssignment : TenantOwnedAggregateRoot
{
    private TechnicianAssignment()
    {
    }

    public Guid ServiceRequestId { get; private set; }

    public Guid TechnicianId { get; private set; }

    /// <summary>Denormalised for the continuity factor ("served this customer before").</summary>
    public Guid CustomerId { get; private set; }

    public ActorType AssignedByType { get; private set; }

    public Guid? AssignedByUserId { get; private set; }

    public int? Rank { get; private set; }

    public decimal? MatchScore { get; private set; }

    public Dictionary<string, decimal> ScoreBreakdown { get; private set; } = [];

    public double? DistanceKm { get; private set; }

    public string? OverrideReason { get; private set; }

    public AssignmentStatus Status { get; private set; }

    public string? DeclineReason { get; private set; }

    public DateTimeOffset OfferedAt { get; private set; }

    public DateTimeOffset OfferExpiresAt { get; private set; }

    public DateTimeOffset? RespondedAt { get; private set; }

    public uint Version { get; private set; }

    public bool IsOpen => Status is AssignmentStatus.Offered or AssignmentStatus.Accepted;

    public static TechnicianAssignment Offer(
        Guid serviceRequestId,
        Guid technicianId,
        Guid customerId,
        Actor assignedBy,
        CandidateScore? score,
        string? overrideReason,
        DateTimeOffset now,
        TimeSpan timeout)
    {
        var assignment = new TechnicianAssignment
        {
            ServiceRequestId = serviceRequestId,
            TechnicianId = technicianId,
            CustomerId = customerId,
            AssignedByType = assignedBy.Type,
            AssignedByUserId = assignedBy.UserId,
            Rank = score?.Rank,
            MatchScore = score?.Total,
            ScoreBreakdown = score?.Breakdown.ToDictionary() ?? [],
            DistanceKm = score?.DistanceKm,
            OverrideReason = string.IsNullOrWhiteSpace(overrideReason) ? null : overrideReason.Trim(),
            Status = AssignmentStatus.Offered,
            OfferedAt = now,
            OfferExpiresAt = now + timeout,
        };

        assignment.Raise(new JobOffered(assignment.Id, serviceRequestId, technicianId, assignment.OfferExpiresAt));
        return assignment;
    }

    public Result Accept(DateTimeOffset now)
    {
        if (Status != AssignmentStatus.Offered)
        {
            return Error.Conflict("offer.closed", "This offer is no longer open.");
        }

        if (now > OfferExpiresAt)
        {
            return Error.Conflict("offer.expired", "This offer has expired.");
        }

        return Resolve(AssignmentStatus.Accepted, null, now);
    }

    public Result Decline(string reason, DateTimeOffset now) =>
        Status == AssignmentStatus.Offered
            ? Resolve(AssignmentStatus.Declined, reason, now)
            : Error.Conflict("offer.closed", "This offer is no longer open.");

    public Result Expire(DateTimeOffset now) =>
        Status == AssignmentStatus.Offered && now >= OfferExpiresAt
            ? Resolve(AssignmentStatus.Expired, "NO_RESPONSE", now)
            : Error.Conflict("offer.not_expired", "This offer hasn't expired.");

    /// <summary>The office took the job back (unassign / reassign / job cancelled).</summary>
    public Result Cancel(string reason, DateTimeOffset now) =>
        IsOpen ? Resolve(AssignmentStatus.Cancelled, reason, now) : Result.Success();

    public void MarkCompleted() => Status = AssignmentStatus.Completed;

    private Result Resolve(AssignmentStatus status, string? reason, DateTimeOffset now)
    {
        Status = status;
        DeclineReason = reason;
        RespondedAt = now;
        Raise(new JobOfferResolved(Id, ServiceRequestId, TechnicianId, status.ToString()));
        return Result.Success();
    }
}

/// <summary>A candidate's score as computed by the matching engine.</summary>
public sealed record CandidateScore(int Rank, decimal Total, IReadOnlyDictionary<string, decimal> Breakdown, double? DistanceKm);
