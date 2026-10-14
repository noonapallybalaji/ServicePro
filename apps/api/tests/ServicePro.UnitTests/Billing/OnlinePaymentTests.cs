using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using ServicePro.Modules.Billing.Application;
using ServicePro.Modules.Billing.Domain;

namespace ServicePro.UnitTests.Billing;

public sealed class RazorpayTests
{
    [Fact]
    public void Payment_link_amounts_are_in_paise_and_razorpay_sends_no_messages_of_its_own()
    {
        var payload = RazorpayGateway.BuildLinkPayload(new NewGatewayLink(
            "ref-1", 2149.50m, "Bill INV-1", "Asha Rao", "+919876543210", "https://site.test/t/abc?payment=done", DateTimeOffset.FromUnixTimeSeconds(1_800_000_000)));

        using var json = JsonDocument.Parse(JsonSerializer.Serialize(payload));
        var root = json.RootElement;
        root.GetProperty("amount").GetInt64().ShouldBe(214950);
        root.GetProperty("currency").GetString().ShouldBe("INR");
        root.GetProperty("accept_partial").GetBoolean().ShouldBeFalse();
        root.GetProperty("reference_id").GetString().ShouldBe("ref-1");
        root.GetProperty("expire_by").GetInt64().ShouldBe(1_800_000_000);
        root.GetProperty("notify").GetProperty("sms").GetBoolean().ShouldBeFalse();
        root.GetProperty("callback_method").GetString().ShouldBe("get");
    }

    [Fact]
    public void Reads_captured_payments_from_a_fetched_link()
    {
        using var json = JsonDocument.Parse("""
            {"id":"plink_1","status":"paid","payments":[{"payment_id":"pay_1","amount":214900,"status":"captured","method":"upi"}]}
            """);

        var state = RazorpayGateway.ParseLinkState(json.RootElement);

        state.Status.ShouldBe("paid");
        state.Payments.ShouldHaveSingleItem().ShouldBe(new GatewayLinkPayment("pay_1", 2149m, "captured"));
    }

    [Fact]
    public void A_link_with_no_payments_yet_has_null_payments()
    {
        using var json = JsonDocument.Parse("""{"id":"plink_1","status":"created","payments":null}""");

        RazorpayGateway.ParseLinkState(json.RootElement).Payments.ShouldBeEmpty();
    }

    [Fact]
    public void Webhook_signature_is_the_hex_hmac_of_the_raw_body()
    {
        const string body = """{"event":"payment_link.paid"}""";
        var signature = Convert.ToHexStringLower(HMACSHA256.HashData(Encoding.UTF8.GetBytes("secret"), Encoding.UTF8.GetBytes(body)));

        RazorpayGateway.IsValidWebhookSignature(body, signature, "secret").ShouldBeTrue();
        RazorpayGateway.IsValidWebhookSignature(body + " ", signature, "secret").ShouldBeFalse();
        RazorpayGateway.IsValidWebhookSignature(body, signature, "other").ShouldBeFalse();
        RazorpayGateway.IsValidWebhookSignature(body, "not-hex", "secret").ShouldBeFalse();
        RazorpayGateway.IsValidWebhookSignature(body, null, "secret").ShouldBeFalse();
    }
}

public sealed class RefundTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 14, 10, 0, 0, TimeSpan.Zero);

    private static Payment CashPayment(decimal amount)
    {
        var invoice = Invoice.Issue("INV-1", Guid.NewGuid(), "SR-1", Guid.NewGuid(), null,
            [new InvoiceLineInput(InvoiceLineType.Visit, "Visit", 1, amount)], 0, Now).Value;
        invoice.ApplyPayment(amount);
        return Payment.Record(invoice, PaymentMethod.Cash, amount, null, null, null, Now);
    }

    [Fact]
    public void Refunds_reserve_the_payment_so_the_total_can_never_exceed_what_was_paid()
    {
        var payment = CashPayment(1000);

        Refund.Request(payment, 600, "Part returned", RefundStatus.Pending, null, Now).IsSuccess.ShouldBeTrue();

        payment.Refundable.ShouldBe(400);
        Refund.Request(payment, 401, "Again", RefundStatus.Pending, null, Now).Error!.Code.ShouldBe("refund.amount_invalid");
    }

    [Fact]
    public void A_failed_refund_makes_the_money_refundable_again()
    {
        var payment = CashPayment(1000);
        var refund = Refund.Request(payment, 1000, "Cancelled", RefundStatus.Pending, null, Now).Value;

        refund.MarkFailed(payment, "Bank rejected it");
        refund.MarkFailed(payment, "Reported twice");

        refund.Status.ShouldBe(RefundStatus.Failed);
        payment.Refundable.ShouldBe(1000);
    }

    [Fact]
    public void Processing_a_refund_twice_announces_it_once()
    {
        var refund = Refund.Request(CashPayment(500), 500, "Overpaid", RefundStatus.Pending, null, Now).Value;

        refund.MarkProcessed("rfnd_1", Now);
        refund.MarkProcessed("rfnd_1", Now.AddMinutes(5));

        refund.DomainEvents.OfType<ServicePro.Contracts.Events.RefundProcessed>().ShouldHaveSingleItem();
        refund.ProcessedAt.ShouldBe(Now);
    }
}
