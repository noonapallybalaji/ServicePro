using ServicePro.Contracts.Events;
using ServicePro.Modules.Billing.Domain;

namespace ServicePro.UnitTests.Billing;

public sealed class EstimateTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 14, 10, 0, 0, TimeSpan.Zero);

    private static Estimate Send(decimal gst = 0) => Estimate.Send(Guid.NewGuid(), 1,
    [
        new InvoiceLineInput(InvoiceLineType.Part, "Gas top-up", 1, 1800),
        new InvoiceLineInput(InvoiceLineType.Labour, "Labour", 2, 225.50m),
    ], gst, null, Now).Value;

    [Fact]
    public void Totals_include_gst_rounded_to_paise()
    {
        var estimate = Send(gst: 18);

        estimate.Subtotal.ShouldBe(2251m);
        estimate.TaxAmount.ShouldBe(405.18m);
        estimate.Total.ShouldBe(2656.18m);
    }

    [Fact]
    public void An_empty_estimate_is_refused() =>
        Estimate.Send(Guid.NewGuid(), 1, [], 0, null, Now).Error!.Code.ShouldBe("estimate.empty");

    [Fact]
    public void An_estimate_is_answered_once()
    {
        var estimate = Send();

        estimate.Approve(EstimateApprovalMethod.Otp, null, null, Now).IsSuccess.ShouldBeTrue();
        estimate.Reject("Changed my mind", Now).Error!.Code.ShouldBe("estimate.already_answered");
        estimate.DomainEvents.OfType<EstimateAnswered>().ShouldHaveSingleItem().Approved.ShouldBeTrue();
    }

    [Fact]
    public void A_superseded_estimate_can_no_longer_be_approved()
    {
        var estimate = Send();

        estimate.Supersede();

        estimate.Approve(EstimateApprovalMethod.LinkTap, null, null, Now).Error!.Code.ShouldBe("estimate.already_answered");
    }
}
