using ServicePro.Contracts;
using ServicePro.Contracts.Ports;
using ServicePro.Modules.Dispatch.Domain;
using ServicePro.Modules.Dispatch.Matching;
using ServicePro.SharedKernel.Abstractions;
using ServicePro.SharedKernel.ValueObjects;

namespace ServicePro.UnitTests.Dispatch;

public sealed class MatchingEngineTests
{
    private static readonly DateTimeOffset Monday10Am = new(2026, 10, 5, 4, 30, 0, TimeSpan.Zero); // 10:00 IST
    private static readonly Guid Area = Guid.NewGuid();
    private static readonly GeoLocation JobLocation = GeoLocation.Create(17.4615, 78.3634).Value;

    private static readonly Dictionary<string, double> Weights = new()
    {
        ["distance"] = 30, ["skill"] = 20, ["workload"] = 15, ["performance"] = 15, ["continuity"] = 10, ["fairness"] = 10,
    };

    private static MatchingEngine Engine() => new(
        [new HasRequiredSkillRule(), new CoversServiceAreaRule(), new AvailableAtJobTimeRule(), new UnderDailyCapRule(), new NotAlreadyTriedRule(), new OnDutyForSoonJobsRule()],
        [new DistanceFactor(), new SkillFactor(), new WorkloadFactor(), new PerformanceFactor(), new ContinuityFactor(), new FairnessFactor()]);

    private static TechnicianDispatchProfile Technician(
        string name,
        int skill = 4,
        double lat = 17.46,
        double lon = 78.365,
        Guid? area = null,
        TechnicianDutyStatus duty = TechnicianDutyStatus.Available,
        IReadOnlyList<WeeklyShift>? shifts = null) =>
        new(Guid.NewGuid(), name, "AC specialist", duty, skill, [area ?? Area],
            shifts ?? [new WeeklyShift(DayOfWeek.Monday, new TimeOnly(9, 0), new TimeOnly(19, 0))],
            [], GeoLocation.Create(lat, lon).Value, null, 6, 4.5m, 100);

    private static MatchContext Context(
        IReadOnlyDictionary<Guid, int>? jobsToday = null,
        IReadOnlySet<Guid>? tried = null,
        IReadOnlySet<Guid>? servedBefore = null,
        int minSkill = 2) =>
        new(
            new DispatchContext(Guid.NewGuid(), "SR-1", ServiceRequestStatus.ReadyForAssignment, Guid.NewGuid(), Guid.NewGuid(),
                minSkill, "Kondapur", "500084", JobLocation, Monday10Am, Priority.Normal),
            new HashSet<Guid> { Area },
            Monday10Am,
            TimeZoneInfo.FindSystemTimeZoneById("Asia/Kolkata"),
            jobsToday ?? new Dictionary<Guid, int>(),
            new Dictionary<Guid, int>(),
            new Dictionary<Guid, double>(),
            tried ?? new HashSet<Guid>(),
            servedBefore ?? new HashSet<Guid>(),
            15,
            Monday10Am.AddHours(-1));

    [Fact]
    public void Closer_technician_ranks_first_when_everything_else_is_equal()
    {
        var near = Technician("Near", lat: 17.4610, lon: 78.3640);
        var far = Technician("Far", lat: 17.50, lon: 78.42);

        var ranked = Engine().Rank([far, near], Context(), Weights);

        ranked[0].Technician.ShouldBe(near);
        ranked[0].Rank.ShouldBe(1);
        ranked[0].Breakdown["distance"].ShouldBeGreaterThan(ranked[1].Breakdown["distance"]);
    }

    [Fact]
    public void Ineligible_technicians_rank_below_eligible_ones_with_reasons()
    {
        var outOfArea = Technician("Out of area", lat: 17.4615, lon: 78.3634, area: Guid.NewGuid());
        var eligible = Technician("Eligible", lat: 17.50, lon: 78.42);

        var ranked = Engine().Rank([outOfArea, eligible], Context(), Weights);

        ranked[0].Technician.ShouldBe(eligible);
        ranked[1].IsEligible.ShouldBeFalse();
        ranked[1].IneligibleReasons.ShouldContain(r => r.Contains("500084"));
    }

    [Fact]
    public void Hard_filters_explain_why()
    {
        var lowSkill = Technician("Trainee", skill: 1);
        var offShift = Technician("Night", shifts: [new WeeklyShift(DayOfWeek.Monday, new TimeOnly(14, 0), new TimeOnly(22, 0))]);
        var busy = Technician("Busy");
        var tried = Technician("Declined earlier");
        var offDuty = Technician("Off duty", duty: TechnicianDutyStatus.OffDuty);

        var ranked = Engine().Rank([lowSkill, offShift, busy, tried, offDuty],
            Context(jobsToday: new Dictionary<Guid, int> { [busy.Id] = 6 }, tried: new HashSet<Guid> { tried.Id }, minSkill: 3), Weights);

        string Reasons(TechnicianDispatchProfile t) => string.Join(" | ", ranked.Single(c => c.Technician == t).IneligibleReasons);
        Reasons(lowSkill).ShouldContain("Skill level");
        Reasons(offShift).ShouldContain("Not on shift");
        Reasons(busy).ShouldContain("6 jobs today");
        Reasons(tried).ShouldContain("Declined");
        Reasons(offDuty).ShouldContain("Off duty");
        ranked.ShouldAllBe(c => !c.IsEligible);
    }

    [Fact]
    public void Serving_the_customer_before_adds_continuity_points()
    {
        var returning = Technician("Returning", lat: 17.50, lon: 78.42);
        var other = Technician("Other", lat: 17.50, lon: 78.42);

        var ranked = Engine().Rank([other, returning], Context(servedBefore: new HashSet<Guid> { returning.Id }), Weights);

        ranked[0].Technician.ShouldBe(returning);
        ranked[0].Breakdown["continuity"].ShouldBe(10m);
        ranked[1].Breakdown["continuity"].ShouldBe(0m);
    }

    [Fact]
    public void Total_is_the_sum_of_weighted_factors_and_never_exceeds_the_weight_total()
    {
        var ranked = Engine().Rank([Technician("A")], Context(), Weights);

        ranked[0].Total.ShouldBe(ranked[0].Breakdown.Values.Sum());
        ranked[0].Total.ShouldBeLessThanOrEqualTo(100m);
    }
}

public sealed class TechnicianAssignmentTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 5, 10, 0, 0, TimeSpan.Zero);

    private static TechnicianAssignment Offer() =>
        TechnicianAssignment.Offer(Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), Actor.System, null, null, Now, TimeSpan.FromMinutes(10));

    [Fact]
    public void An_offer_can_be_accepted_once_before_it_expires()
    {
        var offer = Offer();

        offer.Accept(Now.AddMinutes(5)).IsSuccess.ShouldBeTrue();
        offer.Accept(Now.AddMinutes(6)).Error!.Code.ShouldBe("offer.closed");
    }

    [Fact]
    public void An_expired_offer_cannot_be_accepted()
    {
        var offer = Offer();

        offer.Accept(Now.AddMinutes(11)).Error!.Code.ShouldBe("offer.expired");
        offer.Expire(Now.AddMinutes(11)).IsSuccess.ShouldBeTrue();
        offer.Status.ShouldBe(AssignmentStatus.Expired);
    }

    [Fact]
    public void Offers_dont_expire_early() =>
        Offer().Expire(Now.AddMinutes(9)).IsFailure.ShouldBeTrue();
}
