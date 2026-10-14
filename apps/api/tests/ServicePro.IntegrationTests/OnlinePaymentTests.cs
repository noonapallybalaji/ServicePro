using System.Net;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using ServicePro.Contracts;
using ServicePro.IntegrationTests.Infrastructure;
using ServicePro.Modules.Billing.Application;
using ServicePro.Modules.Billing.Domain;
using ServicePro.Modules.Notifications;
using ServicePro.Modules.ServiceRequests.Application;

namespace ServicePro.IntegrationTests;

/// <summary>Paying a bill online (gateway link, webhook, status check) and refunds.</summary>
public sealed class OnlinePaymentTests(ApiFactory factory)
{
    private const decimal BillTotal = 2149m;

    /// <summary>A completed AC job with a ₹2,149 bill, not yet paid.</summary>
    internal static async Task<(TestApi Owner, TestApi Technician, Guid JobId, string Token)> CompletedJobAsync(ApiFactory factory)
    {
        var owner = await new TestApi(factory).AsOwnerAsync();
        var (_, jobId) = await owner.NewAcJobAsync();
        var priya = await owner.TechnicianAsync("Priya Sharma");
        await owner.AssignAsync(jobId, priya.Id, markAccepted: true);

        var technician = await new TestApi(factory).AsTechnicianAsync(priya.Phone);
        foreach (var status in new[] { ServiceRequestStatus.EnRoute, ServiceRequestStatus.Arrived, ServiceRequestStatus.Diagnosing, ServiceRequestStatus.InProgress })
        {
            await technician.PostAsync($"/api/v1/tech/jobs/{jobId}/transitions", new TransitionRequest(status, null, null, null, 17.46, 78.36));
        }

        await technician.PutAsync<InvoiceResponse>($"/api/v1/service-requests/{jobId}/invoice", new SaveInvoiceRequest(
        [
            new InvoiceLineInput(InvoiceLineType.Visit, "Visiting charge", 1, 349),
            new InvoiceLineInput(InvoiceLineType.Part, "Gas top-up", 1, 1800),
        ]));
        await UploadAfterPhotoAsync(technician, jobId);
        var code = await owner.LatestCompletionCodeAsync(jobId);
        await technician.PostAsync($"/api/v1/tech/jobs/{jobId}/transitions", new TransitionRequest(ServiceRequestStatus.Completed, null, null, code, null, null));

        var detail = await owner.GetAsync<ServiceRequestDetail>($"/api/v1/admin/service-requests/{jobId}");
        return (owner, technician, jobId, detail.TrackingPath.Split('/')[^1]);
    }

