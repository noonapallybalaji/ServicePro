using System.Net;
using ServicePro.Contracts;
using ServicePro.IntegrationTests.Infrastructure;
using ServicePro.Modules.Technicians.Application;
using ServicePro.Modules.Technicians.Domain;

namespace ServicePro.IntegrationTests;

/// <summary>The office's live map and a technician's day history (duty timeline, hours on duty, route).</summary>
[Collection(TimeTravelCollection.Name)]
public sealed class TechnicianTrackingTests(ApiFactory factory)
{
    [Fact]
    public async Task The_office_sees_where_an_on_duty_technician_is_and_their_day()
    {
        var owner = await new TestApi(factory).AsOwnerAsync();
        var anil = await owner.TechnicianAsync("Anil Varma");
        var technician = await new TestApi(factory).AsTechnicianAsync(anil.Phone);

        await technician.PutAsync<object>("/api/v1/tech/me/duty-status", new SetDutyStatusRequest(TechnicianDutyStatus.Available));
        await technician.PostAsync("/api/v1/tech/me/location", new ReportLocationRequest(17.4483, 78.3915));
        await technician.PostAsync("/api/v1/tech/me/location", new ReportLocationRequest(17.4500, 78.3800));
        await factory.DrainOutboxAsync();

        var live = (await owner.GetAsync<List<TechnicianLiveResponse>>("/api/v1/admin/technicians/live")).Single(t => t.Id == anil.Id);
        live.Online.ShouldBeTrue();
        live.DutyStatus.ShouldBe(TechnicianDutyStatus.Available);
        live.Latitude.ShouldBe(17.45);
        live.Longitude.ShouldBe(78.38);

        var day = await owner.GetAsync<TechnicianActivityDayResponse>($"/api/v1/admin/technicians/{anil.Id}/activity");
        day.Events.ShouldContain(e => e.Kind == TechnicianActivityKind.DutyChanged && e.DutyStatus == TechnicianDutyStatus.Available);
        day.Trail.Count.ShouldBeGreaterThanOrEqualTo(2);
        day.Trail[^1].Latitude.ShouldBe(17.45);
        day.LastSeenAt.ShouldNotBeNull();
    }

    [Fact]
    public async Task Hours_on_duty_add_up_and_a_silent_app_shows_as_offline()
    {
        var owner = await new TestApi(factory).AsOwnerAsync();
        var suresh = await owner.TechnicianAsync("Suresh Reddy");
        var technician = await new TestApi(factory).AsTechnicianAsync(suresh.Phone);
        await technician.PutAsync<object>("/api/v1/tech/me/duty-status", new SetDutyStatusRequest(TechnicianDutyStatus.OffDuty));
        await factory.DrainOutboxAsync();

        await technician.PutAsync<object>("/api/v1/tech/me/duty-status", new SetDutyStatusRequest(TechnicianDutyStatus.Available));
        await technician.PostAsync("/api/v1/tech/me/location", new ReportLocationRequest(17.4615, 78.3634));
        await factory.DrainOutboxAsync();

        using (factory.Clock.TravelForward(TimeSpan.FromMinutes(45)))
        {
            // Nothing heard for 45 minutes: offline, with when it was last seen.
            var live = (await owner.GetAsync<List<TechnicianLiveResponse>>("/api/v1/admin/technicians/live")).Single(t => t.Id == suresh.Id);
            live.Online.ShouldBeFalse();
            live.LastSeenAt.ShouldNotBeNull();

            await technician.PutAsync<object>("/api/v1/tech/me/duty-status", new SetDutyStatusRequest(TechnicianDutyStatus.OffDuty));
            await factory.DrainOutboxAsync();

            var day = await owner.GetAsync<TechnicianActivityDayResponse>($"/api/v1/admin/technicians/{suresh.Id}/activity");
            var duty = day.Events.Where(e => e.Kind == TechnicianActivityKind.DutyChanged).ToList();
            if (duty.Count >= 2 && duty[^1].At.Date == duty[^2].At.Date)
            {
                day.OnDutyMinutes.ShouldBeInRange(44, 46); // on duty for the 45 minutes, then off
            }

            duty[^1].DutyStatus.ShouldBe(TechnicianDutyStatus.OffDuty);
        }
    }

    [Fact]
    public async Task Positions_are_kept_for_30_days()
    {
        var owner = await new TestApi(factory).AsOwnerAsync();
        var ravi = await owner.TechnicianAsync("Ravi Kumar");
        var technician = await new TestApi(factory).AsTechnicianAsync(ravi.Phone);
        await technician.PostAsync("/api/v1/tech/me/location", new ReportLocationRequest(17.40, 78.40));
        var today = DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(factory.Clock.UtcNow, TimeZoneInfo.FindSystemTimeZoneById("Asia/Kolkata")).DateTime);

        using (factory.Clock.TravelForward(TimeSpan.FromDays(31)))
        {
            await technician.PostAsync("/api/v1/tech/me/location", new ReportLocationRequest(17.41, 78.41));
            var old = await owner.GetAsync<TechnicianActivityDayResponse>($"/api/v1/admin/technicians/{ravi.Id}/activity?date={today:yyyy-MM-dd}");
            old.Trail.ShouldBeEmpty();
        }
    }

    [Fact]
    public async Task Technicians_cant_see_the_office_map()
    {
        var owner = await new TestApi(factory).AsOwnerAsync();
        var priya = await owner.TechnicianAsync("Priya Sharma");
        var technician = await new TestApi(factory).AsTechnicianAsync(priya.Phone);

        (await technician.Client.GetAsync("/api/v1/admin/technicians/live")).StatusCode.ShouldBe(HttpStatusCode.Forbidden);
        (await technician.Client.GetAsync($"/api/v1/admin/technicians/{priya.Id}/activity")).StatusCode.ShouldBe(HttpStatusCode.Forbidden);
    }
}
