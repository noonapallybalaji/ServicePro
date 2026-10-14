using FluentValidation;
using Microsoft.EntityFrameworkCore;
using ServicePro.BuildingBlocks.Application;
using ServicePro.BuildingBlocks.Security;
using ServicePro.BuildingBlocks.Settings;
using ServicePro.Contracts;
using ServicePro.Contracts.Ports;
using ServicePro.Modules.Dispatch.Domain;
using ServicePro.Modules.Dispatch.Matching;
using ServicePro.SharedKernel.Abstractions;
using ServicePro.SharedKernel.Results;

namespace ServicePro.Modules.Dispatch.Application;

public sealed record CandidateResponse(
    Guid TechnicianId,
    string FullName,
    string Specialty,
    TechnicianDutyStatus DutyStatus,
    bool IsRecommended,
    IReadOnlyList<string> Reasons,
    int Rank,
    decimal MatchScore,
    IReadOnlyDictionary<string, decimal> Breakdown,
    double? DistanceKm,
    int JobsToday,
    int MaxJobsPerDay,
    decimal? RatingAverage,
    int CompletedJobs);

public sealed record AssignmentResponse(
    Guid Id,
    Guid ServiceRequestId,
    Guid TechnicianId,
    AssignmentStatus Status,
    decimal? MatchScore,
    IReadOnlyDictionary<string, decimal> Breakdown,
    double? DistanceKm,
    string? OverrideReason,
    string? DeclineReason,
    DateTimeOffset OfferedAt,
    DateTimeOffset OfferExpiresAt,
    DateTimeOffset? RespondedAt);

internal static class DispatchErrors
{
    public static readonly Error OfferNotFound = Error.NotFound("offer.not_found", "That offer doesn't exist.");
    public static readonly Error NotYourOffer = Error.Forbidden("offer.not_yours", "This offer was made to someone else.");
}

internal static class AssignmentMapping
{
    public static AssignmentResponse ToResponse(this TechnicianAssignment a) => new(
        a.Id, a.ServiceRequestId, a.TechnicianId, a.Status, a.MatchScore, a.ScoreBreakdown, a.DistanceKm,
        a.OverrideReason, a.DeclineReason, a.OfferedAt, a.OfferExpiresAt, a.RespondedAt);
}

/// <summary>Collects everything the matching engine needs for one job (one place, testable).</summary>
public sealed class MatchContextBuilder(DbContext db, ICatalogDirectory catalog, ISettingsStore settings, IClock clock)
{
    public async Task<MatchContext> BuildAsync(DispatchContext job, IEnumerable<Guid> technicianIds, CancellationToken ct)
    {
        var ids = technicianIds.ToList();
        var now = clock.UtcNow;
        var zone = await settings.GetTimeZoneAsync(ct);
        var today = BusinessSettings.Today(now, zone);
        var dayStart = BusinessSettings.LocalDay(today, zone).Start;
        var weekStart = BusinessSettings.LocalDay(today.AddDays(-(((int)today.DayOfWeek + 6) % 7)), zone).Start;

        var assignments = await db.Set<TechnicianAssignment>().AsNoTracking()
            .Where(a => ids.Contains(a.TechnicianId) && a.OfferedAt >= weekStart.AddDays(-28))
            .Select(a => new { a.TechnicianId, a.ServiceRequestId, a.CustomerId, a.Status, a.OfferedAt, a.RespondedAt })
            .ToListAsync(ct);

        var jobsToday = assignments
            .Where(a => a.OfferedAt >= dayStart && a.Status is AssignmentStatus.Offered or AssignmentStatus.Accepted or AssignmentStatus.Completed)
            .GroupBy(a => a.TechnicianId).ToDictionary(g => g.Key, g => g.Count());
        var completedThisWeek = assignments
            .Where(a => a.Status == AssignmentStatus.Completed && a.RespondedAt >= weekStart)
            .GroupBy(a => a.TechnicianId).ToDictionary(g => g.Key, g => g.Count());
        var acceptanceRate = assignments
            .Where(a => a.Status is not AssignmentStatus.Offered and not AssignmentStatus.Cancelled)
            .GroupBy(a => a.TechnicianId)
            .ToDictionary(g => g.Key, g => (double)g.Count(a => a.Status is AssignmentStatus.Accepted or AssignmentStatus.Completed) / g.Count());

        var alreadyTried = (await db.Set<TechnicianAssignment>().AsNoTracking()
                .Where(a => a.ServiceRequestId == job.ServiceRequestId && (a.Status == AssignmentStatus.Declined || a.Status == AssignmentStatus.Expired))
                .Select(a => a.TechnicianId).ToListAsync(ct))
            .ToHashSet();
        var servedBefore = (await db.Set<TechnicianAssignment>().AsNoTracking()
                .Where(a => a.CustomerId == job.CustomerId && a.Status == AssignmentStatus.Completed)
                .Select(a => a.TechnicianId).ToListAsync(ct))
            .ToHashSet();

        var areaIds = (await catalog.FindServiceAreaIdsByPincodeAsync(job.Pincode, ct)).ToHashSet();

        return new MatchContext(
            job,
            areaIds,
            job.ScheduledStart ?? now,
            zone,
            jobsToday,
            completedThisWeek,
            acceptanceRate,
            alreadyTried,
            servedBefore,
            await settings.GetAsync(DispatchSettings.MaxRadiusKm, ct),
            now);
    }
}

