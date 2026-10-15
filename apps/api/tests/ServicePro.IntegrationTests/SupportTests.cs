using System.Net;
using System.Net.Http.Json;
using ServicePro.Contracts;
using ServicePro.IntegrationTests.Infrastructure;
using ServicePro.Modules.Notifications;
using ServicePro.Modules.ServiceRequests.Application;
using ServicePro.Modules.Support.Application;
using ServicePro.Modules.Support.Domain;

namespace ServicePro.IntegrationTests;

/// <summary>Support tickets: customers ask, staff answer, the WhatsApp assistant hands over.</summary>
public sealed class SupportTests(ApiFactory factory)
{
    private async Task<List<NotificationResponse>> RecentMessagesAsync(TestApi owner)
    {
        await factory.DrainOutboxAsync();
        return await owner.GetAsync<List<NotificationResponse>>("/api/v1/admin/notifications?take=200");
    }

    [Fact]
    public async Task A_customer_asks_about_a_booking_and_hears_back_from_the_office()
    {
        var (owner, customer, jobId) = await CustomerChangesTests.JobWithSignedInCustomerAsync(factory, accepted: false);

        var opened = await customer.PostAsync<CustomerTicketResponse>("/api/v1/account/support",
            new OpenTicketRequest(jobId, TicketCategory.LateTechnician, "Nobody has called me about the visit yet."));
        opened.Number.ShouldStartWith("TK-");
        opened.SrNumber.ShouldNotBeNull();

        var queue = await owner.GetAsync<List<StaffTicketListItem>>($"/api/v1/admin/support?serviceRequestId={jobId}");
        var item = queue.ShouldHaveSingleItem();
        item.WaitingForUs.ShouldBeTrue();
        item.Overdue.ShouldBeFalse();

        await owner.PostAsync<StaffTicketResponse>($"/api/v1/admin/support/{item.Id}/messages", new StaffReplyRequest("Checked with dispatch: possible double booking.", Internal: true));
        var replied = await owner.PostAsync<StaffTicketResponse>($"/api/v1/admin/support/{item.Id}/messages",
            new StaffReplyRequest("Sorry about that! Ravi will call you within the hour.", Internal: false));
        replied.Status.ShouldBe(TicketStatus.WaitingOnCustomer);
        replied.FirstResponseAt.ShouldNotBeNull();
        (await RecentMessagesAsync(owner)).ShouldContain(m => m.TemplateCode == "SUPPORT_REPLY" && m.RenderedBody.Contains(opened.Number));

        // The customer sees the reply but never the internal note.
        var thread = await customer.GetAsync<CustomerTicketResponse>($"/api/v1/account/support/{opened.Number}");
        thread.Messages.Select(m => m.AuthorLabel).ShouldBe(["You", "Support team"]);
        thread.Messages.ShouldNotContain(m => m.Body.Contains("double booking"));

        (await customer.PostAsync<CustomerTicketResponse>($"/api/v1/account/support/{opened.Number}/messages", new TicketMessageRequest("Thanks, he called.")))
            .Status.ShouldBe(TicketStatus.Open);
        (await customer.PostAsync<CustomerTicketResponse>($"/api/v1/account/support/{opened.Number}/resolve", null)).Status.ShouldBe(TicketStatus.Resolved);
        (await customer.GetAsync<List<TicketSummary>>("/api/v1/account/support")).ShouldHaveSingleItem().Status.ShouldBe(TicketStatus.Resolved);
    }

