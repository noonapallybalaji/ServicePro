using ServicePro.Contracts;
using ServicePro.Contracts.Events;
using ServicePro.Modules.ServiceRequests.Domain;
using ServicePro.SharedKernel.Abstractions;

namespace ServicePro.UnitTests.ServiceRequests;

public sealed class ServiceRequestTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 5, 10, 0, 0, TimeSpan.Zero);
    private static readonly Actor Staff = new(ActorType.User, Guid.NewGuid());
    private static readonly Guid TechnicianId = Guid.NewGuid();
    private static readonly Actor Technician = new(ActorType.Technician, Guid.NewGuid());

    private static ServiceRequest NewRequest() => ServiceRequest.Create(
        new NewServiceRequest("SR-10001", Guid.NewGuid(), Guid.NewGuid(), null, Guid.NewGuid(), null,
            "AC not cooling", RequestChannel.Phone, Priority.Normal, 349, null, null, null, null, false, null),
        Staff, Now);

    /// <summary>A request that has been offered to and accepted by <see cref="TechnicianId"/>.</summary>
    private static ServiceRequest AcceptedRequest()
    {
        var request = NewRequest();
        request.Offer(TechnicianId, Guid.NewGuid(), Staff, Now).IsSuccess.ShouldBeTrue();
        request.AcceptOffer(TechnicianId, Technician, Now).IsSuccess.ShouldBeTrue();
        request.ClearDomainEvents();
        return request;
    }

    private static TransitionInput AsTechnician(string? code = null, bool photo = false, bool categoryRequiresPhotos = false, string? reason = null) =>
        new(ReasonCode: reason, CompletionCode: code, TechnicianId: TechnicianId, HasAfterPhoto: photo, CategoryRequiresPhotos: categoryRequiresPhotos);

    private static string IssuedCode(ServiceRequest request) =>
        request.DomainEvents.OfType<CompletionCodeIssued>().Last().Code;

    private static ServiceRequest InProgress(out string completionCode)
    {
        var request = AcceptedRequest();
        foreach (var to in new[] { ServiceRequestStatus.EnRoute, ServiceRequestStatus.Arrived, ServiceRequestStatus.Diagnosing, ServiceRequestStatus.InProgress })
        {
            request.Transition(to, Technician, AsTechnician(), Now).IsSuccess.ShouldBeTrue();
        }

        completionCode = IssuedCode(request);
        return request;
    }

    [Fact]
    public void Staff_created_requests_start_ready_for_assignment_with_history_and_events()
    {
        var request = NewRequest();

        request.Status.ShouldBe(ServiceRequestStatus.ReadyForAssignment);
        request.History.ShouldHaveSingleItem().ToStatus.ShouldBe(ServiceRequestStatus.ReadyForAssignment);
        request.DomainEvents.OfType<ServiceRequestCreated>().ShouldHaveSingleItem();
        request.DomainEvents.OfType<ServiceRequestStatusChanged>().ShouldHaveSingleItem();
        request.TrackingToken.Length.ShouldBeGreaterThanOrEqualTo(20);
    }

    [Fact]
    public void Online_bookings_wait_in_new_until_staff_confirm_them()
    {
        var request = ServiceRequest.Create(
            new NewServiceRequest("SR-10002", Guid.NewGuid(), Guid.NewGuid(), null, Guid.NewGuid(), null,
                "Fridge not cooling", RequestChannel.Website, Priority.Normal, 349, Now.AddDays(1), Now.AddDays(1).AddHours(3),
                null, null, false, null, AwaitsReview: true),
            Actor.Customer, Now);

        request.Status.ShouldBe(ServiceRequestStatus.New);
        request.DomainEvents.OfType<ServiceRequestCreated>().ShouldHaveSingleItem();
        request.Offer(TechnicianId, Guid.NewGuid(), Staff, Now).IsFailure.ShouldBeTrue();

        request.Transition(ServiceRequestStatus.ReadyForAssignment, Staff, new TransitionInput(), Now).IsSuccess.ShouldBeTrue();
        request.Offer(TechnicianId, Guid.NewGuid(), Staff, Now).IsSuccess.ShouldBeTrue();
    }

    [Fact]
    public void Dispatch_transitions_cannot_be_made_through_the_manual_path()
    {
        var request = NewRequest();

        var result = request.Transition(ServiceRequestStatus.Offered, Staff, new TransitionInput(), Now);

        result.Error!.Code.ShouldBe("sr.use_dispatch");
    }

    [Fact]
    public void Only_the_offered_technician_can_accept()
    {
        var request = NewRequest();
        request.Offer(TechnicianId, Guid.NewGuid(), Staff, Now);

        request.AcceptOffer(Guid.NewGuid(), Technician, Now).Error!.Code.ShouldBe("sr.offer_not_yours");
        request.AcceptOffer(TechnicianId, Technician, Now).IsSuccess.ShouldBeTrue();
        request.Status.ShouldBe(ServiceRequestStatus.Accepted);
    }

    [Fact]
    public void A_technician_cannot_move_a_job_assigned_to_someone_else()
    {
        var request = AcceptedRequest();

        var result = request.Transition(ServiceRequestStatus.EnRoute, Technician, new TransitionInput(TechnicianId: Guid.NewGuid()), Now);

        result.Error!.Code.ShouldBe("sr.not_assigned");
        request.Status.ShouldBe(ServiceRequestStatus.Accepted);
    }

    [Fact]
    public void Arriving_issues_a_four_digit_completion_code_and_stores_only_its_hash()
    {
        var request = AcceptedRequest();
        request.Transition(ServiceRequestStatus.EnRoute, Technician, AsTechnician(), Now);
        request.Transition(ServiceRequestStatus.Arrived, Technician, AsTechnician(), Now);

        var code = IssuedCode(request);
        code.Length.ShouldBe(4);
        request.CompletionCodeHash.ShouldNotBeNull();
        request.CompletionCodeHash.ShouldNotContain(code);
    }

    [Fact]
    public void Completing_requires_the_customers_code()
    {
        var request = InProgress(out var code);

        request.Transition(ServiceRequestStatus.Completed, Technician, AsTechnician("0000" == code ? "1111" : "0000"), Now)
            .Error!.Code.ShouldBe("sr.code_mismatch");
        request.Transition(ServiceRequestStatus.Completed, Technician, AsTechnician(code), Now).IsSuccess.ShouldBeTrue();
        request.Status.ShouldBe(ServiceRequestStatus.Completed);
        request.PaymentStatus.ShouldBe(PaymentStatus.Pending);
    }

    [Fact]
    public void Completion_code_locks_after_five_wrong_attempts()
    {
        var request = InProgress(out var code);
        var wrong = code == "0000" ? "1111" : "0000";

        for (var i = 0; i < ServiceRequest.CompletionCodeMaxAttempts; i++)
        {
            request.Transition(ServiceRequestStatus.Completed, Technician, AsTechnician(wrong), Now);
        }

        request.Transition(ServiceRequestStatus.Completed, Technician, AsTechnician(code), Now).Error!.Code.ShouldBe("sr.code_locked");

        request.ReissueCompletionCode().IsSuccess.ShouldBeTrue();
        request.Transition(ServiceRequestStatus.Completed, Technician, AsTechnician(IssuedCode(request)), Now).IsSuccess.ShouldBeTrue();
    }

    [Fact]
    public void Technicians_must_add_an_after_photo_when_the_category_requires_it()
    {
        var request = InProgress(out var code);

        request.Transition(ServiceRequestStatus.Completed, Technician, AsTechnician(code, photo: false, categoryRequiresPhotos: true), Now)
            .Error!.Code.ShouldBe("sr.photo_required");
        request.Transition(ServiceRequestStatus.Completed, Technician, AsTechnician(code, photo: true, categoryRequiresPhotos: true), Now)
            .IsSuccess.ShouldBeTrue();
    }

    [Fact]
    public void Staff_can_complete_without_the_code_only_with_a_reason()
    {
        var request = InProgress(out _);

        request.Transition(ServiceRequestStatus.Completed, Staff, new TransitionInput(), Now).Error!.Code.ShouldBe("sr.reason_required");
        request.Transition(ServiceRequestStatus.Completed, Staff, new TransitionInput(ReasonCode: "CUSTOMER_CONFIRMED_BY_PHONE"), Now).IsSuccess.ShouldBeTrue();
    }

    [Fact]
    public void Exception_statuses_need_a_reason()
    {
        var request = InProgress(out _);

        request.Transition(ServiceRequestStatus.WaitingForParts, Technician, AsTechnician(), Now).Error!.Code.ShouldBe("sr.reason_required");
        request.Transition(ServiceRequestStatus.WaitingForParts, Technician, AsTechnician(reason: "COMPRESSOR"), Now).IsSuccess.ShouldBeTrue();
        request.StatusReason.ShouldBe("COMPRESSOR");
    }

    [Fact]
    public void Full_payment_closes_a_completed_job()
    {
        var request = InProgress(out var code);
        request.Transition(ServiceRequestStatus.Completed, Technician, AsTechnician(code), Now);

        request.ApplyPayment(PaymentStatus.Partial, 2599, Actor.System, Now).IsSuccess.ShouldBeTrue();
        request.Status.ShouldBe(ServiceRequestStatus.Completed);

        request.ApplyPayment(PaymentStatus.Paid, 2599, Actor.System, Now).IsSuccess.ShouldBeTrue();
        request.Status.ShouldBe(ServiceRequestStatus.Closed);
        request.ClosedAt.ShouldBe(Now);
    }

    [Fact]
    public void Declining_returns_the_job_to_the_queue_and_clears_the_technician()
    {
        var request = NewRequest();
        request.Offer(TechnicianId, Guid.NewGuid(), Staff, Now);

        request.ReturnToQueue("OFFER_DECLINED", Technician, Now).IsSuccess.ShouldBeTrue();

        request.Status.ShouldBe(ServiceRequestStatus.ReadyForAssignment);
        request.CurrentTechnicianId.ShouldBeNull();
    }
}

public sealed class ServiceRequestWorkflowTests
{
    [Fact]
    public void Every_unfinished_status_can_be_cancelled_by_staff_only()
    {
        var unfinished = Enum.GetValues<ServiceRequestStatus>()
            .Where(s => !ServiceRequestWorkflow.Terminal.Contains(s) && s != ServiceRequestStatus.Completed);

        foreach (var status in unfinished)
        {
            var rule = ServiceRequestWorkflow.Find(status, ServiceRequestStatus.Cancelled).ShouldNotBeNull();
            rule.Actors.ShouldBe(TransitionActors.Staff);
            rule.Requirements.HasFlag(TransitionRequirements.Reason).ShouldBeTrue();
        }
    }

    [Fact]
    public void Terminal_statuses_have_no_way_out()
    {
        foreach (var terminal in ServiceRequestWorkflow.Terminal)
        {
            ServiceRequestWorkflow.From(terminal).ShouldBeEmpty();
        }
    }

    [Fact]
    public void Rules_are_unique_per_from_and_to() =>
        ServiceRequestWorkflow.Rules.GroupBy(r => (r.From, r.To)).ShouldAllBe(g => g.Count() == 1);
}
