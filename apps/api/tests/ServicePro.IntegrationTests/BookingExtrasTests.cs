using System.Net;
using System.Net.Http.Headers;
using ServicePro.IntegrationTests.Infrastructure;
using ServicePro.Modules.ServiceRequests.Application;
using ServicePro.Modules.ServiceRequests.Domain;

namespace ServicePro.IntegrationTests;

/// <summary>Booking on the website with access notes, someone else at home, appliance details and photos.</summary>
public sealed class BookingExtrasTests(ApiFactory factory)
{
    private async Task<(TestApi Customer, OnlineBookingResponse Booking)> BookAsync(BookingExtras? extras)
    {
        var api = new TestApi(factory);
        var phone = TestApi.RandomPhone();
        var category = await api.CategoryAsync("WASHER");
        var code = await api.PostAsync<BookingCodeResponse>("/api/v1/public/bookings/code", new BookingCodeRequest(phone));
        var start = DateTimeOffset.UtcNow.AddDays(2);
        var booking = await api.PostAsync<OnlineBookingResponse>("/api/v1/public/bookings", new OnlineBookingRequest(
            category.Id, null, "Drum not spinning", "Kiran Rao", phone, code.DevelopmentCode,
            new BookingAddressRequest("Home", "Flat 7", null, null, "Madhapur", "Hyderabad", null, "500081", null, null),
            start, start.AddHours(3), AcceptedPolicies: true, Extras: extras));
        api.Client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", booking.Session!.AccessToken);
        return (api, booking);
    }

    [Fact]
    public async Task The_technician_sees_access_notes_the_person_at_home_and_the_appliance()
    {
        var (_, booking) = await BookAsync(new BookingExtras("Gate code 4512, 3rd floor, call on arrival", "Lakshmi Rao", "9876501234", "IFB", "Senator 7kg", 2021, true));

        var owner = await new TestApi(factory).AsOwnerAsync();
        var job = await owner.GetAsync<ServiceRequestDetail>($"/api/v1/admin/service-requests/{booking.ServiceRequestId}");
        job.VisitDetails.ShouldNotBeNull();
        job.VisitDetails.AccessNotes.ShouldBe("Gate code 4512, 3rd floor, call on arrival");
        job.VisitDetails.ContactName.ShouldBe("Lakshmi Rao");
        job.VisitDetails.ContactPhone.ShouldBe("+919876501234");
        job.VisitDetails.UnderWarranty.ShouldBe(true);
        job.ApplianceDescription.ShouldBe("IFB Senator 7kg");
    }

    [Fact]
    public async Task A_contact_needs_both_a_name_and_a_valid_number()
    {
        var api = new TestApi(factory);
        var phone = TestApi.RandomPhone();
        var category = await api.CategoryAsync("WASHER");
        var code = await api.PostAsync<BookingCodeResponse>("/api/v1/public/bookings/code", new BookingCodeRequest(phone));
        var start = DateTimeOffset.UtcNow.AddDays(2);
        var request = new OnlineBookingRequest(category.Id, null, "Drum not spinning", "Kiran Rao", phone, code.DevelopmentCode,
            new BookingAddressRequest("Home", "Flat 7", null, null, "Madhapur", "Hyderabad", null, "500081", null, null),
            start, start.AddHours(3), AcceptedPolicies: true, Extras: new BookingExtras(null, null, "9876501234", null, null, null, null));

        (await api.PostRawAsync("/api/v1/public/bookings", request)).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        var badNumber = request with { Extras = new BookingExtras(null, "Lakshmi", "12345", null, null, null, null) };
        (await TestApi.ProblemAsync(await api.PostRawAsync("/api/v1/public/bookings", badNumber))).Code.ShouldBe("booking.contact_phone_invalid");
    }

    [Fact]
    public async Task Customers_add_a_few_photos_of_the_problem_to_their_own_booking()
    {
        var (customer, booking) = await BookAsync(null);
        var path = $"/api/v1/account/bookings/{booking.ServiceRequestId}/photos";

        (await customer.Client.PostAsync(path, Photo("image/png"))).StatusCode.ShouldBe(HttpStatusCode.OK);
        (await TestApi.ProblemAsync(await customer.Client.PostAsync(path, Photo("application/pdf")))).Code.ShouldBe("photo.invalid");

        var (stranger, _) = await BookAsync(null);
        (await stranger.Client.PostAsync(path, Photo("image/png"))).StatusCode.ShouldBe(HttpStatusCode.NotFound);

        var owner = await new TestApi(factory).AsOwnerAsync();
        (await owner.GetAsync<ServiceRequestDetail>($"/api/v1/admin/service-requests/{booking.ServiceRequestId}"))
            .Attachments.ShouldHaveSingleItem().Kind.ShouldBe(AttachmentKind.PhotoIssue);
    }

    private static MultipartFormDataContent Photo(string contentType)
    {
        var form = new MultipartFormDataContent();
        var image = new ByteArrayContent(Convert.FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="));
        image.Headers.ContentType = new MediaTypeHeaderValue(contentType);
        form.Add(image, "file", "problem.png");
        return form;
    }
}