public sealed class GetCandidates(
    IServiceRequestWorkflow workflow,
    ITechnicianDirectory technicians,
    MatchContextBuilder contextBuilder,
    MatchingEngine engine,
    ISettingsStore settings) : IUseCase
{
    public async Task<Result<IReadOnlyList<CandidateResponse>>> HandleAsync(Guid serviceRequestId, CancellationToken ct)
    {
        var job = await workflow.GetDispatchContextAsync(serviceRequestId, ct);
        if (job.IsFailure)
        {
            return job.Error!;
        }

        var profiles = await technicians.GetDispatchProfilesAsync(job.Value.CategoryId, ct);
        var context = await contextBuilder.BuildAsync(job.Value, profiles.Select(p => p.Id), ct);
        var weights = await settings.GetAsync(DispatchSettings.Weights, ct);

        return Result<IReadOnlyList<CandidateResponse>>.Success([.. engine.Rank(profiles, context, weights).Select(c => new CandidateResponse(
            c.Technician.Id, c.Technician.FullName, c.Technician.Specialty, c.Technician.DutyStatus,
            c.IsEligible, c.IneligibleReasons, c.Rank, c.Total, c.Breakdown, c.DistanceKm, c.JobsToday,
            c.Technician.MaxJobsPerDay, c.Technician.RatingAverage, c.Technician.CompletedJobs))]);
    }
}

public sealed record AssignTechnicianRequest(Guid TechnicianId, string? OverrideReason, bool MarkAccepted);

internal sealed class AssignTechnicianRequestValidator : AbstractValidator<AssignTechnicianRequest>
{
    public AssignTechnicianRequestValidator()
    {
        RuleFor(r => r.TechnicianId).NotEmpty();
        RuleFor(r => r.OverrideReason).MaximumLength(200);
    }
}

