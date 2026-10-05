using ServicePro.Modules.Billing.Domain;
using ServicePro.SharedKernel.Abstractions;

namespace ServicePro.UnitTests.Billing;

public sealed class InvoiceTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 5, 10, 0, 0, TimeSpan.Zero);

    private static Invoice Issue(decimal gst = 0) => Invoice.Issue("INV-2026-00001", Guid.NewGuid(), "SR-1", Guid.NewGuid(), null,
    [
        new(InvoiceLineType.Visit, "Visiting charge", 1, 349),
        new(InvoiceLineType.Part, "Capacitor", 2, 225.50m),
    ], gst, Now).Value;

    [Fact]
    public void Totals_include_tax_rounded_to_paise()
    {
        var invoice = Issue(gst: 18);

        invoice.Subtotal.ShouldBe(800m);
        invoice.TaxAmount.ShouldBe(144m);
        invoice.Total.ShouldBe(944m);
        invoice.Lines.Select(l => l.Position).ShouldBe([1, 2]);
    }

    [Fact]
    public void Payments_update_status_and_cannot_exceed_the_balance()
    {
        var invoice = Issue();

        invoice.ApplyPayment(900).Error!.Code.ShouldBe("payment.amount_invalid");
        invoice.ApplyPayment(300).IsSuccess.ShouldBeTrue();
        invoice.Status.ShouldBe(InvoiceStatus.PartiallyPaid);
        invoice.ApplyPayment(500).IsSuccess.ShouldBeTrue();
        invoice.Status.ShouldBe(InvoiceStatus.Paid);
        invoice.Outstanding.ShouldBe(0);
    }

    [Fact]
    public void Lines_are_locked_once_money_is_received()
    {
        var invoice = Issue();
        invoice.ApplyPayment(100);

        invoice.ReplaceLines([new(InvoiceLineType.Labour, "Labour", 1, 10)], 0).Error!.Code.ShouldBe("invoice.locked");
        invoice.Void().IsFailure.ShouldBeTrue();
    }

    [Fact]
    public void A_bill_needs_at_least_one_line() =>
        Invoice.Issue("INV-1", Guid.NewGuid(), "SR-1", Guid.NewGuid(), null, [], 0, Now).Error!.Code.ShouldBe("invoice.empty");
}

public sealed class LedgerBalancesTests
{
    [Fact]
    public void Cash_and_earnings_are_tracked_separately()
    {
        var technician = Guid.NewGuid();
        var at = DateTimeOffset.UtcNow;
        TechnicianLedgerEntry Entry(LedgerEntryType type, decimal amount) => new(technician, type, amount, null, null, null, at);

        var balances = LedgerBalances.From(
        [
            Entry(LedgerEntryType.CashCollected, 2599),
            Entry(LedgerEntryType.CashCollected, 1000),
            Entry(LedgerEntryType.CashDeposited, 2599),
            Entry(LedgerEntryType.CommissionEarned, 519.80m),
            Entry(LedgerEntryType.Payout, 300),
            Entry(LedgerEntryType.Adjustment, -19.80m),
        ]);

        balances.CashInHand.ShouldBe(1000m);
        balances.EarningsDue.ShouldBe(200m);
    }

    [Fact]
    public void Ledger_uses_the_system_actor_type_names() =>
        Enum.GetNames<ActorType>().ShouldContain(nameof(ActorType.Technician));
}
