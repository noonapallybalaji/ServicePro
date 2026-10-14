using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using ServicePro.Api.Hosting;
using ServicePro.Contracts;
using ServicePro.IntegrationTests.Infrastructure;
using ServicePro.Modules.Dispatch.Application;
using ServicePro.Modules.Dispatch.Domain;
using ServicePro.Modules.Notifications;
using ServicePro.Modules.ServiceRequests.Application;
using ServicePro.Modules.Technicians.Application;

namespace ServicePro.IntegrationTests;

/// <summary>Auto-confirm and auto-offer. They change shared settings, so they run on their own.</summary>
[Collection(TimeTravelCollection.Name)]
public sealed class AutoDispatchTests(ApiFactory factory)
{
    private static async Task SetAsync(TestApi owner, string key, object value) =>
        (await owner.Client.PutAsJsonAsync($"/api/v1/admin/settings/{key}", new UpdateSettingRequest(JsonSerializer.SerializeToElement(value)), TestApi.Json))
            .StatusCode.ShouldBe(HttpStatusCode.NoContent);

    [Fact]
    public async Task With_auto_offer_on_a_job_goes_to_the_best_technician_then_the_next_and_then_waits_for_staff()
    {
        var owner = await new TestApi(factory).AsOwnerAsync();
        await SetAsync(owner, "dispatch.auto_offer", true);
        await SetAsync(owner, "dispatch.auto_offer_max_attempts", 2);
        try
        {
            var jobId = await JobDuringShiftHoursAsync(owner);
            await factory.DrainOutboxAsync();

            var first = (await owner.GetAsync<List<AssignmentResponse>>($"/api/v1/admin/service-requests/{jobId}/assignments")).ShouldHaveSingleItem();
            first.Status.ShouldBe(AssignmentStatus.Offered);
            var firstTech = await TechnicianAsync(owner, first.TechnicianId);
            await DeclineAsync(firstTech.Phone, jobId);
            await factory.DrainOutboxAsync();

            var history = await owner.GetAsync<List<AssignmentResponse>>($"/api/v1/admin/service-requests/{jobId}/assignments");
            history.Count.ShouldBe(2);
            var second = history.Single(a => a.Status == AssignmentStatus.Offered);
            second.TechnicianId.ShouldNotBe(first.TechnicianId);

            await DeclineAsync((await TechnicianAsync(owner, second.TechnicianId)).Phone, jobId);
            await factory.DrainOutboxAsync();

            // Two offers is the limit: the job waits for staff.
            (await owner.GetAsync<List<AssignmentResponse>>($"/api/v1/admin/service-requests/{jobId}/assignments")).Count.ShouldBe(2);
            (await owner.GetAsync<ServiceRequestDetail>($"/api/v1/admin/service-requests/{jobId}")).Card.Status.ShouldBe(ServiceRequestStatus.ReadyForAssignment);
        }
        finally
        {
            await SetAsync(owner, "dispatch.auto_offer", false);
            await SetAsync(owner, "dispatch.auto_offer_max_attempts", 3);
        }
    }

    [Fact]
    public async Task Auto_offer_is_off_by_default_and_never_overrides_a_staff_unassignment()
    {
        var owner = await new TestApi(factory).AsOwnerAsync();
        var (_, jobId) = await owner.NewAcJobAsync();
        await factory.DrainOutboxAsync();
        (await owner.GetAsync<List<AssignmentResponse>>($"/api/v1/admin/service-requests/{jobId}/assignments")).ShouldBeEmpty();

        await SetAsync(owner, "dispatch.auto_offer", true);
        try
        {
            var priya = await owner.TechnicianAsync("Priya Sharma");
            await owner.AssignAsync(jobId, priya.Id, markAccepted: true);
            await owner.PostAsync($"/api/v1/admin/service-requests/{jobId}/unassign", new UnassignRequest("Customer asked for someone else"));
            await factory.DrainOutboxAsync();

            (await owner.GetAsync<List<AssignmentResponse>>($"/api/v1/admin/service-requests/{jobId}/assignments"))
                .ShouldAllBe(a => a.Status == AssignmentStatus.Cancelled);
        }
        finally
        {
            await SetAsync(owner, "dispatch.auto_offer", false);
        }
    }

