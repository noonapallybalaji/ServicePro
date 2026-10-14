using System.Net;
using ServicePro.IntegrationTests.Infrastructure;
using ServicePro.Modules.Billing.Application;
using ServicePro.Modules.Billing.Domain;
using ServicePro.Modules.Notifications;
using ServicePro.Modules.ServiceRequests.Application;
using ServicePro.Modules.Technicians.Application;

namespace ServicePro.IntegrationTests;

/// <summary>Customers rate finished jobs on their tracking link; ratings reach the technician.</summary>
public sealed class ReviewTests(ApiFactory factory)
{
    [Fact]
    public async Task A_customer_rates_a_finished_job_once_and_the_technician_average_moves()
    {
        var (owner, technician, jobId, token) = await OnlinePaymentTests.CompletedJobAsync(factory);
        await technician.PostAsync<PaymentResponse>($"/api/v1/service-requests/{jobId}/payments", new RecordPaymentRequest(PaymentMethod.Cash, 2149, null));
        var customer = new TestApi(factory);
        (await customer.GetAsync<TrackingResponse>($"/api/v1/public/track/{token}")).CanReview.ShouldBeTrue();

        var review = await customer.PostAsync<ReviewResponse>($"/api/v1/public/track/{token}/review", new SubmitReviewRequest(1, "Came two hours late"));
        review.Rating.ShouldBe(1);

        var again = await customer.PostRawAsync($"/api/v1/public/track/{token}/review", new SubmitReviewRequest(5, null));
        (await TestApi.ProblemAsync(again)).Code.ShouldBe("review.already_submitted");

        var tracking = await customer.GetAsync<TrackingResponse>($"/api/v1/public/track/{token}");
        tracking.CanReview.ShouldBeFalse();
        tracking.Review!.Comment.ShouldBe("Came two hours late");
        (await owner.GetAsync<ServiceRequestDetail>($"/api/v1/admin/service-requests/{jobId}")).Review!.Rating.ShouldBe(1);
        (await owner.GetAsync<List<ReviewListItem>>("/api/v1/admin/reviews?maxRating=2")).ShouldContain(r => r.ServiceRequestId == jobId);

        await factory.DrainOutboxAsync();
        var priya = await owner.TechnicianAsync("Priya Sharma");
        (await owner.GetAsync<TechnicianResponse>($"/api/v1/admin/technicians/{priya.Id}")).RatingAverage.ShouldNotBeNull();
    }

    [Fact]
    public async Task An_unfinished_job_cannot_be_rated()
    {
        var (_, _, _, token) = await EstimateTests.DiagnosingJobAsync(factory);

        var early = await new TestApi(factory).PostRawAsync($"/api/v1/public/track/{token}/review", new SubmitReviewRequest(5, null));

        (await TestApi.ProblemAsync(early)).ShouldBe((HttpStatusCode.Conflict, "review.not_finished"));
    }
}

/// <summary>Moves the shared clock, so it runs on its own.</summary>
[Collection(TimeTravelCollection.Name)]
public sealed class FeedbackRequestTests(ApiFactory factory)
{
    [Fact]
    public async Task Customers_are_asked_for_a_rating_once_two_hours_after_the_job_closes()
    {
        var (owner, technician, jobId, _) = await OnlinePaymentTests.CompletedJobAsync(factory);
        await technician.PostAsync<PaymentResponse>($"/api/v1/service-requests/{jobId}/payments", new RecordPaymentRequest(PaymentMethod.Cash, 2149, null));

        await factory.SendFeedbackRequestsAsync();
        (await MessagesAsync(owner, jobId)).ShouldNotContain("FEEDBACK_REQUEST"); // too soon

        using (factory.Clock.TravelForward(TimeSpan.FromMinutes(121)))
        {
            await factory.SendFeedbackRequestsAsync();
            await factory.SendFeedbackRequestsAsync();
        }

        (await MessagesAsync(owner, jobId)).Count(code => code == "FEEDBACK_REQUEST").ShouldBe(1);
    }

    private async Task<List<string>> MessagesAsync(TestApi owner, Guid jobId)
    {
        await factory.DrainOutboxAsync();
        return [.. (await owner.GetAsync<List<NotificationResponse>>($"/api/v1/admin/notifications?serviceRequestId={jobId}")).Select(m => m.TemplateCode)];
    }
}
