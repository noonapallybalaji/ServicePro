using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using ServicePro.Api.Hosting;
using ServicePro.Contracts.Ports;
using ServicePro.IntegrationTests.Infrastructure;
using ServicePro.Modules.Billing.Application;
using ServicePro.Modules.Billing.Domain;
using ServicePro.Modules.Identity.Application;
using ServicePro.Modules.ServiceRequests.Application;

namespace ServicePro.IntegrationTests;

/// <summary>Warranty cards and "the problem came back" re-visits. They change shared settings.</summary>
[Collection(TimeTravelCollection.Name)]
public sealed class WarrantyTests(ApiFactory factory)
{
    private async Task<(TestApi Owner, TestApi Customer, Guid JobId)> ClosedJobAsync()
    {
        var (owner, technician, jobId, _) = await OnlinePaymentTests.CompletedJobAsync(factory);
        await technician.PostAsync<PaymentResponse>($"/api/v1/service-requests/{jobId}/payments", new RecordPaymentRequest(PaymentMethod.Cash, 2149, null));
        await factory.DrainOutboxAsync();

        var phone = (await owner.GetAsync<ServiceRequestDetail>($"/api/v1/admin/service-requests/{jobId}")).Card.CustomerPhone;
        var customer = new TestApi(factory);
        var code = await customer.PostAsync<OtpRequestedResponse>("/api/v1/customer-auth/code", new CustomerCodeRequest(phone));
        var session = await customer.PostAsync<CustomerSessionResponse>("/api/v1/customer-auth/verify", new CustomerVerifyRequest(phone, code.DevelopmentCode!, true));
        customer.Client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", session.AccessToken);
        return (owner, customer, jobId);
    }

    private static RevisitRequest Revisit()
    {
        var start = DateTimeOffset.UtcNow.AddDays(2);
        return new RevisitRequest("Not cooling again", start, start.AddHours(3));
    }

    [Fact]
    public async Task Without_a_warranty_set_none_is_shown_or_honoured()
    {
        var (_, customer, jobId) = await ClosedJobAsync();

        (await customer.GetAsync<MyBookingDetailResponse>($"/api/v1/account/bookings/{jobId}")).Warranty.ShouldBeNull();
        (await TestApi.ProblemAsync(await customer.PostRawAsync($"/api/v1/account/bookings/{jobId}/revisit", Revisit()))).Code.ShouldBe("warranty.expired");
    }

    [Fact]
    public async Task Under_warranty_the_customer_asks_once_for_a_free_revisit()
    {
        var owner = await new TestApi(factory).AsOwnerAsync();
        await SetAsync(owner, "warranty.days", 90);
        try
        {
            var (_, customer, jobId) = await ClosedJobAsync();

            var card = (await customer.GetAsync<MyBookingDetailResponse>($"/api/v1/account/bookings/{jobId}")).Warranty.ShouldNotBeNull();
            card.Active.ShouldBeTrue();
            card.CanRequestRevisit.ShouldBeTrue();
            card.Terms.ShouldBe(WarrantyCards.DefaultTerms);
            card.Until.ShouldBeGreaterThan(DateTimeOffset.UtcNow.AddDays(89));

            var revisit = await customer.PostAsync<RevisitResponse>($"/api/v1/account/bookings/{jobId}/revisit", Revisit());
            var visit = await owner.GetAsync<ServiceRequestDetail>($"/api/v1/admin/service-requests/{revisit.ServiceRequestId}");
            visit.IsWarrantyVisit.ShouldBeTrue();
            visit.ParentServiceRequestId.ShouldBe(jobId);
            visit.Card.PaymentStatus.ShouldBe(ServicePro.Contracts.PaymentStatus.Waived);

            (await TestApi.ProblemAsync(await customer.PostRawAsync($"/api/v1/account/bookings/{jobId}/revisit", Revisit()))).Code.ShouldBe("warranty.revisit_open");
            (await customer.GetAsync<MyBookingDetailResponse>($"/api/v1/account/bookings/{jobId}")).Warranty!.OpenRevisitSrNumber.ShouldBe(revisit.SrNumber);
        }
        finally
        {
            await SetAsync(owner, "warranty.days", 0);
        }
    }

    private static async Task SetAsync(TestApi owner, string key, object value) =>
        (await owner.Client.PutAsJsonAsync($"/api/v1/admin/settings/{key}", new UpdateSettingRequest(JsonSerializer.SerializeToElement(value)), TestApi.Json))
            .StatusCode.ShouldBe(HttpStatusCode.NoContent);
}
