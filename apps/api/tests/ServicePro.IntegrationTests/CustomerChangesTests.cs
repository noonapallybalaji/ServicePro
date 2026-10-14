using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using ServicePro.Api.Hosting;
using ServicePro.Contracts;
using ServicePro.Contracts.Ports;
using ServicePro.IntegrationTests.Infrastructure;
using ServicePro.Modules.Dispatch.Application;
using ServicePro.Modules.Dispatch.Domain;
using ServicePro.Modules.Identity.Application;
using ServicePro.Modules.Notifications;
using ServicePro.Modules.ServiceRequests.Application;

namespace ServicePro.IntegrationTests;

/// <summary>Customers cancelling and moving their own bookings from "My bookings".</summary>
public sealed class CustomerChangesTests(ApiFactory factory)
{
    private static (DateTimeOffset Start, DateTimeOffset End) Slot(int daysAhead)
    {
        var start = DateTimeOffset.UtcNow.Date.AddDays(daysAhead).AddHours(4.5); // 10:00 IST
        return (start, start.AddHours(3));
    }

    /// <summary>A staff-created job, optionally accepted by Priya, and its customer signed in.</summary>
    internal static async Task<(TestApi Owner, TestApi Customer, Guid JobId)> JobWithSignedInCustomerAsync(ApiFactory factory, bool accepted)
    {
        var owner = await new TestApi(factory).AsOwnerAsync();
        var (customer, jobId) = await owner.NewAcJobAsync();
        if (accepted)
        {
            var priya = await owner.TechnicianAsync("Priya Sharma");
            await owner.AssignAsync(jobId, priya.Id, markAccepted: true);
        }

        var api = new TestApi(factory);
        var code = await api.PostAsync<OtpRequestedResponse>("/api/v1/customer-auth/code", new CustomerCodeRequest(customer.PrimaryPhone));
        var session = await api.PostAsync<CustomerSessionResponse>("/api/v1/customer-auth/verify", new CustomerVerifyRequest(customer.PrimaryPhone, code.DevelopmentCode!, true));
        api.Client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", session.AccessToken);
        return (owner, api, jobId);
    }

    private static async Task<List<string>> MessagesAsync(ApiFactory factory, TestApi owner, Guid jobId)
    {
        await factory.DrainOutboxAsync();
        return [.. (await owner.GetAsync<List<NotificationResponse>>($"/api/v1/admin/notifications?serviceRequestId={jobId}")).Select(m => m.TemplateCode)];
    }

    [Fact]
    public async Task Moving_an_accepted_visit_sends_it_back_to_the_office_and_tells_the_technician()
    {
        var (owner, customer, jobId) = await JobWithSignedInCustomerAsync(factory, accepted: true);
        customer.Client.DefaultRequestHeaders.Authorization.ShouldNotBeNull();
        (await customer.GetAsync<List<MyBookingResponse>>("/api/v1/account/bookings")).Single().CanReschedule.ShouldBeTrue();
        var (start, end) = Slot(3);

        (await customer.Client.PostAsync($"/api/v1/account/bookings/{jobId}/reschedule", Json(new RescheduleBookingRequest(start, end))))
            .StatusCode.ShouldBe(HttpStatusCode.NoContent);

        var job = await owner.GetAsync<ServiceRequestDetail>($"/api/v1/admin/service-requests/{jobId}");
        job.Card.Status.ShouldBe(ServiceRequestStatus.Rescheduled);
        job.PreferredSlotStart.ShouldBe(start);
        var messages = await MessagesAsync(factory, owner, jobId);
        messages.ShouldContain("BOOKING_MOVED");
        messages.ShouldContain("TECH_JOB_MOVED");
        messages.ShouldNotContain("RESCHEDULED"); // one message to the customer, not two
    }

