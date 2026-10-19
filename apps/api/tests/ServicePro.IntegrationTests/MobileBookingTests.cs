using System.Net;
using ServicePro.IntegrationTests.Infrastructure;
using ServicePro.Modules.Catalog.Application;
using ServicePro.Modules.ServiceRequests.Application;

namespace ServicePro.IntegrationTests;

/// <summary>Location first ("Detect my location" -> PIN code -> serviceability) and booking that can't happen twice.</summary>
[Collection(TimeTravelCollection.Name)] // flips the shared fake geocoder offline
public sealed class MobileBookingTests(ApiFactory factory)
{
    private Task<LocatedServiceabilityResponse> LocateAsync(double latitude, double longitude) =>
        new TestApi(factory).GetAsync<LocatedServiceabilityResponse>($"/api/v1/catalog/serviceability/near?latitude={latitude}&longitude={longitude}");

    [Fact]
    public async Task A_position_in_a_covered_area_finds_its_pin_code()
    {
        var located = await LocateAsync(17.4483, 78.3915);

        located.Located.ShouldBeTrue();
        located.Pincode.ShouldBe("500081");
        located.Locality.ShouldBe("Madhapur");
        located.IsServiceable.ShouldBeTrue();
        located.Areas.ShouldNotBeEmpty();
    }

    [Fact]
    public async Task A_position_outside_our_areas_is_found_but_not_served()
    {
        var located = await LocateAsync(12.9716, 77.5946);

        located.Located.ShouldBeTrue();
        located.Pincode.ShouldBe("560001");
        located.IsServiceable.ShouldBeFalse();
    }

    [Fact]
    public async Task A_wrong_map_postcode_is_replaced_by_the_one_nearby()
    {
        var located = await LocateAsync(17.44, 78.39);

        located.Pincode.ShouldBe("500081"); // not the map's 800081
        located.IsServiceable.ShouldBeTrue();
        located.Locality.ShouldBe("Kavuri Hills");
    }

    [Fact]
    public async Task No_pin_code_or_no_provider_means_typing_it_instead()
    {
        var nothingFound = await LocateAsync(10, 10);
        nothingFound.Located.ShouldBeTrue();
        nothingFound.Pincode.ShouldBeNull();
        nothingFound.IsServiceable.ShouldBeFalse();

        factory.Geocoder.Offline = true;
        try
        {
            var offline = await LocateAsync(17.4483, 78.3915);
            offline.Located.ShouldBeFalse();
            offline.Pincode.ShouldBeNull();
        }
        finally
        {
            factory.Geocoder.Offline = false;
        }

        var invalid = await new TestApi(factory).Client.GetAsync("/api/v1/catalog/serviceability/near?latitude=123&longitude=78");
        invalid.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Submitting_the_same_booking_twice_makes_one_booking()
    {
        var api = new TestApi(factory);
        var phone = TestApi.RandomPhone();
        var category = await api.CategoryAsync("AC");
        var code = await api.PostAsync<BookingCodeResponse>("/api/v1/public/bookings/code", new BookingCodeRequest(phone));
        var request = new OnlineBookingRequest(category.Id, null, "Not cooling", "Asha Rao", phone, code.DevelopmentCode,
            new BookingAddressRequest("Home", "Flat 3", null, null, "Madhapur", "Hyderabad", null, "500081", null, null), AcceptedPolicies: true, RequestId: Guid.NewGuid().ToString());

        var first = await api.PostAsync<OnlineBookingResponse>("/api/v1/public/bookings", request);
        // The code is used up by now: the repeat is answered from the first booking, not re-verified.
        var again = await api.PostAsync<OnlineBookingResponse>("/api/v1/public/bookings", request);

        again.ServiceRequestId.ShouldBe(first.ServiceRequestId);
        again.SrNumber.ShouldBe(first.SrNumber);
        first.Session.ShouldNotBeNull();
        again.Session.ShouldBeNull(); // no second sign-in from a repeat

        // A new attempt (new id) is a new booking, and needs a fresh code.
        var another = await api.PostRawAsync("/api/v1/public/bookings", request with { RequestId = Guid.NewGuid().ToString() });
        (await TestApi.ProblemAsync(another)).Status.ShouldBe(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task The_server_rechecks_the_pin_code_whatever_the_page_said()
    {
        var api = new TestApi(factory);
        var phone = TestApi.RandomPhone();
        var category = await api.CategoryAsync("AC");
        var code = await api.PostAsync<BookingCodeResponse>("/api/v1/public/bookings/code", new BookingCodeRequest(phone));

        var response = await api.PostRawAsync("/api/v1/public/bookings", new OnlineBookingRequest(category.Id, null, "Not cooling", "Asha Rao", phone, code.DevelopmentCode,
            new BookingAddressRequest("Home", "Flat 3", null, null, "Shivaji Nagar", "Bengaluru", null, "560001", null, null), AcceptedPolicies: true, RequestId: Guid.NewGuid().ToString()));

        (await TestApi.ProblemAsync(response)).Code.ShouldBe("booking.not_serviceable");
    }

    [Fact]
    public async Task A_booking_needs_only_the_appliance_the_location_and_the_phone()
    {
        var api = new TestApi(factory);
        var phone = TestApi.RandomPhone();
        var category = await api.CategoryAsync("AC");
        var code = await api.PostAsync<BookingCodeResponse>("/api/v1/public/bookings/code", new BookingCodeRequest(phone));

        // No problem picked, no house number, no time: the office agrees the date with the customer.
        var booking = await api.PostAsync<OnlineBookingResponse>("/api/v1/public/bookings", new OnlineBookingRequest(category.Id, null, null, "Asha Rao", phone, code.DevelopmentCode,
            new BookingAddressRequest("Home", null, null, null, "HITEC City", "Hyderabad", null, "500081", 17.4483, 78.3915), AcceptedPolicies: true));

        var owner = await new TestApi(factory).AsOwnerAsync();
        var job = await owner.GetAsync<ServiceRequestDetail>($"/api/v1/admin/service-requests/{booking.ServiceRequestId}");
        job.Card.Status.ShouldBe(ServicePro.Contracts.ServiceRequestStatus.New);
        job.PreferredSlotStart.ShouldBeNull();
        job.Card.ScheduledStart.ShouldBeNull();
        job.ProblemDescription.ShouldBe("AC: to be checked on the visit");
    }

    [Fact]
    public async Task A_problem_the_customer_describes_is_kept_as_written()
    {
        var api = new TestApi(factory);
        var phone = TestApi.RandomPhone();
        var category = await api.CategoryAsync("AC");
        var code = await api.PostAsync<BookingCodeResponse>("/api/v1/public/bookings/code", new BookingCodeRequest(phone));

        var booking = await api.PostAsync<OnlineBookingResponse>("/api/v1/public/bookings", new OnlineBookingRequest(category.Id, null, "  Not cooling, water leaking since yesterday  ", "Asha Rao", phone, code.DevelopmentCode,
            new BookingAddressRequest("Home", null, null, null, "HITEC City", "Hyderabad", null, "500081", null, null), AcceptedPolicies: true));

        var owner = await new TestApi(factory).AsOwnerAsync();
        (await owner.GetAsync<ServiceRequestDetail>($"/api/v1/admin/service-requests/{booking.ServiceRequestId}"))
            .ProblemDescription.ShouldBe("Not cooling, water leaking since yesterday");
    }
}
