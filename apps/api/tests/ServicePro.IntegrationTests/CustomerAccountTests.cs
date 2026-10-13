using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using ServicePro.Contracts.Ports;
using ServicePro.IntegrationTests.Infrastructure;
using ServicePro.Modules.Customers.Application;
using ServicePro.Modules.Identity.Application;
using ServicePro.Modules.ServiceRequests.Application;

namespace ServicePro.IntegrationTests;

/// <summary>"My bookings" on the customer site: sign in by code, see only your own data, add addresses.</summary>
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
        var session = await api.PostAsync<CustomerSessionResponse>("/api/v1/customer-auth/verify", new CustomerVerifyRequest(phone, code.DevelopmentCode!));
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
}
