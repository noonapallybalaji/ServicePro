using System.Net;
using System.Net.Http.Json;
using ServicePro.Contracts;
using ServicePro.IntegrationTests.Infrastructure;
using ServicePro.Modules.Notifications;
using ServicePro.Modules.ServiceRequests.Application;
using ServicePro.SharedKernel;

namespace ServicePro.IntegrationTests;

/// <summary>The n8n WhatsApp assistant's booking endpoint: key-only, confirmed, idempotent, no secrets.</summary>
public sealed class IntegrationBookingTests(ApiFactory factory)
{
    private const string Path = "/api/v1/integrations/bookings";
    private const string KeyHeader = "X-ServicePro-Integration-Key";

    private static async Task<IntegrationBookingRequest> BookingAsync(TestApi api, string key, string phone, bool confirmed = true)
    {
        var category = await api.CategoryAsync("AC");
        var start = DateTimeOffset.UtcNow.AddDays(1);
        return new IntegrationBookingRequest(
            key,
            confirmed,
            category.Id,
            category.IssueTypes.First().Id,
            "AC not cooling (integration test)",
            "WhatsApp Customer",
            "91" + phone,
            new BookingAddressRequest("Home", "Flat 3", null, null, "Madhapur", "Hyderabad", null, "500081", null, null),
            start,
            start.AddHours(3));
    }

    private static HttpRequestMessage Post(object body, string? key = ApiFactory.IntegrationKey)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, Path) { Content = JsonContent.Create(body, options: TestApi.Json) };
        if (key is not null)
        {
            request.Headers.Add(KeyHeader, key);
        }

        return request;
    }

    [Fact]
    public async Task A_confirmed_booking_is_a_request_with_a_tracking_link_and_no_secrets()
    {
        var api = new TestApi(factory);
        var body = await BookingAsync(api, $"wamid.{Guid.NewGuid():N}", TestApi.RandomPhone());

        var response = await api.Client.SendAsync(Post(body));
        var raw = await response.Content.ReadAsStringAsync();

        response.StatusCode.ShouldBe(HttpStatusCode.OK, raw);
        var booking = (await response.Content.ReadFromJsonAsync<IntegrationBookingResponse>(TestApi.Json))!;
        booking.Status.ShouldBe(ServiceRequestStatus.New);
        booking.AppointmentConfirmed.ShouldBeFalse();
        booking.Duplicate.ShouldBeFalse();
        booking.TrackingUrl.ShouldStartWith("https://track.test/t/");
        raw.ShouldNotContain("accessToken");
        raw.ShouldNotContain("session");
        response.Headers.Contains("Set-Cookie").ShouldBeFalse();
    }

    [Fact]
    public async Task Retries_and_simultaneous_deliveries_of_one_confirmation_create_one_booking()
    {
        var api = new TestApi(factory);
        var body = await BookingAsync(api, $"wamid.{Guid.NewGuid():N}", TestApi.RandomPhone());

        var first = await (await api.Client.SendAsync(Post(body))).Content.ReadFromJsonAsync<IntegrationBookingResponse>(TestApi.Json);
        var retry = await (await api.Client.SendAsync(Post(body))).Content.ReadFromJsonAsync<IntegrationBookingResponse>(TestApi.Json);
        retry!.SrNumber.ShouldBe(first!.SrNumber);
        retry.Duplicate.ShouldBeTrue();

        var raceBody = body with { IdempotencyKey = $"wamid.{Guid.NewGuid():N}" };
        var responses = await Task.WhenAll(Enumerable.Range(0, 6).Select(_ => api.Client.SendAsync(Post(raceBody))));
        responses.ShouldAllBe(r => r.StatusCode == HttpStatusCode.OK);
        var numbers = await Task.WhenAll(responses.Select(async r => (await r.Content.ReadFromJsonAsync<IntegrationBookingResponse>(TestApi.Json))!.SrNumber));
        numbers.Distinct().ShouldHaveSingleItem();
    }

    [Fact]
    public async Task Without_customer_confirmation_nothing_is_booked()
    {
        var api = new TestApi(factory);
        var body = await BookingAsync(api, $"wamid.{Guid.NewGuid():N}", TestApi.RandomPhone(), confirmed: false);

        var response = await api.Client.SendAsync(Post(body));

        response.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        // The same key with confirmation now books — proving nothing was stored the first time.
        var confirmed = await api.Client.SendAsync(Post(body with { CustomerConfirmed = true }));
        (await confirmed.Content.ReadFromJsonAsync<IntegrationBookingResponse>(TestApi.Json))!.Duplicate.ShouldBeFalse();
    }

    [Fact]
    public async Task Only_the_integration_key_opens_the_endpoint_and_it_opens_nothing_else()
    {
        var api = new TestApi(factory);
        var body = await BookingAsync(api, $"wamid.{Guid.NewGuid():N}", TestApi.RandomPhone());

        (await api.Client.SendAsync(Post(body, key: null))).StatusCode.ShouldBe(HttpStatusCode.Unauthorized);
        (await api.Client.SendAsync(Post(body, key: ApiFactory.IntegrationKey + "x"))).StatusCode.ShouldBe(HttpStatusCode.Unauthorized);

        var staff = await new TestApi(factory).AsOwnerAsync();
        (await staff.PostRawAsync(Path, body)).StatusCode.ShouldBeOneOf(HttpStatusCode.Unauthorized, HttpStatusCode.Forbidden);

        foreach (var adminPath in new[] { "/api/v1/admin/service-requests", "/api/v1/admin/customers", "/api/v1/catalog/price-list" })
        {
            var request = new HttpRequestMessage(HttpMethod.Get, adminPath);
            request.Headers.Add(KeyHeader, ApiFactory.IntegrationKey);
            (await api.Client.SendAsync(request)).StatusCode.ShouldBe(HttpStatusCode.Unauthorized, adminPath);
        }
    }

    [Fact]
    public async Task The_customer_hears_received_at_booking_and_confirmed_only_when_staff_confirm()
    {
        var api = new TestApi(factory);
        var body = await BookingAsync(api, $"wamid.{Guid.NewGuid():N}", TestApi.RandomPhone());
        var booking = (await (await api.Client.SendAsync(Post(body))).Content.ReadFromJsonAsync<IntegrationBookingResponse>(TestApi.Json))!;

        var owner = await new TestApi(factory).AsOwnerAsync();
        var job = (await owner.GetAsync<PagedResult<ServiceRequestCard>>($"/api/v1/admin/service-requests?srNumber={booking.SrNumber}")).Items.ShouldHaveSingleItem();
        await factory.DrainOutboxAsync();
        var path = $"/api/v1/admin/notifications?serviceRequestId={job.Id}";
        (await owner.GetAsync<List<NotificationResponse>>(path)).Select(m => m.TemplateCode).ShouldBe(["SR_CREATED"]);

        await owner.PostAsync($"/api/v1/admin/service-requests/{job.Id}/transitions",
            new TransitionRequest(ServiceRequestStatus.ReadyForAssignment, null, null, null, null, null));
        await factory.DrainOutboxAsync();
        (await owner.GetAsync<List<NotificationResponse>>(path)).Select(m => m.TemplateCode).ShouldBe(["SR_CREATED", "SR_CONFIRMED"], ignoreOrder: true);
    }
}
