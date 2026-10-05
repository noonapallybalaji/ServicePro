using System.Net;
using System.Net.Http.Headers;
using ServicePro.Contracts;
using ServicePro.IntegrationTests.Infrastructure;
using ServicePro.Modules.Billing.Application;
using ServicePro.Modules.Billing.Domain;
using ServicePro.Modules.Dispatch.Application;
using ServicePro.Modules.Notifications;
using ServicePro.Modules.ServiceRequests.Application;
using ServicePro.Modules.Technicians.Application;

namespace ServicePro.IntegrationTests;

/// <summary>The Phase 1 happy path, end to end, through HTTP only (PLAN.md §4.3–4.4).</summary>
public sealed class JobLifecycleTests(ApiFactory factory)
{
    [Fact]
    public async Task A_job_goes_from_request_to_closed_with_messages_billing_and_ledger()
    {
        var owner = await new TestApi(factory).AsOwnerAsync();
        var (customer, jobId) = await owner.NewAcJobAsync();

        // Dispatch: ranked candidates with explanations, then an offer.
        var candidates = await owner.GetAsync<List<CandidateResponse>>($"/api/v1/admin/service-requests/{jobId}/candidates");
        candidates.ShouldNotBeEmpty();
        candidates.ShouldAllBe(c => c.Breakdown.Count == 6);
        var ravi = await owner.TechnicianAsync("Ravi Kumar");
        (await owner.AssignAsync(jobId, ravi.Id)).Status.ShouldBe(Modules.Dispatch.Domain.AssignmentStatus.Offered);

        // Technician: sees the offer, accepts, works the job.
        var technician = await new TestApi(factory).AsTechnicianAsync(ravi.Phone);
        var offer = (await technician.GetAsync<List<OfferResponse>>("/api/v1/tech/offers")).Single(o => o.ServiceRequestId == jobId);
        offer.Locality.ShouldBe("Kondapur");
        await technician.PostAsync($"/api/v1/tech/offers/{offer.AssignmentId}/accept", null);

        var job = await technician.GetAsync<ServiceRequestDetail>($"/api/v1/tech/jobs/{jobId}");
        job.Card.Status.ShouldBe(ServiceRequestStatus.Accepted);
        job.AvailableTransitions.Select(t => t.To).ShouldContain(ServiceRequestStatus.EnRoute);

        foreach (var status in new[] { ServiceRequestStatus.EnRoute, ServiceRequestStatus.Arrived, ServiceRequestStatus.Diagnosing, ServiceRequestStatus.InProgress })
        {
            await technician.PostAsync($"/api/v1/tech/jobs/{jobId}/transitions", new TransitionRequest(status, null, null, null, 17.46, 78.36));
        }

        // Billing before completion; the AC category requires an after-photo.
        var bill = await technician.PutAsync<InvoiceResponse>($"/api/v1/service-requests/{jobId}/invoice", new SaveInvoiceRequest(
        [
            new InvoiceLineInput(InvoiceLineType.Visit, "Visiting charge", 1, 349),
            new InvoiceLineInput(InvoiceLineType.Part, "Gas top-up", 1, 1800),
        ]));
        bill.Total.ShouldBe(2149m);

        var completionCode = await owner.LatestCompletionCodeAsync(jobId);
        var noPhoto = await technician.PostRawAsync($"/api/v1/tech/jobs/{jobId}/transitions", new TransitionRequest(ServiceRequestStatus.Completed, null, null, completionCode, null, null));
        (await TestApi.ProblemAsync(noPhoto)).Code.ShouldBe("sr.photo_required");

        await UploadAfterPhotoAsync(technician, jobId);
        await technician.PostAsync($"/api/v1/tech/jobs/{jobId}/transitions", new TransitionRequest(ServiceRequestStatus.Completed, null, null, completionCode, null, null));

        // Cash payment closes the job and lands on the technician's ledger.
        await technician.PostAsync<PaymentResponse>($"/api/v1/service-requests/{jobId}/payments", new RecordPaymentRequest(PaymentMethod.Cash, 2149, null));
        await factory.DrainOutboxAsync();

        var final = await owner.GetAsync<ServiceRequestDetail>($"/api/v1/admin/service-requests/{jobId}");
        final.Card.Status.ShouldBe(ServiceRequestStatus.Closed);
        final.Card.PaymentStatus.ShouldBe(PaymentStatus.Paid);
        final.Invoice!.AmountPaid.ShouldBe(2149m);
        final.History.Select(h => h.To).Reverse().ShouldBe(
        [
            ServiceRequestStatus.ReadyForAssignment, ServiceRequestStatus.Offered, ServiceRequestStatus.Accepted, ServiceRequestStatus.EnRoute,
            ServiceRequestStatus.Arrived, ServiceRequestStatus.Diagnosing, ServiceRequestStatus.InProgress, ServiceRequestStatus.Completed,
            ServiceRequestStatus.Closed,
        ]);

        var earnings = await technician.GetAsync<LedgerResponse>("/api/v1/tech/me/earnings");
        earnings.Entries.ShouldContain(e => e.ServiceRequestId == jobId && e.Type == LedgerEntryType.CashCollected && e.Amount == 2149m);
        earnings.Entries.ShouldContain(e => e.ServiceRequestId == jobId && e.Type == LedgerEntryType.CommissionEarned && e.Amount == 429.80m);

        var messages = await owner.GetAsync<List<NotificationResponse>>($"/api/v1/admin/notifications?serviceRequestId={jobId}");
        messages.Select(m => m.TemplateCode).ShouldBe(
            ["SR_CREATED", "JOB_OFFER", "TECH_ASSIGNED", "TECH_EN_ROUTE", "COMPLETION_CODE", "JOB_COMPLETED"],
            ignoreOrder: true);
        var customerPhone = customer.PrimaryPhone;
        messages.Where(m => m.RecipientType == Modules.Notifications.Domain.RecipientType.Customer)
            .ShouldAllBe(m => m.RecipientAddress == customerPhone);

        // Customer-facing tracking + invoice, no login.
        var token = final.TrackingPath.Split('/')[^1];
        var anonymous = new TestApi(factory);
        var tracking = await anonymous.GetAsync<TrackingResponse>($"/api/v1/public/track/{token}");
        tracking.Status.ShouldBe(ServiceRequestStatus.Closed);
        tracking.Technician!.FullName.ShouldBe("Ravi Kumar");
        tracking.Technician.Phone.ShouldBeNull(); // only shared while the job is active
        tracking.Photos.ShouldHaveSingleItem();
        var pdf = await anonymous.Client.GetAsync($"/api/v1/public/track/{token}/invoice.pdf");
        pdf.Content.Headers.ContentType!.MediaType.ShouldBe("application/pdf");
        (await pdf.Content.ReadAsByteArrayAsync()).Take(4).ShouldBe("%PDF"u8.ToArray());

        // Event-driven side effects in other modules.
        var technicianAfter = await owner.GetAsync<TechnicianResponse>($"/api/v1/admin/technicians/{ravi.Id}");
        technicianAfter.DutyStatus.ShouldBe(TechnicianDutyStatus.Available);
        technicianAfter.CompletedJobs.ShouldBeGreaterThan(ravi.CompletedJobs);
    }