    private static async Task UploadAfterPhotoAsync(TestApi technician, Guid jobId)
    {
        using var form = new MultipartFormDataContent();
        form.Add(new StringContent("PHOTO_AFTER"), "kind");
        var image = new ByteArrayContent(Convert.FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="));
        image.Headers.ContentType = new MediaTypeHeaderValue("image/png");
        form.Add(image, "file", "after.png");
        (await technician.Client.PostAsync($"/api/v1/service-requests/{jobId}/attachments", form)).StatusCode.ShouldBe(HttpStatusCode.OK);
    }

    private async Task<HttpResponseMessage> WebhookAsync(object payload, string? secret = ApiFactory.WebhookSecret)
    {
        var body = JsonSerializer.Serialize(payload);
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/v1/webhooks/razorpay") { Content = new StringContent(body, Encoding.UTF8, "application/json") };
        var signature = Convert.ToHexStringLower(HMACSHA256.HashData(Encoding.UTF8.GetBytes(secret ?? "wrong"), Encoding.UTF8.GetBytes(body)));
        request.Headers.Add("X-Razorpay-Signature", signature);
        return await new TestApi(factory).Client.SendAsync(request);
    }

    private static object LinkPaid(string linkId, string paymentId, decimal amount) => new
    {
        @event = "payment_link.paid",
        payload = new
        {
            payment_link = new { entity = new { id = linkId, status = "paid" } },
            payment = new { entity = new { id = paymentId, amount = (long)(amount * 100), status = "captured", method = "upi" } },
        },
    };

    [Fact]
    public async Task The_customer_pays_online_and_only_the_signed_webhook_records_it_once()
    {
        var (owner, _, jobId, token) = await CompletedJobAsync(factory);
        var anonymous = new TestApi(factory);

        var pay = await anonymous.PostAsync<PayOnlineResponse>($"/api/v1/public/track/{token}/pay", null);
        pay.Amount.ShouldBe(BillTotal);
        (await anonymous.PostAsync<PayOnlineResponse>($"/api/v1/public/track/{token}/pay", null)).Url.ShouldBe(pay.Url); // reused, not a second link

        var linkId = factory.Payments.LinkIdFromUrl(pay.Url);
        var paymentId = factory.Payments.Pay(linkId, BillTotal);

        (await WebhookAsync(LinkPaid(linkId, paymentId, BillTotal), secret: "not-the-secret")).StatusCode.ShouldBe(HttpStatusCode.Unauthorized);
        (await WebhookAsync(LinkPaid(linkId, paymentId, BillTotal))).StatusCode.ShouldBe(HttpStatusCode.OK);
        (await WebhookAsync(LinkPaid(linkId, paymentId, BillTotal))).StatusCode.ShouldBe(HttpStatusCode.OK); // Razorpay retries
        await factory.DrainOutboxAsync();

        var activity = await owner.GetAsync<PaymentActivityResponse>($"/api/v1/service-requests/{jobId}/payment-activity");
        activity.Payments.ShouldHaveSingleItem().Method.ShouldBe(PaymentMethod.Online);
        activity.Links.ShouldHaveSingleItem().Status.ShouldBe(PaymentLinkStatus.Paid);
        var job = await owner.GetAsync<ServiceRequestDetail>($"/api/v1/admin/service-requests/{jobId}");
        job.Card.Status.ShouldBe(ServiceRequestStatus.Closed);
        job.Card.PaymentStatus.ShouldBe(PaymentStatus.Paid);
        (await owner.GetAsync<List<NotificationResponse>>($"/api/v1/admin/notifications?serviceRequestId={jobId}"))
            .ShouldContain(m => m.TemplateCode == "PAYMENT_RECEIVED");

        var paid = await TestApi.ProblemAsync(await anonymous.PostRawAsync($"/api/v1/public/track/{token}/pay", null));
        paid.Code.ShouldBe("payments.nothing_due");
    }

    [Fact]
    public async Task Returning_from_the_payment_page_checks_with_the_gateway_when_the_webhook_is_late()
    {
        var (owner, _, jobId, token) = await CompletedJobAsync(factory);
        var anonymous = new TestApi(factory);
        var pay = await anonymous.PostAsync<PayOnlineResponse>($"/api/v1/public/track/{token}/pay", null);

        (await anonymous.PostAsync<PaymentCheckResponse>($"/api/v1/public/track/{token}/payment-check", null)).Paid.ShouldBeFalse();
        factory.Payments.Pay(factory.Payments.LinkIdFromUrl(pay.Url), BillTotal);
        (await anonymous.PostAsync<PaymentCheckResponse>($"/api/v1/public/track/{token}/payment-check", null)).Paid.ShouldBeTrue();

        (await owner.GetAsync<PaymentActivityResponse>($"/api/v1/service-requests/{jobId}/payment-activity")).Payments.ShouldHaveSingleItem();
    }

    [Fact]
    public async Task Paying_twice_queues_the_extra_for_a_refund_that_staff_send_back_through_the_gateway()
    {
        var (owner, technician, jobId, token) = await CompletedJobAsync(factory);
        var pay = await new TestApi(factory).PostAsync<PayOnlineResponse>($"/api/v1/public/track/{token}/pay", null);
        var linkId = factory.Payments.LinkIdFromUrl(pay.Url);

        // The customer pays online while the technician is recording cash at the door.
        var paymentId = factory.Payments.Pay(linkId, BillTotal);
        await technician.PostAsync<PaymentResponse>($"/api/v1/service-requests/{jobId}/payments", new RecordPaymentRequest(PaymentMethod.Cash, BillTotal, null));
        await factory.DrainOutboxAsync();
        (await WebhookAsync(LinkPaid(linkId, paymentId, BillTotal))).StatusCode.ShouldBe(HttpStatusCode.OK);

        var activity = await owner.GetAsync<PaymentActivityResponse>($"/api/v1/service-requests/{jobId}/payment-activity");
        var queued = activity.Refunds.ShouldHaveSingleItem();
        queued.Status.ShouldBe(RefundStatus.NeedsReview);
        queued.Amount.ShouldBe(BillTotal);

        var started = await owner.PostAsync<RefundResponse>($"/api/v1/service-requests/{jobId}/refunds/{queued.Id}/process", new ProcessRefundRequest(null));
        started.Status.ShouldBe(RefundStatus.Pending);
        factory.Payments.Refunds[started.Reference!].ShouldBe(BillTotal);

        var processed = new
        {
            @event = "refund.processed",
            payload = new { refund = new { entity = new { id = started.Reference, status = "processed", amount = (long)(BillTotal * 100) } } },
        };
        (await WebhookAsync(processed)).StatusCode.ShouldBe(HttpStatusCode.OK);
        await factory.DrainOutboxAsync();

        (await owner.GetAsync<PaymentActivityResponse>($"/api/v1/service-requests/{jobId}/payment-activity")).Refunds.Single().Status.ShouldBe(RefundStatus.Processed);
        (await owner.GetAsync<List<NotificationResponse>>($"/api/v1/admin/notifications?serviceRequestId={jobId}"))
            .ShouldContain(m => m.TemplateCode == "REFUND_PROCESSED");
    }

    [Fact]
    public async Task Cash_refunds_are_recorded_by_staff_and_can_never_exceed_what_was_paid()
    {
        var (owner, technician, jobId, _) = await CompletedJobAsync(factory);
        var cash = await technician.PostAsync<PaymentResponse>($"/api/v1/service-requests/{jobId}/payments", new RecordPaymentRequest(PaymentMethod.Cash, BillTotal, null));

        var refund = await owner.PostAsync<RefundResponse>($"/api/v1/service-requests/{jobId}/payments/{cash.Id}/refunds",
            new RefundRequest(500, "Part not needed after all", "UPI ref 123"));
        refund.Status.ShouldBe(RefundStatus.Processed);

        var tooMuch = await owner.PostRawAsync($"/api/v1/service-requests/{jobId}/payments/{cash.Id}/refunds", new RefundRequest(BillTotal, "Again", null));
        (await TestApi.ProblemAsync(tooMuch)).Code.ShouldBe("refund.amount_invalid");

        // Only owners and admins give money back.
        (await technician.PostRawAsync($"/api/v1/service-requests/{jobId}/payments/{cash.Id}/refunds", new RefundRequest(1, "x", null)))
            .StatusCode.ShouldBe(HttpStatusCode.Forbidden);

        var activity = await owner.GetAsync<PaymentActivityResponse>($"/api/v1/service-requests/{jobId}/payment-activity");
        activity.Payments.Single().Refundable.ShouldBe(BillTotal - 500);
    }

    [Fact]
    public async Task Staff_send_the_link_on_whatsapp()
    {
        var (owner, _, jobId, _) = await CompletedJobAsync(factory);

        var sent = await owner.PostAsync<PayOnlineResponse>($"/api/v1/service-requests/{jobId}/payment-link", null);
        await factory.DrainOutboxAsync();

        var message = (await owner.GetAsync<List<NotificationResponse>>($"/api/v1/admin/notifications?serviceRequestId={jobId}"))
            .Single(m => m.TemplateCode == "PAYMENT_LINK");
        message.RenderedBody.ShouldContain(sent.Url);
        message.RenderedBody.ShouldContain("2,149");
    }
}
