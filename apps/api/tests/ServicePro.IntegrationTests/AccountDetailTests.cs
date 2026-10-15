using System.Net;
using System.Net.Http.Headers;
using ServicePro.Contracts.Ports;
using ServicePro.IntegrationTests.Infrastructure;
using ServicePro.Modules.Billing.Application;
using ServicePro.Modules.Billing.Domain;
using ServicePro.Modules.Customers.Application;
using ServicePro.Modules.Identity.Application;
using ServicePro.Modules.ServiceRequests.Application;

namespace ServicePro.IntegrationTests;

/// <summary>My bookings: edit and remove addresses, booking detail, bills.</summary>
public sealed class AccountDetailTests(ApiFactory factory)
{
    private async Task<TestApi> SignInAsync(string phone)
    {
        var api = new TestApi(factory);
        var code = await api.PostAsync<OtpRequestedResponse>("/api/v1/customer-auth/code", new CustomerCodeRequest(phone));
        var session = await api.PostAsync<CustomerSessionResponse>("/api/v1/customer-auth/verify", new CustomerVerifyRequest(phone, code.DevelopmentCode!, true));
        api.Client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", session.AccessToken);
        return api;
    }

    [Fact]
    public async Task Customers_edit_and_remove_saved_addresses_and_jobs_keep_theirs()
    {
        var (_, customer, jobId) = await CustomerChangesTests.JobWithSignedInCustomerAsync(factory, accepted: false);
        var account = await customer.PostAsync<AccountResponse>("/api/v1/account/addresses",
            new AddAccountAddressRequest("Work", "Office 4B", null, null, "Madhapur", "Hyderabad", "500081", MakeDefault: true));
        var work = account.Addresses.Single(a => a.Label == "Work");
        var home = account.Addresses.Single(a => a.Label != "Work");

        var edited = await customer.PutAsync<AccountResponse>($"/api/v1/account/addresses/{work.Id}",
            new AddAccountAddressRequest("Work", "Office 5C", null, "Near metro", "Madhapur", "Hyderabad", "500081", MakeDefault: true));
        edited.Addresses.Single(a => a.Id == work.Id).Line1.ShouldBe("Office 5C");

        // Removing the default makes the other one default; the job's address still works.
        var removed = await customer.Client.DeleteAsync($"/api/v1/account/addresses/{work.Id}");
        removed.StatusCode.ShouldBe(HttpStatusCode.OK);
        var after = await customer.GetAsync<AccountResponse>("/api/v1/account");
        after.Addresses.ShouldHaveSingleItem().Id.ShouldBe(home.Id);
        after.Addresses[0].IsDefault.ShouldBeTrue();

        (await customer.Client.DeleteAsync($"/api/v1/account/addresses/{work.Id}")).StatusCode.ShouldBe(HttpStatusCode.NotFound);
        (await customer.GetAsync<MyBookingDetailResponse>($"/api/v1/account/bookings/{jobId}")).Tracking!.Locality.ShouldNotBeNullOrEmpty();
    }

    [Fact]
    public async Task A_booking_opens_inside_the_account_and_nobody_else_can_open_it()
    {
        var (_, customer, jobId) = await CustomerChangesTests.JobWithSignedInCustomerAsync(factory, accepted: false);
        var (_, stranger, _) = await CustomerChangesTests.JobWithSignedInCustomerAsync(factory, accepted: false);

        var detail = await customer.GetAsync<MyBookingDetailResponse>($"/api/v1/account/bookings/{jobId}");
        detail.Booking.Id.ShouldBe(jobId);
        detail.Booking.CanCancel.ShouldBeTrue();
        detail.Tracking.ShouldNotBeNull();
        detail.TrackingToken.ShouldNotBeNullOrEmpty();

        (await stranger.Client.GetAsync($"/api/v1/account/bookings/{jobId}")).StatusCode.ShouldBe(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Customers_see_and_download_only_their_own_bills()
    {
        var (owner, technician, jobId, _) = await OnlinePaymentTests.CompletedJobAsync(factory);
        await technician.PostAsync<PaymentResponse>($"/api/v1/service-requests/{jobId}/payments", new RecordPaymentRequest(PaymentMethod.Cash, 2149, null));
        var phone = (await owner.GetAsync<ServiceRequestDetail>($"/api/v1/admin/service-requests/{jobId}")).Card.CustomerPhone;
        var customer = await SignInAsync(phone);

        var bill = (await customer.GetAsync<List<MyInvoiceResponse>>("/api/v1/account/invoices")).ShouldHaveSingleItem();
        bill.ServiceRequestId.ShouldBe(jobId);
        bill.AmountPaid.ShouldBe(2149m);

        var pdf = await customer.Client.GetAsync($"/api/v1/account/invoices/{bill.Id}/pdf");
        pdf.StatusCode.ShouldBe(HttpStatusCode.OK);
        pdf.Content.Headers.ContentType!.MediaType.ShouldBe("application/pdf");

        var (_, stranger, _) = await CustomerChangesTests.JobWithSignedInCustomerAsync(factory, accepted: false);
        (await stranger.Client.GetAsync($"/api/v1/account/invoices/{bill.Id}/pdf")).StatusCode.ShouldBe(HttpStatusCode.NotFound);
        (await stranger.GetAsync<List<MyInvoiceResponse>>("/api/v1/account/invoices")).ShouldBeEmpty();
    }
}
