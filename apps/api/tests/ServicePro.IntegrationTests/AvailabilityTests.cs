using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using ServicePro.Api.Hosting;
using ServicePro.BuildingBlocks.Web;
using ServicePro.Contracts;
using ServicePro.IntegrationTests.Infrastructure;
using ServicePro.Modules.Customers.Application;
using ServicePro.Modules.ServiceRequests.Application;

namespace ServicePro.IntegrationTests;

/// <summary>Customers only see (and can only book) visit windows we have technicians for.</summary>
[Collection(TimeTravelCollection.Name)]
public sealed class AvailabilityTests(ApiFactory factory)
{
    private const string Kondapur = "500084";

    private static async Task SetCapacityCheckAsync(TestApi owner, bool on) =>
        (await owner.Client.PutAsJsonAsync("/api/v1/admin/settings/booking.capacity_check", new UpdateSettingRequest(JsonSerializer.SerializeToElement(on)), TestApi.Json))
            .StatusCode.ShouldBe(HttpStatusCode.NoContent);

    [Fact]
    public async Task Windows_follow_technician_shifts_and_close_when_full()
    {
        var owner = await new TestApi(factory).AsOwnerAsync();
        var ac = await owner.CategoryAsync("AC");
        await SetCapacityCheckAsync(owner, true);
        try
        {
            var anonymous = new TestApi(factory);
            var availability = await anonymous.GetAsync<AvailabilityResponse>($"/api/v1/public/availability?categoryId={ac.Id}&pincode={Kondapur}");
            availability.Days.Count.ShouldBe(7);
            availability.Days.ShouldAllBe(d => d.Slots.Count == 3);

            // The seeded technicians work Monday to Saturday.
            availability.Days.Where(d => d.Date.DayOfWeek == DayOfWeek.Sunday).SelectMany(d => d.Slots).ShouldAllBe(s => !s.Available);

            // An evening a few days out that nothing else in the test run touches.
            var target = availability.Days.Skip(4).SelectMany(d => d.Slots).First(s => s.Id == "evening" && s.Available);

            for (var i = 0; i < 20 && await IsAvailableAsync(anonymous, ac.Id, target.Start); i++)
            {
                await StaffBookAsync(owner, ac, target.Start, target.End);
            }

            (await IsAvailableAsync(anonymous, ac.Id, target.Start)).ShouldBeFalse();

            // The WhatsApp assistant (and the website) are refused for a full window...
            var refused = await IntegrationBookAsync(ac.Id, target.Start, target.End);
            refused.StatusCode.ShouldBe(HttpStatusCode.Conflict);
            (await TestApi.ProblemAsync(refused)).Code.ShouldBe("booking.slot_full");

            // ...and for times outside the windows we offer.
            var night = target.Start.AddHours(5);
            (await TestApi.ProblemAsync(await IntegrationBookAsync(ac.Id, night, night.AddHours(2)))).Code.ShouldBe("booking.slot_invalid");
        }
        finally
        {
            await SetCapacityCheckAsync(owner, false);
        }
    }

    [Fact]
    public async Task An_unserved_pincode_has_no_availability()
    {
        var ac = await new TestApi(factory).AsOwnerAsync().ContinueWith(t => t.Result.CategoryAsync("AC")).Unwrap();

        var response = await new TestApi(factory).Client.GetAsync($"/api/v1/public/availability?categoryId={ac.Id}&pincode=110001");

        (await TestApi.ProblemAsync(response)).Code.ShouldBe("booking.not_serviceable");
    }

    private static async Task<bool> IsAvailableAsync(TestApi api, Guid categoryId, DateTimeOffset start) =>
        (await api.GetAsync<AvailabilityResponse>($"/api/v1/public/availability?categoryId={categoryId}&pincode={Kondapur}"))
            .Days.SelectMany(d => d.Slots).Single(s => s.Start == start).Available;

    /// <summary>Staff can always book (they may know better), which is how the window fills here.</summary>
    private static async Task StaffBookAsync(TestApi owner, ServicePro.Modules.Catalog.Application.CategoryResponse category, DateTimeOffset start, DateTimeOffset end)
    {
        var customer = await owner.PostAsync<CustomerResponse>("/api/v1/admin/customers", new CreateCustomerRequest(
            "Capacity Test", TestApi.RandomPhone(), null, null, "en", RequestChannel.Phone, null,
            new AddressInput("Home", "Flat 9", null, null, "Kondapur", "Hyderabad", "Telangana", Kondapur, null, null)));
        await owner.PostAsync<IdResponse>("/api/v1/admin/service-requests", new CreateServiceRequestRequest(
            customer.Id, customer.Addresses[0].Id, null, category.Id, category.IssueTypes[0].Id, "Capacity test", RequestChannel.Phone, Priority.Normal,
            start, end, null, null, null, false, null));
    }

    private async Task<HttpResponseMessage> IntegrationBookAsync(Guid categoryId, DateTimeOffset start, DateTimeOffset end)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/v1/integrations/bookings")
        {
            Content = JsonContent.Create(new IntegrationBookingRequest($"wamid.{Guid.NewGuid():N}", true, categoryId, null, "AC not cooling", "Slot Test",
                TestApi.RandomPhone(), new BookingAddressRequest("Home", "Flat 3", null, null, "Kondapur", "Hyderabad", null, Kondapur, null, null), start, end), options: TestApi.Json),
        };
        request.Headers.Add("X-ServicePro-Integration-Key", ApiFactory.IntegrationKey);
        return await new TestApi(factory).Client.SendAsync(request);
    }
}
