using ServicePro.Contracts;
using ServicePro.Contracts.Ports;

namespace ServicePro.Modules.Dispatch.Matching;

/// <summary>Facts about the job and the current workload, gathered once per ranking.</summary>
public sealed record MatchContext(
    DispatchContext Job,
    IReadOnlySet<Guid> JobServiceAreaIds,
    DateTimeOffset JobTime,
    TimeZoneInfo TimeZone,
    IReadOnlyDictionary<Guid, int> JobsToday,
    IReadOnlyDictionary<Guid, int> CompletedThisWeek,
    IReadOnlyDictionary<Guid, double> AcceptanceRate,
    IReadOnlySet<Guid> AlreadyTried,
    IReadOnlySet<Guid> ServedCustomerBefore,
    double MaxRadiusKm,
    DateTimeOffset Now);

/// <summary>A hard filter (PLAN.md §10.1). Failing one makes a technician "not recommended", with the reason shown.</summary>
public interface IEligibilityRule
{
    /// <returns>null when eligible; otherwise a short human reason.</returns>
    string? Check(TechnicianDispatchProfile technician, MatchContext context);
}

/// <summary>A weighted scoring factor (PLAN.md §10.2). Returns 0..1; the engine applies the weight.</summary>
public interface IScoringFactor
{
    string Key { get; }

    double Score(TechnicianDispatchProfile technician, MatchContext context);
}

public sealed record RankedCandidate(
    TechnicianDispatchProfile Technician,
    bool IsEligible,
    IReadOnlyList<string> IneligibleReasons,
    int Rank,
    decimal Total,
    IReadOnlyDictionary<string, decimal> Breakdown,
    double? DistanceKm,
    int JobsToday);

/// <summary>
/// Ranks technicians for a job: eligible ones first by weighted score, then the rest with their
/// reasons so the owner can still override. Rules and factors are injected (open/closed).
/// </summary>
public sealed class MatchingEngine(IEnumerable<IEligibilityRule> rules, IEnumerable<IScoringFactor> factors)
{
    private readonly IReadOnlyList<IEligibilityRule> _rules = [.. rules];
    private readonly IReadOnlyList<IScoringFactor> _factors = [.. factors];

    public IReadOnlyList<RankedCandidate> Rank(
        IReadOnlyList<TechnicianDispatchProfile> technicians,
        MatchContext context,
        IReadOnlyDictionary<string, double> weights)
    {
        var scored = technicians.Select(t =>
            {
                var reasons = _rules.Select(r => r.Check(t, context)).OfType<string>().ToList();
                var breakdown = _factors.ToDictionary(
                    f => f.Key,
                    f => Math.Round((decimal)(Math.Clamp(f.Score(t, context), 0, 1) * weights.GetValueOrDefault(f.Key)), 1));
                return new
                {
                    Technician = t,
                    Reasons = reasons,
                    Breakdown = breakdown,
                    Total = breakdown.Values.Sum(),
                    Distance = Geo.DistanceKm(t, context),
                };
            })
            .OrderByDescending(c => c.Reasons.Count == 0)
            .ThenByDescending(c => c.Total)
            .ThenBy(c => c.Technician.FullName, StringComparer.Ordinal)
            .ToList();

        return [.. scored.Select((c, index) => new RankedCandidate(
            c.Technician,
            c.Reasons.Count == 0,
            c.Reasons,
            index + 1,
            c.Total,
            c.Breakdown,
            c.Distance is { } d ? Math.Round(d, 1) : null,
            context.JobsToday.GetValueOrDefault(c.Technician.Id)))];
    }
}

internal static class Geo
{
    /// <summary>Distance from where the technician is now (or home) to the job, when both are known.</summary>
    public static double? DistanceKm(TechnicianDispatchProfile technician, MatchContext context)
    {
        var from = technician.CurrentLocation ?? technician.HomeLocation;
        return from is not null && context.Job.Location is { } to ? from.DistanceKmTo(to) : null;
    }
}

// ── Eligibility rules ───────────────────────────────────────────────────────

public sealed class HasRequiredSkillRule : IEligibilityRule
{
    public string? Check(TechnicianDispatchProfile technician, MatchContext context) =>
        technician.SkillLevel is { } level && level >= context.Job.MinSkillLevel
            ? null
            : $"Skill level below {context.Job.MinSkillLevel} for this problem";
}