    [Fact]
    public async Task Owner_can_assign_as_accepted_when_agreed_by_phone()
    {
        var owner = await new TestApi(factory).AsOwnerAsync();
        var (_, jobId) = await owner.NewAcJobAsync();
        var suresh = await owner.TechnicianAsync("Suresh Reddy");

        (await owner.AssignAsync(jobId, suresh.Id, markAccepted: true)).Status.ShouldBe(Modules.Dispatch.Domain.AssignmentStatus.Accepted);

        var job = await owner.GetAsync<ServiceRequestDetail>($"/api/v1/admin/service-requests/{jobId}");
        job.Card.Status.ShouldBe(ServiceRequestStatus.Accepted);
        job.Technician!.FullName.ShouldBe("Suresh Reddy");
    }

    private static async Task UploadAfterPhotoAsync(TestApi technician, Guid jobId)
    {
        using var form = new MultipartFormDataContent();
        form.Add(new StringContent("PHOTO_AFTER"), "kind");
        var image = new ByteArrayContent(Convert.FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="));
        image.Headers.ContentType = new MediaTypeHeaderValue("image/png");
        form.Add(image, "file", "after.png");

        var response = await technician.Client.PostAsync($"/api/v1/service-requests/{jobId}/attachments", form);
        response.StatusCode.ShouldBe(HttpStatusCode.OK);
    }
}
