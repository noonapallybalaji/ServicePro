using ServicePro.Contracts.Events;
using ServicePro.SharedKernel.Domain;
using ServicePro.SharedKernel.Results;

namespace ServicePro.Modules.ServiceRequests.Domain;

/// <summary>The customer's rating of a finished job (PLAN.md §7.11 `reviews`): one per job.</summary>
public sealed class Review : TenantOwnedAggregateRoot
{
    public const int MaxCommentLength = 1000;

    private Review()
    {
    }

    public Guid ServiceRequestId { get; private set; }

    public Guid CustomerId { get; private set; }

    public Guid? TechnicianId { get; private set; }

    /// <summary>1 (poor) to 5 (excellent).</summary>
    public int Rating { get; private set; }

    public string? Comment { get; private set; }

    public DateTimeOffset SubmittedAt { get; private set; }

    public static Result<Review> Submit(ServiceRequest job, int rating, string? comment, DateTimeOffset now)
    {
        if (job.Status is not (Contracts.ServiceRequestStatus.Completed or Contracts.ServiceRequestStatus.Closed or Contracts.ServiceRequestStatus.ClosedNoRepair))
        {
            return Error.Conflict("review.not_finished", "You can rate the visit once the job is finished.");
        }

        if (rating is < 1 or > 5)
        {
            return Error.Validation("review.rating_invalid", "Choose 1 to 5 stars.");
        }

        var review = new Review
        {
            ServiceRequestId = job.Id,
            CustomerId = job.CustomerId,
            TechnicianId = job.CurrentTechnicianId,
            Rating = rating,
            Comment = string.IsNullOrWhiteSpace(comment) ? null : comment.Trim(),
            SubmittedAt = now,
        };
        review.Raise(new ReviewSubmitted(review.Id, job.Id, job.SrNumber, review.TechnicianId, rating));
        return review;
    }
}