public sealed class CoversServiceAreaRule : IEligibilityRule
{
    public string? Check(TechnicianDispatchProfile technician, MatchContext context) =>
        technician.ServiceAreaIds.Any(context.JobServiceAreaIds.Contains)
            ? null
            : $"Doesn't cover pincode {context.Job.Pincode}";
}

public sealed class AvailableAtJobTimeRule : IEligibilityRule
{
    public string? Check(TechnicianDispatchProfile technician, MatchContext context)
    {
        if (technician.TimeOff.Any(o => o.StartsAt <= context.JobTime && context.JobTime < o.EndsAt))
        {
            return "On leave at the job time";
        }

        if (technician.Shifts.Count == 0)
        {
            return null;
        }

        var local = TimeZoneInfo.ConvertTime(context.JobTime, context.TimeZone);
        var time = TimeOnly.FromDateTime(local.DateTime);
        return technician.Shifts.Any(s => s.Day == local.DayOfWeek && s.Start <= time && time < s.End)
            ? null
            : "Not on shift at the job time";
    }
}

public sealed class UnderDailyCapRule : IEligibilityRule
{
    public string? Check(TechnicianDispatchProfile technician, MatchContext context) =>
        context.JobsToday.GetValueOrDefault(technician.Id) < technician.MaxJobsPerDay
            ? null
            : $"Already has {technician.MaxJobsPerDay} jobs today";
}

public sealed class NotAlreadyTriedRule : IEligibilityRule
{
    public string? Check(TechnicianDispatchProfile technician, MatchContext context) =>
        context.AlreadyTried.Contains(technician.Id) ? "Declined or missed this offer earlier" : null;
}

/// <summary>For jobs due within the next two hours, the technician must be on duty.</summary>
public sealed class OnDutyForSoonJobsRule : IEligibilityRule
{
    private static readonly TimeSpan SoonWindow = TimeSpan.FromHours(2);

    public string? Check(TechnicianDispatchProfile technician, MatchContext context)
    {
        var isSoon = context.JobTime - context.Now < SoonWindow;
        return isSoon && technician.DutyStatus == TechnicianDutyStatus.OffDuty ? "Off duty" : null;
    }
}

// ── Scoring factors (keys match the dispatch.weights setting) ──────────────

public sealed class DistanceFactor : IScoringFactor
{
    public string Key => "distance";

    /// <summary>Closer is better; unknown locations score neutral so they aren't punished for missing data.</summary>
    public double Score(TechnicianDispatchProfile technician, MatchContext context) =>
        Geo.DistanceKm(technician, context) is { } km ? 1 - km / context.MaxRadiusKm : 0.5;
}

public sealed class SkillFactor : IScoringFactor
{
    public string Key => "skill";

    public double Score(TechnicianDispatchProfile technician, MatchContext context) => (technician.SkillLevel ?? 0) / 5.0;
}

public sealed class WorkloadFactor : IScoringFactor
{
    public string Key => "workload";

    public double Score(TechnicianDispatchProfile technician, MatchContext context) =>
        1 - (double)context.JobsToday.GetValueOrDefault(technician.Id) / Math.Max(1, technician.MaxJobsPerDay);
}

public sealed class PerformanceFactor : IScoringFactor
{
    private const double NeutralRating = 3.5;

    public string Key => "performance";

    public double Score(TechnicianDispatchProfile technician, MatchContext context)
    {
        var rating = (double)(technician.RatingAverage ?? (decimal)NeutralRating) / 5.0;
        var acceptance = context.AcceptanceRate.GetValueOrDefault(technician.Id, 1.0);
        return 0.6 * rating + 0.4 * acceptance;
    }
}

public sealed class ContinuityFactor : IScoringFactor
{
    public string Key => "continuity";

    public double Score(TechnicianDispatchProfile technician, MatchContext context) =>
        context.ServedCustomerBefore.Contains(technician.Id) ? 1 : 0;
}

public sealed class FairnessFactor : IScoringFactor
{
    public string Key => "fairness";

    /// <summary>Fewer completed jobs this week → higher score, so work is shared out.</summary>
    public double Score(TechnicianDispatchProfile technician, MatchContext context)
    {
        var busiest = context.CompletedThisWeek.Count == 0 ? 0 : context.CompletedThisWeek.Values.Max();
        return busiest == 0 ? 1 : 1 - (double)context.CompletedThisWeek.GetValueOrDefault(technician.Id) / busiest;
    }
}
