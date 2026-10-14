using System.Collections.Concurrent;
using ServicePro.Modules.Billing.Application;

namespace ServicePro.IntegrationTests.Infrastructure;

/// <summary>Stands in for Razorpay: links are created in memory, and tests decide when one is paid.</summary>
public sealed class FakePaymentGateway : IPaymentGateway
{
    private readonly ConcurrentDictionary<string, (NewGatewayLink Link, string Status, List<GatewayLinkPayment> Payments)> _links = new();

    public ConcurrentDictionary<string, decimal> Refunds { get; } = new();

    public string Provider => "RAZORPAY";

    public bool IsConfigured => true;

    public Task<GatewayLink> CreateLinkAsync(NewGatewayLink link, CancellationToken ct)
    {
        var id = $"plink_{Guid.NewGuid():N}"[..20];
        _links[id] = (link, "created", []);
        return Task.FromResult(new GatewayLink(id, $"https://rzp.test/{id}", "created"));
    }

    public Task<GatewayLinkState> GetLinkAsync(string linkId, CancellationToken ct)
    {
        var (_, status, payments) = _links[linkId];
        return Task.FromResult(new GatewayLinkState(status, [.. payments]));
    }

    public Task CancelLinkAsync(string linkId, CancellationToken ct)
    {
        var entry = _links[linkId];
        if (entry.Status == "paid")
        {
            throw new PaymentGatewayException("Payment link already paid");
        }

        _links[linkId] = entry with { Status = "cancelled" };
        return Task.CompletedTask;
    }

    public Task<GatewayRefund> RefundAsync(string providerPaymentId, decimal amount, string receipt, CancellationToken ct)
    {
        var id = $"rfnd_{Guid.NewGuid():N}"[..19];
        Refunds[id] = amount;
        return Task.FromResult(new GatewayRefund(id, "pending"));
    }

    /// <summary>The customer pays on the gateway page; returns the gateway payment id.</summary>
    public string Pay(string linkId, decimal amount)
    {
        var entry = _links[linkId];
        var paymentId = $"pay_{Guid.NewGuid():N}"[..18];
        entry.Payments.Add(new GatewayLinkPayment(paymentId, amount, "captured"));
        _links[linkId] = entry with { Status = "paid" };
        return paymentId;
    }

    public string LinkIdFromUrl(string url) => url[(url.LastIndexOf('/') + 1)..];
}
