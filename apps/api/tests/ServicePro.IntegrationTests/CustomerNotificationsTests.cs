using ServicePro.IntegrationTests.Infrastructure;
using ServicePro.Modules.Notifications.Application;

namespace ServicePro.IntegrationTests;

/// <summary>The customer site's notification bell, with read state kept on the server.</summary>
public sealed class CustomerNotificationsTests(ApiFactory factory)
{
    private const string Feed = "/api/v1/account/notifications";

    [Fact]
    public async Task Customers_see_their_own_booking_updates_but_never_their_codes()
    {
        var (_, customer, _) = await CustomerChangesTests.JobWithSignedInCustomerAsync(factory, accepted: true);
        var (_, stranger, _) = await CustomerChangesTests.JobWithSignedInCustomerAsync(factory, accepted: false);
        await factory.DrainOutboxAsync();

        var mine = await customer.GetAsync<CustomerNotificationsResponse>(Feed);
        mine.Items.ShouldContain(n => n.Title == "Technician assigned");
        mine.Items.Select(n => n.Id).ShouldBeUnique();
        mine.UnreadCount.ShouldBe(mine.Items.Count); // nothing opened yet

        // Signing in sent each of them a login code: it isn't in the feed, and nobody sees another's messages.
        var theirs = await stranger.GetAsync<CustomerNotificationsResponse>(Feed);
        theirs.Items.ShouldNotContain(n => n.Title == "Technician assigned");
        theirs.Items.Select(n => n.Id).Intersect(mine.Items.Select(n => n.Id)).ShouldBeEmpty();
        mine.Items.Concat(theirs.Items).ShouldAllBe(n => !n.Body.Contains("is your code", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task Opening_an_update_marks_it_read_on_every_device_and_mark_all_clears_the_rest()
    {
        var (_, customer, _) = await CustomerChangesTests.JobWithSignedInCustomerAsync(factory, accepted: true);
        await factory.DrainOutboxAsync();
        var before = await customer.GetAsync<CustomerNotificationsResponse>(Feed);
        before.UnreadCount.ShouldBeGreaterThan(1);
        var first = before.Items[0];

        var afterOne = await customer.PostAsync<CustomerNotificationsResponse>($"{Feed}/{first.Id}/read", new { });
        afterOne.Items.Single(n => n.Id == first.Id).IsRead.ShouldBeTrue();
        afterOne.UnreadCount.ShouldBe(before.UnreadCount - 1);

        // Stored on the server: a fresh request (another device) sees the same.
        (await customer.GetAsync<CustomerNotificationsResponse>(Feed)).UnreadCount.ShouldBe(before.UnreadCount - 1);

        var afterAll = await customer.PostAsync<CustomerNotificationsResponse>($"{Feed}/read-all", new { });
        afterAll.UnreadCount.ShouldBe(0);
        afterAll.Items.ShouldAllBe(n => n.IsRead);
    }

    [Fact]
    public async Task Someone_elses_notification_cant_be_marked()
    {
        var (_, someone, _) = await CustomerChangesTests.JobWithSignedInCustomerAsync(factory, accepted: true);
        var (_, customer, _) = await CustomerChangesTests.JobWithSignedInCustomerAsync(factory, accepted: false);
        await factory.DrainOutboxAsync();
        var theirs = (await someone.GetAsync<CustomerNotificationsResponse>(Feed)).Items[0];

        ((int)(await customer.PostRawAsync($"{Feed}/{theirs.Id}/read", new { })).StatusCode).ShouldBe(404);
        (await someone.GetAsync<CustomerNotificationsResponse>(Feed)).Items.Single(n => n.Id == theirs.Id).IsRead.ShouldBeFalse();
    }

    [Fact]
    public async Task Signed_out_visitors_get_nothing()
    {
        var response = await new TestApi(factory).Client.GetAsync(Feed);
        ((int)response.StatusCode).ShouldBe(401);
    }
}
