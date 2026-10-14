using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using ServicePro.Api.Hosting;
using ServicePro.Contracts;
using ServicePro.IntegrationTests.Infrastructure;
using ServicePro.Modules.Billing.Application;
using ServicePro.Modules.Billing.Domain;
using ServicePro.Modules.Notifications;
using ServicePro.Modules.ServiceRequests.Application;

namespace ServicePro.IntegrationTests;

/// <summary>The technician sends an estimate; the customer approves (with a code) or declines on their tracking link.</summary>
public sealed class EstimateTests(ApiFactory factory)
{
    private static readonly SendEstimateRequest GasTopUp = new(
    [
        new InvoiceLineInput(InvoiceLineType.Part, "Gas top-up", 1, 1800),
        new InvoiceLineInput(InvoiceLineType.Labour, "Leak repair", 1, 450),
    ]);

    /// <summary>A job Priya is diagnosing, plus its tracking token.</summary>
    internal static async Task<(TestApi Owner, TestApi Technician, Guid JobId, string Token)> DiagnosingJobAsync(ApiFactory factory)
    {
        var owner = await new TestApi(factory).AsOwnerAsync();
        var (_, jobId) = await owner.NewAcJobAsync();
        var priya = await owner.TechnicianAsync("Priya Sharma");
        await owner.AssignAsync(jobId, priya.Id, markAccepted: true);
        var technician = await new TestApi(factory).AsTechnicianAsync(priya.Phone);
        foreach (var status in new[] { ServiceRequestStatus.EnRoute, ServiceRequestStatus.Arrived, ServiceRequestStatus.Diagnosing })
        {
            await technician.PostAsync($"/api/v1/tech/jobs/{jobId}/transitions", new TransitionRequest(status, null, null, null, null, null));
        }

        var detail = await owner.GetAsync<ServiceRequestDetail>($"/api/v1/admin/service-requests/{jobId}");
        return (owner, technician, jobId, detail.TrackingPath.Split('/')[^1]);
    }

    private async Task<List<string>> MessagesAsync(TestApi owner, Guid jobId)
    {
        await factory.DrainOutboxAsync();
        return [.. (await owner.GetAsync<List<NotificationResponse>>($"/api/v1/admin/notifications?serviceRequestId={jobId}")).Select(m => m.TemplateCode)];
    }

    [Fact]
    public async Task The_customer_approves_with_a_code_and_the_repair_starts()
    {
        var (owner, technician, jobId, token) = await DiagnosingJobAsync(factory);

        var sent = await technician.PostAsync<EstimateResponse>($"/api/v1/service-requests/{jobId}/estimates", GasTopUp);
        sent.Total.ShouldBe(2250m);
        (await owner.GetAsync<ServiceRequestDetail>($"/api/v1/admin/service-requests/{jobId}")).Card.Status.ShouldBe(ServiceRequestStatus.AwaitingEstimateApproval);
        (await MessagesAsync(owner, jobId)).ShouldContain("ESTIMATE_SENT");

        var customer = new TestApi(factory);
        var view = await customer.GetAsync<CustomerEstimateResponse>($"/api/v1/public/track/{token}/estimate");
        view.CodeRequired.ShouldBeTrue();
        view.Estimate.Lines.Count.ShouldBe(2);

        var noCode = await customer.PostRawAsync($"/api/v1/public/track/{token}/estimate/{sent.Id}/answer", new AnswerEstimateRequest(true, null, null));
        (await TestApi.ProblemAsync(noCode)).Code.ShouldBe("estimate.code_required");

        var code = await customer.PostAsync<EstimateCodeResponse>($"/api/v1/public/track/{token}/estimate/code", null);
        var wrong = code.DevelopmentCode == "000000" ? "111111" : "000000";
        (await customer.PostRawAsync($"/api/v1/public/track/{token}/estimate/{sent.Id}/answer", new AnswerEstimateRequest(true, wrong, null)))
            .StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        var approved = await customer.PostAsync<EstimateResponse>($"/api/v1/public/track/{token}/estimate/{sent.Id}/answer", new AnswerEstimateRequest(true, code.DevelopmentCode, null));
        approved.Status.ShouldBe(EstimateStatus.Approved);
        approved.ApprovalMethod.ShouldBe(EstimateApprovalMethod.Otp);

        (await owner.GetAsync<ServiceRequestDetail>($"/api/v1/admin/service-requests/{jobId}")).Card.Status.ShouldBe(ServiceRequestStatus.InProgress);
        (await MessagesAsync(owner, jobId)).ShouldContain("TECH_ESTIMATE_APPROVED");

        var again = await customer.PostRawAsync($"/api/v1/public/track/{token}/estimate/{sent.Id}/answer", new AnswerEstimateRequest(false, null, null));
        (await TestApi.ProblemAsync(again)).Code.ShouldBe("estimate.already_answered");
    }