    [Fact]
    public async Task A_booking_can_be_moved_only_as_often_as_the_setting_allows()
    {
        var (_, customer, jobId) = await JobWithSignedInCustomerAsync(factory, accepted: false);

        for (var day = 2; day <= 3; day++)
        {
            var (start, end) = Slot(day);
            (await customer.Client.PostAsync($"/api/v1/account/bookings/{jobId}/reschedule", Json(new RescheduleBookingRequest(start, end))))
                .StatusCode.ShouldBe(HttpStatusCode.NoContent);
        }

        (await customer.GetAsync<List<MyBookingResponse>>("/api/v1/account/bookings")).Single().CanReschedule.ShouldBeFalse();
        var (s, e) = Slot(4);
        (await TestApi.ProblemAsync(await customer.Client.PostAsync($"/api/v1/account/bookings/{jobId}/reschedule", Json(new RescheduleBookingRequest(s, e)))))
            .Code.ShouldBe("booking.reschedule_limit");

        var (past, pastEnd) = Slot(-1);
        var (_, other, otherJob) = await JobWithSignedInCustomerAsync(factory, accepted: false);
        (await TestApi.ProblemAsync(await other.Client.PostAsync($"/api/v1/account/bookings/{otherJob}/reschedule", Json(new RescheduleBookingRequest(past, pastEnd)))))
            .Code.ShouldBe("booking.slot_invalid");
    }

    [Fact]
    public async Task Cancelling_frees_the_technician_until_they_set_out_and_never_touches_other_peoples_bookings()
    {
        var (owner, customer, jobId) = await JobWithSignedInCustomerAsync(factory, accepted: true);
        var (_, stranger, _) = await JobWithSignedInCustomerAsync(factory, accepted: false);

        (await stranger.Client.PostAsync($"/api/v1/account/bookings/{jobId}/cancel", Json(new CancelBookingRequest(null))))
            .StatusCode.ShouldBe(HttpStatusCode.NotFound);

        (await customer.Client.PostAsync($"/api/v1/account/bookings/{jobId}/cancel", Json(new CancelBookingRequest("Fixed it myself"))))
            .StatusCode.ShouldBe(HttpStatusCode.NoContent);

        (await owner.GetAsync<ServiceRequestDetail>($"/api/v1/admin/service-requests/{jobId}")).Card.Status.ShouldBe(ServiceRequestStatus.Cancelled);
        var messages = await MessagesAsync(factory, owner, jobId);
        messages.ShouldContain("TECH_JOB_CANCELLED");
        messages.ShouldContain("SR_CANCELLED");
        (await owner.GetAsync<List<AssignmentResponse>>($"/api/v1/admin/service-requests/{jobId}/assignments"))
            .ShouldAllBe(a => a.Status == AssignmentStatus.Cancelled);
    }

    [Fact]
    public async Task Once_the_technician_is_on_the_way_the_customer_calls_instead()
    {
        var (owner, customer, jobId) = await JobWithSignedInCustomerAsync(factory, accepted: true);
        await owner.PostAsync($"/api/v1/admin/service-requests/{jobId}/transitions",
            new TransitionRequest(ServiceRequestStatus.EnRoute, null, null, null, null, null));

        var booking = (await customer.GetAsync<List<MyBookingResponse>>("/api/v1/account/bookings")).Single();
        booking.CanCancel.ShouldBeFalse();
        booking.CanReschedule.ShouldBeFalse();
        (await TestApi.ProblemAsync(await customer.Client.PostAsync($"/api/v1/account/bookings/{jobId}/cancel", Json(new CancelBookingRequest(null)))))
            .Code.ShouldBe("booking.too_late_to_change");
    }

    private static StringContent Json(object body) => new(JsonSerializer.Serialize(body, TestApi.Json), System.Text.Encoding.UTF8, "application/json");
}

/// <summary>Changes a shared setting, so it runs on its own.</summary>
[Collection(TimeTravelCollection.Name)]
public sealed class CustomerChangeSettingsTests(ApiFactory factory)
{
    [Fact]
    public async Task The_owner_can_turn_online_cancellation_off()
    {
        var (owner, customer, jobId) = await CustomerChangesTests.JobWithSignedInCustomerAsync(factory, accepted: false);
        (await owner.Client.PutAsJsonAsync("/api/v1/admin/settings/booking.customer_can_cancel", new UpdateSettingRequest(JsonSerializer.SerializeToElement(false)), TestApi.Json)).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        try
        {
            (await customer.GetAsync<List<MyBookingResponse>>("/api/v1/account/bookings")).Single().CanCancel.ShouldBeFalse();
            var refused = await customer.PostRawAsync($"/api/v1/account/bookings/{jobId}/cancel", new CancelBookingRequest(null));
            (await TestApi.ProblemAsync(refused)).Code.ShouldBe("booking.change_by_phone");
        }
        finally
        {
            (await owner.Client.PutAsJsonAsync("/api/v1/admin/settings/booking.customer_can_cancel", new UpdateSettingRequest(JsonSerializer.SerializeToElement(true)), TestApi.Json)).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        }
    }
}
