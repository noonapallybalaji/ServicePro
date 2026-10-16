using System.Net;
using Microsoft.Extensions.DependencyInjection;
using ServicePro.Contracts;
using ServicePro.Contracts.Ports;
using ServicePro.IntegrationTests.Infrastructure;
using ServicePro.Modules.ServiceRequests.Application;
using ServicePro.Modules.Technicians.Application;

namespace ServicePro.IntegrationTests;

/// <summary>While the technician is on the way, the tracking page shows where they are and roughly when they'll arrive.</summary>
public sealed class LiveTrackingTests(ApiFactory factory)
{
    /// <summary>A job Priya has accepted, her signed-in phone and the tracking token.</summary>
    private async Task<(TestApi Technician, Guid JobId, string Token)> AcceptedJobAsync()
    {
        var owner = await new TestApi(factory).AsOwnerAsync();
        var (_, jobId) = await owner.NewAcJobAsync();
        var priya = await owner.TechnicianAsync("Priya Sharma");
        await owner.AssignAsync(jobId, priya.Id, markAccepted: true);
        var technician = await new TestApi(factory).AsTechnicianAsync(priya.Phone);
        var detail = await owner.GetAsync<ServiceRequestDetail>($"/api/v1/admin/service-requests/{jobId}");
        return (technician, jobId, detail.TrackingPath.Split('/')[^1]);
    }

    private static Task Move(TestApi technician, Guid jobId, ServiceRequestStatus status) =>
        technician.PostAsync($"/api/v1/tech/jobs/{jobId}/transitions", new TransitionRequest(status, null, null, null, null, null));

    [Fact]
    public async Task The_customer_sees_the_technician_on_the_way_and_not_before_or_after()
    {
        var (technician, jobId, token) = await AcceptedJobAsync();
        var customer = new TestApi(factory);

        // Hitech City, about 2.5 km from the test address in Kondapur.
        await technician.PostAsync("/api/v1/tech/me/location", new ReportLocationRequest(17.4435, 78.3772));
        (await customer.GetAsync<TrackingResponse>($"/api/v1/public/track/{token}")).Live.ShouldBeNull();

        await Move(technician, jobId, ServiceRequestStatus.EnRoute);
        await technician.PostAsync("/api/v1/tech/me/location", new ReportLocationRequest(17.4435, 78.3772));
        var live = (await customer.GetAsync<TrackingResponse>($"/api/v1/public/track/{token}")).Live;
        live.ShouldNotBeNull();
        live.Latitude.ShouldBe(17.4435);
        live.EtaMinutes.ShouldBe(15);

        await Move(technician, jobId, ServiceRequestStatus.Arrived);
        (await customer.GetAsync<TrackingResponse>($"/api/v1/public/track/{token}")).Live.ShouldBeNull();
    }

    [Fact]
    public async Task Anyone_with_a_live_link_can_listen_for_updates()
    {
        var (_, jobId, token) = await AcceptedJobAsync();

        var negotiate = await factory.CreateClient().PostAsync("/hubs/tracking/negotiate?negotiateVersion=1", null);
        negotiate.StatusCode.ShouldBe(HttpStatusCode.OK);

        await using var scope = factory.Services.CreateAsyncScope();
        var requests = scope.ServiceProvider.GetRequiredService<IServiceRequestWorkflow>();
        (await requests.FindTrackableIdAsync(token, CancellationToken.None)).ShouldBe(jobId);
        (await requests.FindTrackableIdAsync("not-a-real-token", CancellationToken.None)).ShouldBeNull();
    }

    [Theory]
    [InlineData("https://tech.test", true)]
    [InlineData("https://track.test", true)]
    [InlineData("https://evil.test", false)]
    public async Task Live_connections_are_allowed_only_from_our_sites(string origin, bool allowed)
    {
        using var preflight = new HttpRequestMessage(HttpMethod.Options, "/hubs/tech/negotiate?negotiateVersion=1");
        preflight.Headers.Add("Origin", origin);
        preflight.Headers.Add("Access-Control-Request-Method", "POST");
        preflight.Headers.Add("Access-Control-Request-Headers", "authorization,x-requested-with,x-signalr-user-agent");

        var response = await factory.CreateClient().SendAsync(preflight);

        response.Headers.TryGetValues("Access-Control-Allow-Origin", out var allowedOrigin);
        (allowedOrigin?.SingleOrDefault() == origin).ShouldBe(allowed);
        if (allowed)
        {
            response.Headers.GetValues("Access-Control-Allow-Credentials").Single().ShouldBe("true");
        }
    }

    [Fact]
    public async Task Other_endpoints_stay_same_origin()
    {
        using var preflight = new HttpRequestMessage(HttpMethod.Options, "/api/v1/catalog/categories");
        preflight.Headers.Add("Origin", "https://tech.test");
        preflight.Headers.Add("Access-Control-Request-Method", "GET");

        var response = await factory.CreateClient().SendAsync(preflight);

        response.Headers.Contains("Access-Control-Allow-Origin").ShouldBeFalse();
    }
}