/// <summary>
/// Offers a job to a technician (PLAN.md §4.3). Shared by the owner picking someone (suggest
/// mode) and automatic dispatch. Reassigning cancels the current assignment first. "Mark
/// accepted" is for when the owner already agreed the job with the technician by phone.
/// Participates in the caller's unit of work: it never saves.
/// </summary>
public sealed class JobOffers(DbContext db, IServiceRequestWorkflow workflow, GetCandidates candidates, ISettingsStore settings, IClock clock)
{
    public async Task<Result<TechnicianAssignment>> OfferAsync(
        Guid serviceRequestId, Guid technicianId, string? overrideReason, bool markAccepted, Actor actor, CancellationToken ct)
    {
        var job = await workflow.GetDispatchContextAsync(serviceRequestId, ct);
        if (job.IsFailure)
        {
            return job.Error!;
        }

        var ranked = await candidates.HandleAsync(serviceRequestId, ct);
        var candidate = ranked.IsSuccess ? ranked.Value.FirstOrDefault(c => c.TechnicianId == technicianId) : null;
        if (candidate is null)
        {
            return Error.Validation("dispatch.not_a_candidate", "This technician doesn't have the skill for this appliance.");
        }

        if (!candidate.IsRecommended && string.IsNullOrWhiteSpace(overrideReason))
        {
            return Error.Validation("dispatch.override_reason_required",
                $"{candidate.FullName} isn't recommended ({string.Join("; ", candidate.Reasons)}). Add a reason to assign anyway.");
        }

        var now = clock.UtcNow;
        var open = await db.Set<TechnicianAssignment>()
            .Where(a => a.ServiceRequestId == serviceRequestId && (a.Status == AssignmentStatus.Offered || a.Status == AssignmentStatus.Accepted))
            .ToListAsync(ct);
        if (open.Count > 0 || job.Value.Status is ServiceRequestStatus.Rescheduled)
        {
            open.ForEach(a => a.Cancel("REASSIGNED", now));
            var returned = await workflow.ReturnToQueueAsync(serviceRequestId, "REASSIGNED", actor, ct);
            if (returned.IsFailure)
            {
                return returned.Error!;
            }
        }

        var timeout = TimeSpan.FromMinutes(await settings.GetAsync(DispatchSettings.OfferTimeoutMinutes, ct));
        var score = new CandidateScore(candidate.Rank, candidate.MatchScore, candidate.Breakdown, candidate.DistanceKm);
        var assignment = TechnicianAssignment.Offer(serviceRequestId, technicianId, job.Value.CustomerId, actor, score, overrideReason, now, timeout);
        db.Set<TechnicianAssignment>().Add(assignment);

        var offered = await workflow.OfferAsync(serviceRequestId, technicianId, assignment.Id, actor, ct);
        if (offered.IsFailure)
        {
            return offered.Error!;
        }

        if (markAccepted)
        {
            assignment.Accept(now);
            var accepted = await workflow.AcceptOfferAsync(serviceRequestId, technicianId, actor, ct);
            if (accepted.IsFailure)
            {
                return accepted.Error!;
            }
        }

        return assignment;
    }
}

/// <summary>The owner picks the technician (suggest mode).</summary>
public sealed class AssignTechnician(DbContext db, JobOffers offers, ICurrentUser currentUser) : IUseCase
{
    public async Task<Result<AssignmentResponse>> HandleAsync(Guid serviceRequestId, AssignTechnicianRequest request, CancellationToken ct)
    {
        var assignment = await offers.OfferAsync(serviceRequestId, request.TechnicianId, request.OverrideReason, request.MarkAccepted, currentUser.ToActor(), ct);
        if (assignment.IsFailure)
        {
            return assignment.Error!;
        }

        await db.SaveChangesAsync(ct);
        return assignment.Value.ToResponse();
    }
}

public sealed record UnassignRequest(string Reason);

internal sealed class UnassignRequestValidator : AbstractValidator<UnassignRequest>
{
    public UnassignRequestValidator() => RuleFor(r => r.Reason).NotEmpty().MaximumLength(200);
}

public sealed class UnassignTechnician(DbContext db, IServiceRequestWorkflow workflow, ICurrentUser currentUser, IClock clock) : IUseCase
{
    public async Task<Result> HandleAsync(Guid serviceRequestId, UnassignRequest request, CancellationToken ct)
    {
        var now = clock.UtcNow;
        var open = await db.Set<TechnicianAssignment>()
            .Where(a => a.ServiceRequestId == serviceRequestId && (a.Status == AssignmentStatus.Offered || a.Status == AssignmentStatus.Accepted))
            .ToListAsync(ct);
        if (open.Count == 0)
        {
            return Error.Conflict("dispatch.not_assigned", "Nobody is assigned to this job.");
        }

        open.ForEach(a => a.Cancel(request.Reason, now));
        var returned = await workflow.ReturnToQueueAsync(serviceRequestId, request.Reason, currentUser.ToActor(), ct);
        if (returned.IsFailure)
        {
            return returned;
        }

        await db.SaveChangesAsync(ct);
        return Result.Success();
    }
}

