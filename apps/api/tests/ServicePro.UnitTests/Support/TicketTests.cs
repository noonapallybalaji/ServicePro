using ServicePro.Contracts;
using ServicePro.Modules.Support.Domain;

namespace ServicePro.UnitTests.Support;

public sealed class TicketTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 15, 10, 0, 0, TimeSpan.Zero);

    private static SupportTicket Open(TicketCategory category = TicketCategory.Booking) =>
        SupportTicket.Open("TK-1", Guid.NewGuid(), null, null, null, null, category, RequestChannel.Website, MessageAuthor.Customer,
            "Where is my technician?", TimeSpan.FromMinutes(120), Now).Value;

    [Fact]
    public void An_internal_note_is_not_a_reply_so_the_ticket_can_still_be_late()
    {
        var ticket = Open();

        ticket.StaffWrites(Guid.NewGuid(), "Calling the technician", isInternal: true, Now.AddMinutes(5));

        ticket.FirstResponseAt.ShouldBeNull();
        ticket.Status.ShouldBe(TicketStatus.Open);
        ticket.IsOverdue(Now.AddMinutes(121)).ShouldBeTrue();
    }

    [Fact]
    public void A_reply_meets_the_target_and_waits_for_the_customer()
    {
        var ticket = Open();

        ticket.StaffWrites(Guid.NewGuid(), "He'll call you in 10 minutes.", isInternal: false, Now.AddMinutes(30));

        ticket.FirstResponseAt.ShouldBe(Now.AddMinutes(30));
        ticket.Status.ShouldBe(TicketStatus.WaitingOnCustomer);
        ticket.IsOverdue(Now.AddDays(1)).ShouldBeFalse();
    }

    [Fact]
    public void Writing_again_reopens_a_resolved_ticket()
    {
        var ticket = Open();
        ticket.Resolve(Now);

        ticket.CustomerWrites("It's broken again", Now.AddDays(1));

        ticket.Status.ShouldBe(TicketStatus.Open);
        ticket.ResolvedAt.ShouldBeNull();
    }

    [Fact]
    public void Damage_reports_are_high_priority_with_half_the_reply_time()
    {
        var ticket = Open(TicketCategory.DamageOrSafety);

        ticket.HighPriority.ShouldBeTrue();
        ticket.FirstResponseDueAt.ShouldBe(Now.AddMinutes(60));
    }

    [Fact]
    public void A_ticket_needs_a_way_to_reach_the_customer() =>
        SupportTicket.Open("TK-2", null, null, null, null, null, TicketCategory.Other, RequestChannel.WhatsApp, MessageAuthor.Assistant,
            "Hello", TimeSpan.FromHours(1), Now).Error!.Code.ShouldBe("support.contact_required");
}
