using System.Net.Http.Headers;
using System.Net.Http.Json;
using ServicePro.Contracts;
using ServicePro.Contracts.Ports;
using ServicePro.IntegrationTests.Infrastructure;
using ServicePro.Modules.Customers.Application;
using ServicePro.Modules.Identity.Application;
using ServicePro.Modules.Notifications;
using ServicePro.Modules.Notifications.Application;
using ServicePro.Modules.Notifications.Domain;
using ServicePro.Modules.ServiceRequests.Application;

namespace ServicePro.IntegrationTests;

/// <summary>
/// Every step of the customer journey reaches the customer: always in the site's bell, on WhatsApp,
/// and by SMS for the critical steps when WhatsApp fails.
/// </summary>
public sealed class CustomerJourneyNotificationsTests(ApiFactory factory)
{
    private const string Feed = "/api/v1/account/notifications";

    [Fact]
    public async Task Each_step_reaches_the_customer_in_the_app_and_on_WhatsApp()
    {
        var (owner, customer, phone, jobId) = await NewJobAsync(onWhatsApp: true);
        await ScheduleVisitAsync(owner, jobId);
        var priya = await owner.TechnicianAsync("Priya Sharma");
        await owner.AssignAsync(jobId, priya.Id, markAccepted: true);
        await TransitionAsync(owner, jobId, ServiceRequestStatus.EnRoute);
        await TransitionAsync(owner, jobId, ServiceRequestStatus.Arrived);
        await factory.DrainOutboxAsync();

        var bell = await customer.GetAsync<CustomerNotificationsResponse>(Feed);
        bell.Items.Select(n => n.Title).ShouldBe(
            ["Your completion code", "Technician on the way", "Technician assigned", "Visit scheduled", "Booking confirmed"]);
        bell.Items.Single(n => n.Title == "Visit scheduled").Body.ShouldContain("10:00 to 13:00");

        var sent = await MessagesAsync(owner, jobId);
        string[] journey = ["SR_CONFIRMED", "VISIT_SCHEDULED", "TECH_ASSIGNED", "TECH_EN_ROUTE", "COMPLETION_CODE"];
        sent.Where(m => m.Channel == NotificationChannel.WhatsApp && m.RecipientType == RecipientType.Customer)
            .Select(m => m.TemplateCode).ShouldBe(journey, ignoreOrder: true);
        sent.Where(m => m.RecipientType == RecipientType.Customer).ShouldAllBe(m => m.Status == NotificationStatus.Sent && m.RecipientAddress == phone);
        sent.ShouldNotContain(m => m.Channel == NotificationChannel.Sms); // WhatsApp worked: no SMS needed
    }

    [Fact]
    public async Task When_WhatsApp_fails_the_critical_steps_go_by_SMS_and_the_bell_still_has_everything()
    {
        var (owner, customer, _, jobId) = await NewJobAsync(onWhatsApp: false);
        await ScheduleVisitAsync(owner, jobId);
        var priya = await owner.TechnicianAsync("Priya Sharma");
        await owner.AssignAsync(jobId, priya.Id, markAccepted: true);
        await TransitionAsync(owner, jobId, ServiceRequestStatus.EnRoute);
        await factory.DrainOutboxAsync();

        var customerMessages = (await MessagesAsync(owner, jobId)).Where(m => m.RecipientType == RecipientType.Customer).ToList();
        customerMessages.Where(m => m.Channel == NotificationChannel.WhatsApp).ShouldAllBe(m => m.Status == NotificationStatus.Failed);
        customerMessages.Where(m => m.Channel == NotificationChannel.Sms).Select(m => m.TemplateCode)
            .ShouldBe(["SR_CONFIRMED", "VISIT_SCHEDULED", "TECH_EN_ROUTE"], ignoreOrder: true); // critical steps only
        customerMessages.Where(m => m.Channel == NotificationChannel.Sms).ShouldAllBe(m => m.Status == NotificationStatus.Sent);

        // The bell doesn't depend on WhatsApp.
        (await customer.GetAsync<CustomerNotificationsResponse>(Feed)).Items.Select(n => n.Title)
            .ShouldBe(["Technician on the way", "Technician assigned", "Visit scheduled", "Booking confirmed"]);
    }