    [Fact]
    public async Task Customers_only_reach_their_own_tickets_and_bookings()
    {
        var (_, customer, jobId) = await CustomerChangesTests.JobWithSignedInCustomerAsync(factory, accepted: false);
        var (_, stranger, _) = await CustomerChangesTests.JobWithSignedInCustomerAsync(factory, accepted: false);
        var opened = await customer.PostAsync<CustomerTicketResponse>("/api/v1/account/support", new OpenTicketRequest(null, TicketCategory.Payment, "Was I charged twice?"));

        (await stranger.Client.GetAsync($"/api/v1/account/support/{opened.Number}")).StatusCode.ShouldBe(HttpStatusCode.NotFound);
        (await stranger.PostRawAsync("/api/v1/account/support", new OpenTicketRequest(jobId, TicketCategory.Booking, "Not my booking")))
            .StatusCode.ShouldBe(HttpStatusCode.NotFound);
        (await new TestApi(factory).Client.GetAsync("/api/v1/account/support")).StatusCode.ShouldBe(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Damage_reports_are_high_priority_with_a_shorter_reply_target()
    {
        var (owner, customer, jobId) = await CustomerChangesTests.JobWithSignedInCustomerAsync(factory, accepted: false);

        await customer.PostAsync<CustomerTicketResponse>("/api/v1/account/support",
            new OpenTicketRequest(jobId, TicketCategory.DamageOrSafety, "The wall was scratched while moving the AC."));

        var item = (await owner.GetAsync<List<StaffTicketListItem>>($"/api/v1/admin/support?serviceRequestId={jobId}")).Single();
        item.HighPriority.ShouldBeTrue();
        (item.FirstResponseDueAt - item.CreatedAt).ShouldBe(TimeSpan.FromMinutes(60), TimeSpan.FromSeconds(5));
    }

    [Fact]
    public async Task The_whatsapp_assistant_hands_over_once_per_conversation_and_replies_go_back_on_whatsapp()
    {
        var owner = await new TestApi(factory).AsOwnerAsync();
        var phone = TestApi.RandomPhone();
        var body = new AssistantTicketRequest($"wamid.{Guid.NewGuid():N}", phone, "Kavya", TicketCategory.Other, "Customer asks whether we repair water purifiers.");

        var unauthorised = new HttpRequestMessage(HttpMethod.Post, "/api/v1/integrations/support-tickets") { Content = JsonContent.Create(body, options: TestApi.Json) };
        (await new TestApi(factory).Client.SendAsync(unauthorised)).StatusCode.ShouldBe(HttpStatusCode.Unauthorized);

        var first = await SendAsync(body);
        var retry = await SendAsync(body);
        retry.Number.ShouldBe(first.Number);
        retry.Duplicate.ShouldBeTrue();
        first.Message.ShouldContain(first.Number);

        var item = (await owner.GetAsync<List<StaffTicketListItem>>("/api/v1/admin/support?status=OPEN")).Single(t => t.Number == first.Number);
        item.Channel.ShouldBe(RequestChannel.WhatsApp);
        item.CustomerName.ShouldBe("Kavya");

        await owner.PostAsync<StaffTicketResponse>($"/api/v1/admin/support/{item.Id}/messages", new StaffReplyRequest("Not yet, sorry! Only AC, fridge, washer, TV and microwave.", false));
        (await RecentMessagesAsync(owner)).ShouldContain(m => m.TemplateCode == "SUPPORT_REPLY_WHATSAPP" && m.RecipientAddress == "+91" + phone);
    }

    [Fact]
    public async Task Deleting_the_account_removes_what_the_customer_wrote_to_support()
    {
        var (owner, customer, jobId) = await CustomerChangesTests.JobWithSignedInCustomerAsync(factory, accepted: false);
        await customer.PostAsync<CustomerTicketResponse>("/api/v1/account/support", new OpenTicketRequest(jobId, TicketCategory.Other, "My gate code is 4512."));
        (await customer.Client.PostAsJsonAsync($"/api/v1/account/bookings/{jobId}/cancel", new CancelBookingRequest(null), TestApi.Json)).EnsureSuccessStatusCode();

        (await customer.Client.DeleteAsync("/api/v1/account")).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        await factory.DrainOutboxAsync();

        var item = (await owner.GetAsync<List<StaffTicketListItem>>($"/api/v1/admin/support?serviceRequestId={jobId}")).Single();
        (await owner.GetAsync<StaffTicketResponse>($"/api/v1/admin/support/{item.Id}")).Messages.ShouldAllBe(m => !m.Body.Contains("4512"));
    }

    [Fact]
    public async Task A_damage_report_carries_photos_that_only_staff_can_open()
    {
        var (owner, customer, jobId) = await CustomerChangesTests.JobWithSignedInCustomerAsync(factory, accepted: false);
        var (_, stranger, _) = await CustomerChangesTests.JobWithSignedInCustomerAsync(factory, accepted: false);
        var opened = await customer.PostAsync<CustomerTicketResponse>("/api/v1/account/support",
            new OpenTicketRequest(jobId, TicketCategory.DamageOrSafety, "The wall was scratched."));

        (await customer.Client.PostAsync($"/api/v1/account/support/{opened.Number}/photos", Photo())).StatusCode.ShouldBe(HttpStatusCode.OK);
        (await stranger.Client.PostAsync($"/api/v1/account/support/{opened.Number}/photos", Photo())).StatusCode.ShouldBe(HttpStatusCode.NotFound);
        (await customer.GetAsync<CustomerTicketResponse>($"/api/v1/account/support/{opened.Number}")).PhotoCount.ShouldBe(1);

        var item = (await owner.GetAsync<List<StaffTicketListItem>>($"/api/v1/admin/support?serviceRequestId={jobId}")).Single();
        var photo = (await owner.GetAsync<StaffTicketResponse>($"/api/v1/admin/support/{item.Id}")).Photos!.ShouldHaveSingleItem();
        var file = await owner.Client.GetAsync(photo.Url);
        file.StatusCode.ShouldBe(HttpStatusCode.OK);
        file.Content.Headers.ContentType!.MediaType.ShouldBe("image/png");
        (await customer.Client.GetAsync(photo.Url)).StatusCode.ShouldBeOneOf(HttpStatusCode.Unauthorized, HttpStatusCode.Forbidden);
    }

    private static MultipartFormDataContent Photo()
    {
        var form = new MultipartFormDataContent();
        var image = new ByteArrayContent(Convert.FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="));
        image.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("image/png");
        form.Add(image, "file", "damage.png");
        return form;
    }

    private async Task<AssistantTicketResponse> SendAsync(AssistantTicketRequest body)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/v1/integrations/support-tickets") { Content = JsonContent.Create(body, options: TestApi.Json) };
        request.Headers.Add("X-ServicePro-Integration-Key", ApiFactory.IntegrationKey);
        var response = await new TestApi(factory).Client.SendAsync(request);
        response.StatusCode.ShouldBe(HttpStatusCode.OK, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<AssistantTicketResponse>(TestApi.Json))!;
    }
}