    [Fact]
    public async Task A_revised_estimate_replaces_the_old_one_and_declining_means_visit_charge_only()
    {
        var (owner, technician, jobId, token) = await DiagnosingJobAsync(factory);
        var first = await technician.PostAsync<EstimateResponse>($"/api/v1/service-requests/{jobId}/estimates", GasTopUp);
        var second = await technician.PostAsync<EstimateResponse>($"/api/v1/service-requests/{jobId}/estimates",
            new SendEstimateRequest([new InvoiceLineInput(InvoiceLineType.Part, "Capacitor", 1, 600)]));
        second.Version.ShouldBe(2);

        var customer = new TestApi(factory);
        (await customer.GetAsync<CustomerEstimateResponse>($"/api/v1/public/track/{token}/estimate")).Estimate.Id.ShouldBe(second.Id);
        (await customer.PostRawAsync($"/api/v1/public/track/{token}/estimate/{first.Id}/answer", new AnswerEstimateRequest(false, null, null)))
            .StatusCode.ShouldBe(HttpStatusCode.NotFound);

        var declined = await customer.PostAsync<EstimateResponse>($"/api/v1/public/track/{token}/estimate/{second.Id}/answer",
            new AnswerEstimateRequest(false, null, "Too expensive"));
        declined.Status.ShouldBe(EstimateStatus.Rejected);
        (await owner.GetAsync<ServiceRequestDetail>($"/api/v1/admin/service-requests/{jobId}")).Card.Status.ShouldBe(ServiceRequestStatus.UnableToRepair);
        (await MessagesAsync(owner, jobId)).ShouldContain("TECH_ESTIMATE_DECLINED");

        var history = await owner.GetAsync<List<EstimateResponse>>($"/api/v1/service-requests/{jobId}/estimates");
        history.Select(e => e.Status).ShouldBe([EstimateStatus.Rejected, EstimateStatus.Superseded]);
    }

    [Fact]
    public async Task Only_the_estimate_flow_moves_the_job_and_only_staff_record_a_phone_approval()
    {
        var (owner, technician, jobId, _) = await DiagnosingJobAsync(factory);

        var shortcut = await technician.PostRawAsync($"/api/v1/tech/jobs/{jobId}/transitions",
            new TransitionRequest(ServiceRequestStatus.AwaitingEstimateApproval, null, null, null, null, null));
        (await TestApi.ProblemAsync(shortcut)).Code.ShouldBe("sr.use_estimate");

        var sent = await technician.PostAsync<EstimateResponse>($"/api/v1/service-requests/{jobId}/estimates", GasTopUp);
        (await technician.PostRawAsync($"/api/v1/service-requests/{jobId}/estimates/{sent.Id}/record-approval", new RecordEstimateApprovalRequest("Customer said yes")))
            .StatusCode.ShouldBe(HttpStatusCode.Forbidden);

        var recorded = await owner.PostAsync<EstimateResponse>($"/api/v1/service-requests/{jobId}/estimates/{sent.Id}/record-approval",
            new RecordEstimateApprovalRequest("Customer approved on a call with Lakshmi at 11:05"));
        recorded.ApprovalMethod.ShouldBe(EstimateApprovalMethod.StaffRecorded);
        (await owner.GetAsync<ServiceRequestDetail>($"/api/v1/admin/service-requests/{jobId}")).Card.Status.ShouldBe(ServiceRequestStatus.InProgress);
    }
}

/// <summary>Changes a shared setting, so it runs on its own.</summary>
[Collection(TimeTravelCollection.Name)]
public sealed class EstimateRequiredTests(ApiFactory factory)
{
    [Fact]
    public async Task When_required_the_technician_cannot_start_the_repair_without_an_approved_estimate()
    {
        var (owner, technician, jobId, _) = await EstimateTests.DiagnosingJobAsync(factory);
        await SetAsync(owner, true);
        try
        {
            var skipped = await technician.PostRawAsync($"/api/v1/tech/jobs/{jobId}/transitions",
                new TransitionRequest(ServiceRequestStatus.InProgress, null, null, null, null, null));
            (await TestApi.ProblemAsync(skipped)).Code.ShouldBe("sr.estimate_required");
        }
        finally
        {
            await SetAsync(owner, false);
        }
    }

    private static async Task SetAsync(TestApi owner, bool required) =>
        (await owner.Client.PutAsJsonAsync("/api/v1/admin/settings/estimates.required_before_repair",
            new UpdateSettingRequest(JsonSerializer.SerializeToElement(required)), TestApi.Json)).StatusCode.ShouldBe(HttpStatusCode.NoContent);
}