    [Fact]
    public async Task A_repair_that_cant_be_done_is_explained_to_the_customer()
    {
        var (owner, customer, _, jobId) = await NewJobAsync(onWhatsApp: true);
        var priya = await owner.TechnicianAsync("Priya Sharma");
        await owner.AssignAsync(jobId, priya.Id, markAccepted: true);
        foreach (var status in new[] { ServiceRequestStatus.EnRoute, ServiceRequestStatus.Arrived, ServiceRequestStatus.Diagnosing })
        {
            await TransitionAsync(owner, jobId, status);
        }

        await owner.PostAsync($"/api/v1/admin/service-requests/{jobId}/transitions",
            new TransitionRequest(ServiceRequestStatus.UnableToRepair, "PART_NOT_AVAILABLE", null, null, null, null));
        await factory.DrainOutboxAsync();

        var item = (await customer.GetAsync<CustomerNotificationsResponse>(Feed)).Items[0];
        item.Title.ShouldBe("Couldn't be repaired");
        item.Body.ShouldContain("Only the visiting charge");
        (await MessagesAsync(owner, jobId)).ShouldContain(m => m.TemplateCode == "UNABLE_TO_REPAIR" && m.Channel == NotificationChannel.WhatsApp);
    }

    [Fact]
    public async Task Sign_in_and_booking_codes_go_to_the_phone_never_to_the_bell()
    {
        var api = new TestApi(factory);
        var phone = TestApi.RandomPhone();
        await api.PostAsync<BookingCodeResponse>("/api/v1/public/bookings/code", new BookingCodeRequest(phone));

        var owner = await new TestApi(factory).AsOwnerAsync();
        var codes = (await owner.GetAsync<List<NotificationResponse>>("/api/v1/admin/notifications?take=200"))
            .Where(m => m.TemplateCode == "OTP_BOOKING" && m.RecipientAddress.EndsWith(phone[^10..], StringComparison.Ordinal)).ToList();
        codes.ShouldNotBeEmpty();
        codes.ShouldAllBe(m => m.Channel == NotificationChannel.WhatsApp || m.Channel == NotificationChannel.Sms);
        codes.ShouldContain(m => m.Status == NotificationStatus.Sent);
    }

    /// <summary>A staff-created job for a new customer who is signed in to the site.</summary>
    private async Task<(TestApi Owner, TestApi Customer, string Phone, Guid JobId)> NewJobAsync(bool onWhatsApp)
    {
        var owner = await new TestApi(factory).AsOwnerAsync();
        var created = await owner.PostAsync<CustomerResponse>("/api/v1/admin/customers", new CreateCustomerRequest(
            "Meera Iyer", TestApi.RandomPhone(), null, null, "en", RequestChannel.Phone, null,
            new AddressInput("Home", "Flat 7", null, null, "Kondapur", "Hyderabad", "Telangana", "500084", 17.4615, 78.3634)));
        if (!onWhatsApp)
        {
            FakeWhatsApp.NotOnWhatsApp[created.PrimaryPhone] = true;
        }

        var category = await owner.CategoryAsync("AC");
        var job = await owner.PostAsync<ServicePro.BuildingBlocks.Web.IdResponse>("/api/v1/admin/service-requests", new CreateServiceRequestRequest(
            created.Id, created.Addresses[0].Id, null, category.Id, category.IssueTypes[0].Id, "Not cooling", RequestChannel.Phone, Priority.Normal,
            null, null, null, null, null, false, null));

        var customer = new TestApi(factory);
        var code = await customer.PostAsync<OtpRequestedResponse>("/api/v1/customer-auth/code", new CustomerCodeRequest(created.PrimaryPhone));
        var session = await customer.PostAsync<CustomerSessionResponse>("/api/v1/customer-auth/verify", new CustomerVerifyRequest(created.PrimaryPhone, code.DevelopmentCode!, true));
        customer.Client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", session.AccessToken);
        return (owner, customer, created.PrimaryPhone, job.Id);
    }

    /// <summary>The office agrees tomorrow 10:00–13:00 (India time) with the customer.</summary>
    private static async Task ScheduleVisitAsync(TestApi owner, Guid jobId)
    {
        var job = await owner.GetAsync<ServiceRequestDetail>($"/api/v1/admin/service-requests/{jobId}");
        var ist = TimeSpan.FromHours(5.5);
        var day = DateTimeOffset.UtcNow.ToOffset(ist).Date.AddDays(1);
        var start = new DateTimeOffset(day.AddHours(10), ist);
        var response = await owner.Client.PutAsJsonAsync($"/api/v1/admin/service-requests/{jobId}", new UpdateServiceRequestRequest(
            null, job.IssueTypeId, job.ProblemDescription, job.Card.Priority, null, null, start, start.AddHours(3)), TestApi.Json);
        response.EnsureSuccessStatusCode();
    }

    private static Task TransitionAsync(TestApi owner, Guid jobId, ServiceRequestStatus to) =>
        owner.PostAsync($"/api/v1/admin/service-requests/{jobId}/transitions", new TransitionRequest(to, null, null, null, null, null));

    private async Task<List<NotificationResponse>> MessagesAsync(TestApi owner, Guid jobId)
    {
        await factory.DrainOutboxAsync();
        return await owner.GetAsync<List<NotificationResponse>>($"/api/v1/admin/notifications?serviceRequestId={jobId}");
    }
}
