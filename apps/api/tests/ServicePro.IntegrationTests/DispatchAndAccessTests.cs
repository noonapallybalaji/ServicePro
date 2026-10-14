using System.Net;
using ServicePro.Contracts;
using ServicePro.IntegrationTests.Infrastructure;
using ServicePro.Modules.Customers.Application;
using ServicePro.Modules.Dispatch.Application;
using ServicePro.Modules.Dispatch.Domain;
using ServicePro.Modules.ServiceRequests.Application;

namespace ServicePro.IntegrationTests;

[Collection(TimeTravelCollection.Name)]
public sealed class DispatchTests(ApiFactory factory)
{
    [Fact]
    public async Task An_unanswered_offer_expires_back_to_the_queue_and_the_technician_is_not_suggested_again()
    {
        var owner = await new TestApi(factory).AsOwnerAsync();
        var (_, jobId) = await owner.NewAcJobAsync();
        var ravi = await owner.TechnicianAsync("Ravi Kumar");
        await owner.AssignAsync(jobId, ravi.Id);

        using (factory.Clock.TravelForward(TimeSpan.FromMinutes(11)))
        {
            (await factory.ExpireOffersAsync()).ShouldBeGreaterThanOrEqualTo(1);
        }

        var job = await owner.GetAsync<ServiceRequestDetail>($"/api/v1/admin/service-requests/{jobId}");
        job.Card.Status.ShouldBe(ServiceRequestStatus.ReadyForAssignment);
        job.Card.TechnicianId.ShouldBeNull();

        var history = await owner.GetAsync<List<AssignmentResponse>>($"/api/v1/admin/service-requests/{jobId}/assignments");
        history.ShouldHaveSingleItem().Status.ShouldBe(AssignmentStatus.Expired);

        var candidates = await owner.GetAsync<List<CandidateResponse>>($"/api/v1/admin/service-requests/{jobId}/candidates");
        candidates.Single(c => c.TechnicianId == ravi.Id).Reasons.ShouldContain(r => r.Contains("Declined or missed"));
    }

    [Fact]
    public async Task Declining_returns_the_job_and_reassigning_cancels_the_previous_offer()
    {
        var owner = await new TestApi(factory).AsOwnerAsync();
        var (_, jobId) = await owner.NewAcJobAsync();
        var ravi = await owner.TechnicianAsync("Ravi Kumar");
        var suresh = await owner.TechnicianAsync("Suresh Reddy");

        var first = await owner.AssignAsync(jobId, ravi.Id);
        await owner.AssignAsync(jobId, suresh.Id);

        var technician = await new TestApi(factory).AsTechnicianAsync(suresh.Phone);
        var offer = (await technician.GetAsync<List<OfferResponse>>("/api/v1/tech/offers")).Single(o => o.ServiceRequestId == jobId);
        await technician.PostAsync($"/api/v1/tech/offers/{offer.AssignmentId}/decline", new DeclineOfferRequest("Too far"));

        var history = await owner.GetAsync<List<AssignmentResponse>>($"/api/v1/admin/service-requests/{jobId}/assignments");
        history.Single(a => a.Id == first.Id).Status.ShouldBe(AssignmentStatus.Cancelled);
        history.Single(a => a.TechnicianId == suresh.Id).Status.ShouldBe(AssignmentStatus.Declined);
        (await owner.GetAsync<ServiceRequestDetail>($"/api/v1/admin/service-requests/{jobId}")).Card.Status.ShouldBe(ServiceRequestStatus.ReadyForAssignment);
    }

    [Fact]
    public async Task Assigning_a_not_recommended_technician_requires_a_reason()
    {
        var owner = await new TestApi(factory).AsOwnerAsync();
        var (_, jobId) = await owner.NewAcJobAsync();
        var priya = await owner.TechnicianAsync("Priya Sharma"); // doesn't cover Kondapur

        var response = await owner.PostRawAsync($"/api/v1/admin/service-requests/{jobId}/assign", new AssignTechnicianRequest(priya.Id, null, false));

        (await TestApi.ProblemAsync(response)).ShouldBe((HttpStatusCode.BadRequest, "dispatch.override_reason_required"));
    }
}

public sealed class AccessAndValidationTests(ApiFactory factory)
{
    [Fact]
    public async Task A_technician_cannot_read_or_move_someone_elses_job()
    {
        var owner = await new TestApi(factory).AsOwnerAsync();
        var (_, jobId) = await owner.NewAcJobAsync();
        var ravi = await owner.TechnicianAsync("Ravi Kumar");
        var suresh = await owner.TechnicianAsync("Suresh Reddy");
        await owner.AssignAsync(jobId, ravi.Id, markAccepted: true);

        var intruder = await new TestApi(factory).AsTechnicianAsync(suresh.Phone);

        (await TestApi.ProblemAsync(await intruder.Client.GetAsync($"/api/v1/tech/jobs/{jobId}"))).Code.ShouldBe("sr.not_assigned");
        var move = await intruder.PostRawAsync($"/api/v1/tech/jobs/{jobId}/transitions", new TransitionRequest(ServiceRequestStatus.EnRoute, null, null, null, null, null));
        (await TestApi.ProblemAsync(move)).ShouldBe((HttpStatusCode.Forbidden, "sr.not_assigned"));
    }

    [Fact]
    public async Task Illegal_status_jumps_are_conflicts()
    {
        var owner = await new TestApi(factory).AsOwnerAsync();
        var (_, jobId) = await owner.NewAcJobAsync();

        var response = await owner.PostRawAsync($"/api/v1/admin/service-requests/{jobId}/transitions",
            new TransitionRequest(ServiceRequestStatus.Completed, "SKIP", null, null, null, null));

        (await TestApi.ProblemAsync(response)).ShouldBe((HttpStatusCode.Conflict, "sr.invalid_transition"));
    }

    [Fact]
    public async Task Validation_errors_name_the_field_and_explain_the_fix()
    {
        var owner = await new TestApi(factory).AsOwnerAsync();

        var response = await owner.PostRawAsync("/api/v1/admin/customers", new CreateCustomerRequest(
            "", "123", null, "not-an-email", "fr", RequestChannel.Phone, null, null));

        response.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        var body = await response.Content.ReadAsStringAsync();
        body.ShouldContain("\"fullName\"");
        body.ShouldContain("\"email\"");
        body.ShouldContain("Supported languages are en, te and hi.");
    }

    [Fact]
    public async Task Duplicate_phone_numbers_point_to_the_existing_customer()
    {
        var owner = await new TestApi(factory).AsOwnerAsync();
        var (customer, _) = await owner.NewAcJobAsync();

        var response = await owner.PostRawAsync("/api/v1/admin/customers", new CreateCustomerRequest(
            "Someone Else", customer.PrimaryPhone, null, null, "en", RequestChannel.Phone, null, null));

        (await TestApi.ProblemAsync(response)).ShouldBe((HttpStatusCode.Conflict, "customer.phone_taken"));
        (await owner.GetAsync<CustomerResponse>($"/api/v1/admin/customers/by-phone/{customer.PrimaryPhone}")).Id.ShouldBe(customer.Id);
    }

    [Fact]
    public async Task Unknown_tracking_tokens_reveal_nothing() =>
        (await TestApi.ProblemAsync(await new TestApi(factory).Client.GetAsync("/api/v1/public/track/not-a-real-token")))
            .ShouldBe((HttpStatusCode.NotFound, "tracking.not_found"));
}