public sealed class ListAssignmentHistory(DbContext db) : IUseCase
{
    public async Task<IReadOnlyList<AssignmentResponse>> HandleAsync(Guid serviceRequestId, CancellationToken ct)
    {
        var assignments = await db.Set<TechnicianAssignment>().AsNoTracking()
            .Where(a => a.ServiceRequestId == serviceRequestId)
            .OrderByDescending(a => a.OfferedAt)
            .ToListAsync(ct);
        return [.. assignments.Select(a => a.ToResponse())];
    }
}

// ── Technician: offers ──────────────────────────────────────────────────────

public sealed record OfferResponse(
    Guid AssignmentId,
    Guid ServiceRequestId,
    string SrNumber,
    string CategoryName,
    string CategoryCode,
    string Locality,
    string Pincode,
    double? DistanceKm,
    DateTimeOffset? ScheduledStart,
    Priority Priority,
    DateTimeOffset OfferedAt,
    DateTimeOffset ExpiresAt);

public sealed class ListMyOffers(
    DbContext db,
    IServiceRequestWorkflow workflow,
    ICatalogDirectory catalog,
    ICurrentUser currentUser,
    IClock clock) : IUseCase
{
    public async Task<IReadOnlyList<OfferResponse>> HandleAsync(CancellationToken ct)
    {
        var now = clock.UtcNow;
        var offers = await db.Set<TechnicianAssignment>().AsNoTracking()
            .Where(a => a.TechnicianId == currentUser.TechnicianId && a.Status == AssignmentStatus.Offered && a.OfferExpiresAt > now)
            .OrderBy(a => a.OfferExpiresAt)
            .ToListAsync(ct);

        var result = new List<OfferResponse>(offers.Count);
        foreach (var offer in offers)
        {
            var job = await workflow.GetDispatchContextAsync(offer.ServiceRequestId, ct);
            if (job.IsFailure)
            {
                continue;
            }

            var category = await catalog.GetCategoryAsync(job.Value.CategoryId, ct);
            result.Add(new OfferResponse(
                offer.Id, offer.ServiceRequestId, job.Value.SrNumber, category?.Name ?? "Service", category?.Code ?? "OTHER",
                job.Value.Locality, job.Value.Pincode, offer.DistanceKm, job.Value.ScheduledStart, job.Value.Priority,
                offer.OfferedAt, offer.OfferExpiresAt));
        }

        return result;
    }
}

public sealed record DeclineOfferRequest(string Reason);

public sealed class RespondToOffer(DbContext db, IServiceRequestWorkflow workflow, ICurrentUser currentUser, IClock clock) : IUseCase
{
    public Task<Result> AcceptAsync(Guid assignmentId, CancellationToken ct) =>
        RespondAsync(assignmentId, async (assignment, actor, now) =>
        {
            var accepted = assignment.Accept(now);
            return accepted.IsFailure
                ? accepted
                : await workflow.AcceptOfferAsync(assignment.ServiceRequestId, assignment.TechnicianId, actor, ct);
        }, ct);

    public Task<Result> DeclineAsync(Guid assignmentId, DeclineOfferRequest request, CancellationToken ct) =>
        RespondAsync(assignmentId, async (assignment, actor, now) =>
        {
            var declined = assignment.Decline(string.IsNullOrWhiteSpace(request.Reason) ? "DECLINED" : request.Reason, now);
            return declined.IsFailure
                ? declined
                : await workflow.ReturnToQueueAsync(assignment.ServiceRequestId, "OFFER_DECLINED", actor, ct);
        }, ct);

    private async Task<Result> RespondAsync(Guid assignmentId, Func<TechnicianAssignment, Actor, DateTimeOffset, Task<Result>> respond, CancellationToken ct)
    {
        var assignment = await db.Set<TechnicianAssignment>().FirstOrDefaultAsync(a => a.Id == assignmentId, ct);
        if (assignment is null)
        {
            return DispatchErrors.OfferNotFound;
        }

        if (assignment.TechnicianId != currentUser.TechnicianId)
        {
            return DispatchErrors.NotYourOffer;
        }

        var result = await respond(assignment, currentUser.ToActor(), clock.UtcNow);
        if (result.IsSuccess)
        {
            await db.SaveChangesAsync(ct);
        }

        return result;
    }
}