    [Fact]
    public async Task With_auto_confirm_on_a_whatsapp_booking_is_confirmed_at_once_but_the_time_is_not_promised()
    {
        var owner = await new TestApi(factory).AsOwnerAsync();
        await SetAsync(owner, "booking.auto_confirm_whatsapp", true);
        try
        {
            var category = await owner.CategoryAsync("AC");
            var start = DateTimeOffset.UtcNow.AddDays(1);
            var request = new HttpRequestMessage(HttpMethod.Post, "/api/v1/integrations/bookings")
            {
                Content = JsonContent.Create(new IntegrationBookingRequest($"wamid.{Guid.NewGuid():N}", true, category.Id, null, "AC not cooling", "Auto Confirm",
                    TestApi.RandomPhone(), new BookingAddressRequest("Home", "Flat 3", null, null, "Madhapur", "Hyderabad", null, "500081", null, null),
                    start, start.AddHours(3)), options: TestApi.Json),
            };
            request.Headers.Add("X-ServicePro-Integration-Key", ApiFactory.IntegrationKey);
            var booking = (await (await new TestApi(factory).Client.SendAsync(request)).Content.ReadFromJsonAsync<IntegrationBookingResponse>(TestApi.Json))!;

            booking.Status.ShouldBe(ServiceRequestStatus.ReadyForAssignment);
            booking.AppointmentConfirmed.ShouldBeFalse();
            var job = (await owner.GetAsync<ServicePro.SharedKernel.PagedResult<ServiceRequestCard>>($"/api/v1/admin/service-requests?srNumber={booking.SrNumber}")).Items.Single();
            await factory.DrainOutboxAsync();
            (await owner.GetAsync<List<NotificationResponse>>($"/api/v1/admin/notifications?serviceRequestId={job.Id}"))
                .Select(m => m.TemplateCode).ShouldBe(["SR_CONFIRMED"]);
        }
        finally
        {
            await SetAsync(owner, "booking.auto_confirm_whatsapp", false);
        }
    }

    /// <summary>An AC job in Kondapur whose preferred time is 11:00 IST on the next working day, when technicians are on shift.</summary>
    private static async Task<Guid> JobDuringShiftHoursAsync(TestApi owner)
    {
        var ist = TimeSpan.FromHours(5.5);
        var day = DateTimeOffset.UtcNow.ToOffset(ist).Date.AddDays(1);
        while (day.DayOfWeek == DayOfWeek.Sunday)
        {
            day = day.AddDays(1);
        }

        var start = new DateTimeOffset(day.AddHours(11), ist);
        var customer = await owner.PostAsync<ServicePro.Modules.Customers.Application.CustomerResponse>("/api/v1/admin/customers",
            new ServicePro.Modules.Customers.Application.CreateCustomerRequest("Auto Dispatch", TestApi.RandomPhone(), null, null, "en", RequestChannel.Phone, null,
                new ServicePro.Modules.Customers.Application.AddressInput("Home", "Flat 1", null, null, "Kondapur", "Hyderabad", "Telangana", "500084", 17.4615, 78.3634)));
        var category = await owner.CategoryAsync("AC");
        var created = await owner.PostAsync<ServicePro.BuildingBlocks.Web.IdResponse>("/api/v1/admin/service-requests", new CreateServiceRequestRequest(
            customer.Id, customer.Addresses[0].Id, null, category.Id, category.IssueTypes[0].Id, "Auto-dispatch test", RequestChannel.Phone, Priority.Normal,
            start, start.AddHours(3), null, null, null, false, null));
        return created.Id;
    }

    private static async Task<TechnicianResponse> TechnicianAsync(TestApi owner, Guid technicianId) =>
        await owner.GetAsync<TechnicianResponse>($"/api/v1/admin/technicians/{technicianId}");

    private async Task DeclineAsync(string phone, Guid jobId)
    {
        var technician = await new TestApi(factory).AsTechnicianAsync(phone);
        var offer = (await technician.GetAsync<List<OfferResponse>>("/api/v1/tech/offers")).Single(o => o.ServiceRequestId == jobId);
        await technician.PostAsync($"/api/v1/tech/offers/{offer.AssignmentId}/decline", new DeclineOfferRequest("Busy"));
    }
}
