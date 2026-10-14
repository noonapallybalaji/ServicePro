using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using ServicePro.BuildingBlocks.Application;
using ServicePro.BuildingBlocks.Persistence;
using ServicePro.BuildingBlocks.Settings;
using ServicePro.Contracts;
using ServicePro.Modules.ServiceRequests.Domain;
using ServicePro.SharedKernel.Abstractions;
using ServicePro.SharedKernel.Results;

namespace ServicePro.Modules.ServiceRequests.Application;

/*
 * Ratings (PLAN.md §7.11). After a job is closed we ask the customer, once, how it went; they
 * rate it on their tracking link. Ratings feed the technician's average, which customers see
 * and dispatch uses.
 */

public static class FeedbackSettings
{
    public static readonly SettingDefinition<bool> RequestsEnabled = new(
        "feedback.requests_enabled",
        true,
        "Ask customers on WhatsApp to rate the visit after the job is closed.");

    public static readonly SettingDefinition<int> RequestDelayMinutes = new(
        "feedback.request_delay_minutes",
        120,
        "How long after the job is closed to ask for a rating.");
}

internal static class Reviews
{
    public static readonly IReadOnlySet<ServiceRequestStatus> Finished = new HashSet<ServiceRequestStatus>
    {
        ServiceRequestStatus.Completed,
        ServiceRequestStatus.Closed,
        ServiceRequestStatus.ClosedNoRepair,
    };

    public static readonly Error AlreadySubmitted = Error.Conflict("review.already_submitted", "You've already rated this visit. Thank you!");
}

public sealed record SubmitReviewRequest(int Rating, string? Comment);

internal sealed class SubmitReviewRequestValidator : AbstractValidator<SubmitReviewRequest>
{
    public SubmitReviewRequestValidator()
    {
        RuleFor(r => r.Rating).InclusiveBetween(1, 5).WithMessage("Choose 1 to 5 stars.");
        RuleFor(r => r.Comment).MaximumLength(Review.MaxCommentLength);
    }
}

/// <summary>The customer rates the finished job from their tracking link. Once per job.</summary>
public sealed class SubmitReview(DbContext db, TenantScope tenant, IClock clock) : IUseCase
{
    public async Task<Result<ReviewResponse>> HandleAsync(string token, SubmitReviewRequest request, CancellationToken ct)
    {
        var job = await TrackingRules.FindByTokenAsync(db, tenant, token, clock, ct);
        if (job is null)
        {
            return TrackingRules.Expired;
        }

        if (await db.Set<Review>().AnyAsync(r => r.ServiceRequestId == job.Id, ct))
        {
            return Reviews.AlreadySubmitted;
        }

        var review = Review.Submit(job, request.Rating, request.Comment, clock.UtcNow);
        if (review.IsFailure)
        {
            return review.Error!;
        }

        db.Set<Review>().Add(review.Value);
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException)
        {
            // Two taps at once: the unique index keeps one.
            return Reviews.AlreadySubmitted;
        }

        return new ReviewResponse(review.Value.Rating, review.Value.Comment, review.Value.SubmittedAt);
    }
}

public sealed record ReviewListItem(Guid ServiceRequestId, string SrNumber, Guid? TechnicianId, int Rating, string? Comment, DateTimeOffset SubmittedAt);

/// <summary>Recent ratings for the office; filter to low ones so poor visits get a follow-up call.</summary>
public sealed class ListReviews(DbContext db) : IUseCase
{
    public async Task<IReadOnlyList<ReviewListItem>> HandleAsync(int? maxRating, int take, CancellationToken ct)
    {
        var query = db.Set<Review>().AsNoTracking();
        if (maxRating is { } max)
        {
            query = query.Where(r => r.Rating <= max);
        }

        var reviews = await query.OrderByDescending(r => r.SubmittedAt).Take(Math.Clamp(take, 1, 200)).ToListAsync(ct);
        var ids = reviews.Select(r => r.ServiceRequestId).ToList();
        var numbers = await db.Set<ServiceRequest>().AsNoTracking().Where(s => ids.Contains(s.Id)).ToDictionaryAsync(s => s.Id, s => s.SrNumber, ct);
        return [.. reviews.Select(r => new ReviewListItem(r.ServiceRequestId, numbers.GetValueOrDefault(r.ServiceRequestId, string.Empty), r.TechnicianId, r.Rating, r.Comment, r.SubmittedAt))];
    }
}

/// <summary>
/// Asks for a rating a while after each job closes (FEEDBACK_REQUEST on WhatsApp). Each job is
/// asked once; jobs closed more than a week ago are never asked (e.g. when first switched on).
/// </summary>
public sealed partial class FeedbackRequestWorker(IServiceScopeFactory scopeFactory, IClock clock, ILogger<FeedbackRequestWorker> logger) : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromMinutes(1);
    private static readonly TimeSpan OldestToAsk = TimeSpan.FromDays(7);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await SendDueRequestsAsync(stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                LogSweepFailed(ex);
            }

            await Task.Delay(Interval, stoppingToken);
        }
    }

    public async Task<int> SendDueRequestsAsync(CancellationToken ct)
    {
        List<Guid> tenants;
        await using (var scope = scopeFactory.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<DbContext>();
            tenants = await db.Set<ServiceRequest>().IgnoreQueryFilters().Select(s => s.TenantId).Distinct().ToListAsync(ct);
        }

        var sent = 0;
        foreach (var tenantId in tenants)
        {
            sent += await SendForTenantAsync(tenantId, ct);
        }

        return sent;
    }

    private async Task<int> SendForTenantAsync(Guid tenantId, CancellationToken ct)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        scope.ServiceProvider.GetRequiredService<TenantScope>().Use(tenantId);
        var settings = scope.ServiceProvider.GetRequiredService<ISettingsStore>();
        if (!await settings.GetAsync(FeedbackSettings.RequestsEnabled, ct))
        {
            return 0;
        }

        var db = scope.ServiceProvider.GetRequiredService<DbContext>();
        var now = clock.UtcNow;
        var dueBefore = now.AddMinutes(-await settings.GetAsync(FeedbackSettings.RequestDelayMinutes, ct));
        var notBefore = now - OldestToAsk;
        var reviewed = db.Set<Review>().Select(r => r.ServiceRequestId);
        var due = await db.Set<ServiceRequest>()
            .Where(s => (s.Status == ServiceRequestStatus.Closed || s.Status == ServiceRequestStatus.ClosedNoRepair) &&
                        s.FeedbackRequestedAt == null && s.ClosedAt <= dueBefore && s.ClosedAt >= notBefore &&
                        !reviewed.Contains(s.Id))
            .OrderBy(s => s.ClosedAt)
            .Take(50)
            .ToListAsync(ct);
        due.ForEach(s => s.RequestFeedback(now));
        await db.SaveChangesAsync(ct);
        return due.Count;
    }

    [LoggerMessage(Level = LogLevel.Error, Message = "Feedback request sweep failed")]
    private partial void LogSweepFailed(Exception ex);
}
