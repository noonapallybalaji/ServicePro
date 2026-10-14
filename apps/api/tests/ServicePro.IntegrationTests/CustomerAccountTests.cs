using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using ServicePro.Contracts.Ports;
using ServicePro.Contracts;
using ServicePro.IntegrationTests.Infrastructure;
using ServicePro.Modules.Customers.Application;
using ServicePro.Modules.Identity.Application;
using ServicePro.Modules.Notifications;
using ServicePro.Modules.ServiceRequests.Application;

namespace ServicePro.IntegrationTests;

/// <summary>"My bookings" on the customer site: sign in by code, see only your own data, add addresses, delete the account.</summary>
public sealed class CustomerAccountTests(ApiFactory factory)
{
    /// <summary>A customer who has booked once (via the WhatsApp integration), signed in with a code.</summary>
    private async Task<(TestApi Api, string Phone)> SignedInCustomerAsync()
    {
        var api = new TestApi(factory);
        var phone = TestApi.RandomPhone();
        var category = await api.CategoryAsync("FRIDGE");
        var start = DateTimeOffset.UtcNow.AddDays(2);
        var booking = new HttpRequestMessage(HttpMethod.Post, "/api/v1/integrations/bookings")
        {
            Content = JsonContent.Create(
                new IntegrationBookingRequest($"wamid.{Guid.NewGuid():N}", true, category.Id, null, "Fridge not cooling", "Asha Rao", phone,
                    new BookingAddressRequest("Home", "Flat 9", null, null, "Kondapur", "Hyderabad", null, "500084", null, null), start, start.AddHours(3)),
                options: TestApi.Json),
        };
        booking.Headers.Add("X-ServicePro-Integration-Key", ApiFactory.IntegrationKey);
        (await api.Client.SendAsync(booking)).StatusCode.ShouldBe(HttpStatusCode.OK);

        var code = await api.PostAsync<OtpRequestedResponse>("/api/v1/customer-auth/code", new CustomerCodeRequest(phone));
        var session = await api.PostAsync<CustomerSessionResponse>("/api/v1/customer-auth/verify", new CustomerVerifyRequest(phone, code.DevelopmentCode!, AcceptedPolicies: true));
        api.Client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", session.AccessToken);
        return (api, phone);
    }

    [Fact]
    public async Task A_customer_sees_their_profile_and_bookings_and_can_add_an_address()
    {
        var (api, phone) = await SignedInCustomerAsync();

        var account = await api.GetAsync<AccountResponse>("/api/v1/account");
        account.FullName.ShouldBe("Asha Rao");
        account.Phone.ShouldBe("+91" + phone);
        account.Addresses.ShouldHaveSingleItem().Locality.ShouldBe("Kondapur");

        var bookings = await api.GetAsync<List<MyBookingResponse>>("/api/v1/account/bookings");
        bookings.ShouldHaveSingleItem().CategoryCode.ShouldBe("FRIDGE");

        var updated = await api.PostAsync<AccountResponse>("/api/v1/account/addresses",
            new AddAccountAddressRequest("Work", "Office 4B, Cyber Towers", null, "Near metro", "Madhapur", "Hyderabad", "500081", MakeDefault: true));
        updated.Addresses.Count.ShouldBe(2);
        updated.Addresses[0].Label.ShouldBe("Work"); // the default is listed first
        updated.Addresses[0].IsDefault.ShouldBeTrue();
    }

    [Fact]
    public async Task Customers_only_ever_see_their_own_account()
    {
        var (first, _) = await SignedInCustomerAsync();
        var (second, secondPhone) = await SignedInCustomerAsync();

        var account = await second.GetAsync<AccountResponse>("/api/v1/account");
        account.Phone.ShouldBe("+91" + secondPhone);
        (await first.GetAsync<AccountResponse>("/api/v1/account")).Id.ShouldNotBe(account.Id);
        (await second.GetAsync<List<MyBookingResponse>>("/api/v1/account/bookings")).ShouldHaveSingleItem();

        var anonymous = new TestApi(factory);
        (await anonymous.Client.GetAsync("/api/v1/account")).StatusCode.ShouldBe(HttpStatusCode.Unauthorized);
        (await anonymous.PostRawAsync("/api/v1/account/addresses",
            new AddAccountAddressRequest(null, "x", null, null, "y", "z", "500081", false))).StatusCode.ShouldBe(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Signing_in_requires_agreeing_to_the_policies_and_records_it()
    {
        var (api, phone) = await SignedInCustomerAsync();

        var consent = (await api.GetAsync<AccountResponse>("/api/v1/account")).Consents.ShouldHaveSingleItem();
        consent.PolicyVersion.ShouldBe("unpublished-draft");
        consent.Source.ShouldBe(RequestChannel.Website);

        var anonymous = new TestApi(factory);
        var code = await anonymous.PostAsync<OtpRequestedResponse>("/api/v1/customer-auth/code", new CustomerCodeRequest(phone));
        var refused = await anonymous.PostRawAsync("/api/v1/customer-auth/verify", new CustomerVerifyRequest(phone, code.DevelopmentCode!));
        refused.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Deleting_the_account_waits_for_open_bookings_then_erases_personal_data()
    {
        var (api, phone) = await SignedInCustomerAsync();
        var account = await api.GetAsync<AccountResponse>("/api/v1/account");
        var booking = (await api.GetAsync<List<MyBookingResponse>>("/api/v1/account/bookings")).ShouldHaveSingleItem();

        (await TestApi.ProblemAsync(await api.Client.DeleteAsync("/api/v1/account"))).ShouldBe((HttpStatusCode.Conflict, "account.open_bookings"));

        var owner = await new TestApi(factory).AsOwnerAsync();
        await owner.PostAsync($"/api/v1/admin/service-requests/{booking.Id}/transitions",
            new TransitionRequest(ServiceRequestStatus.Cancelled, "CUSTOMER_REQUEST", null, null, null, null));
        (await api.Client.DeleteAsync("/api/v1/account")).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        await factory.DrainOutboxAsync();

        // No message to this number keeps it, including sign-in codes (not linked to the customer record).
        (await owner.GetAsync<List<NotificationResponse>>("/api/v1/admin/notifications?take=500"))
            .ShouldAllBe(m => !m.RecipientAddress.Contains(phone));

        // Signed out, and the number no longer finds the old account.
        (await api.Client.GetAsync("/api/v1/account")).StatusCode.ShouldBe(HttpStatusCode.Unauthorized);
        var again = new TestApi(factory);
        var code = await again.PostAsync<OtpRequestedResponse>("/api/v1/customer-auth/code", new CustomerCodeRequest(phone));
        (await TestApi.ProblemAsync(await again.PostRawAsync("/api/v1/customer-auth/verify", new CustomerVerifyRequest(phone, code.DevelopmentCode!, true))))
            .ShouldBe((HttpStatusCode.NotFound, "customer_auth.no_account"));

        // Staff still see the job, but not who it was for.
        var erased = await owner.GetAsync<CustomerResponse>($"/api/v1/admin/customers/{account.Id}");
        erased.FullName.ShouldBe("Deleted customer");
        erased.PrimaryPhone.ShouldNotContain(phone);
        erased.Addresses.ShouldAllBe(a => a.Line1 == "Removed" && a.Landmark == null);
        var messages = await owner.GetAsync<List<NotificationResponse>>($"/api/v1/admin/notifications?serviceRequestId={booking.Id}");
        messages.ShouldNotBeEmpty();
        messages.ShouldAllBe(m => !m.RenderedBody.Contains("Asha") && !m.RecipientAddress.Contains(phone));
    }
}
