using System.Globalization;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;

namespace ServicePro.Modules.Billing.Application;

/*
 * Razorpay (PLAN.md §5: payments). Payment Links give the customer a hosted page with UPI, cards
 * and net banking; the webhook (or a status check) tells us when it's paid. Nothing here is
 * active until the business adds its own keys: Payments:Razorpay:KeyId / KeySecret, and
 * Payments:Razorpay:WebhookSecret for the webhook.
 */

public sealed class RazorpayOptions
{
    public string? KeyId { get; set; }

    public string? KeySecret { get; set; }

    /// <summary>The secret set on the webhook in the Razorpay dashboard (not the key secret).</summary>
    public string? WebhookSecret { get; set; }

    public string BaseUrl { get; set; } = "https://api.razorpay.com";

    public bool IsConfigured => !string.IsNullOrWhiteSpace(KeyId) && !string.IsNullOrWhiteSpace(KeySecret);
}

public sealed record GatewayLink(string Id, string Url, string Status);

public sealed record GatewayLinkPayment(string PaymentId, decimal Amount, string Status);

public sealed record GatewayLinkState(string Status, IReadOnlyList<GatewayLinkPayment> Payments);

public sealed record GatewayRefund(string Id, string Status);

public sealed record NewGatewayLink(string ReferenceId, decimal Amount, string Description, string CustomerName, string CustomerPhone, string CallbackUrl, DateTimeOffset ExpiresAt);

/// <summary>The payment gateway, as the billing use cases see it. One implementation: Razorpay.</summary>
public interface IPaymentGateway
{
    string Provider { get; }

    bool IsConfigured { get; }

    Task<GatewayLink> CreateLinkAsync(NewGatewayLink link, CancellationToken ct);

    Task<GatewayLinkState> GetLinkAsync(string linkId, CancellationToken ct);

    Task CancelLinkAsync(string linkId, CancellationToken ct);

    Task<GatewayRefund> RefundAsync(string providerPaymentId, decimal amount, string receipt, CancellationToken ct);
}

public sealed class PaymentGatewayException(string message) : Exception(message);

public sealed class RazorpayGateway(HttpClient http, IOptions<RazorpayOptions> options) : IPaymentGateway
{
    public const string Name = "RAZORPAY";

    private RazorpayOptions Options => options.Value;

    public string Provider => Name;

    public bool IsConfigured => Options.IsConfigured;

    public async Task<GatewayLink> CreateLinkAsync(NewGatewayLink link, CancellationToken ct)
    {
        var body = BuildLinkPayload(link);
        using var json = await SendAsync(HttpMethod.Post, "/v1/payment_links", body, ct);
        var root = json.RootElement;
        return new GatewayLink(root.GetProperty("id").GetString()!, root.GetProperty("short_url").GetString()!, root.GetProperty("status").GetString()!);
    }

    public async Task<GatewayLinkState> GetLinkAsync(string linkId, CancellationToken ct)
    {
        using var json = await SendAsync(HttpMethod.Get, $"/v1/payment_links/{Uri.EscapeDataString(linkId)}", null, ct);
        return ParseLinkState(json.RootElement);
    }

    public async Task CancelLinkAsync(string linkId, CancellationToken ct)
    {
        using var _ = await SendAsync(HttpMethod.Post, $"/v1/payment_links/{Uri.EscapeDataString(linkId)}/cancel", new Dictionary<string, object>(), ct);
    }

    public async Task<GatewayRefund> RefundAsync(string providerPaymentId, decimal amount, string receipt, CancellationToken ct)
    {
        var body = new Dictionary<string, object> { ["amount"] = ToPaise(amount), ["speed"] = "normal", ["receipt"] = receipt };
        using var json = await SendAsync(HttpMethod.Post, $"/v1/payments/{Uri.EscapeDataString(providerPaymentId)}/refund", body, ct);
        var root = json.RootElement;
        return new GatewayRefund(root.GetProperty("id").GetString()!, root.GetProperty("status").GetString()!);
    }

    /// <summary>Public for unit tests. Razorpay amounts are integers in paise.</summary>
    public static Dictionary<string, object> BuildLinkPayload(NewGatewayLink link) => new()
    {
        ["amount"] = ToPaise(link.Amount),
        ["currency"] = "INR",
        ["accept_partial"] = false,
        ["reference_id"] = link.ReferenceId,
        ["description"] = link.Description,
        ["customer"] = new Dictionary<string, string> { ["name"] = link.CustomerName, ["contact"] = link.CustomerPhone },
        // We send our own WhatsApp message; Razorpay's SMS/email would duplicate it.
        ["notify"] = new Dictionary<string, bool> { ["sms"] = false, ["email"] = false },
        ["reminder_enable"] = false,
        ["expire_by"] = link.ExpiresAt.ToUnixTimeSeconds(),
        ["callback_url"] = link.CallbackUrl,
        ["callback_method"] = "get",
    };

    /// <summary>Public for unit tests.</summary>
    public static GatewayLinkState ParseLinkState(JsonElement root)
    {
        var payments = new List<GatewayLinkPayment>();
        if (root.TryGetProperty("payments", out var list) && list.ValueKind == JsonValueKind.Array)
        {
            foreach (var payment in list.EnumerateArray())
            {
                payments.Add(new GatewayLinkPayment(
                    payment.GetProperty("payment_id").GetString()!,
                    FromPaise(payment.GetProperty("amount").GetInt64()),
                    payment.GetProperty("status").GetString()!));
            }
        }

        return new GatewayLinkState(root.GetProperty("status").GetString()!, payments);
    }

    /// <summary>X-Razorpay-Signature: hex HMAC-SHA256 of the raw request body with the webhook secret.</summary>
    public static bool IsValidWebhookSignature(string body, string? signature, string secret)
    {
        if (string.IsNullOrWhiteSpace(signature))
        {
            return false;
        }

        var expected = HMACSHA256.HashData(Encoding.UTF8.GetBytes(secret), Encoding.UTF8.GetBytes(body));
        byte[] given;
        try
        {
            given = Convert.FromHexString(signature.Trim());
        }
        catch (FormatException)
        {
            return false;
        }

        return CryptographicOperations.FixedTimeEquals(expected, given);
    }

    public static long ToPaise(decimal rupees) => (long)Math.Round(rupees * 100m, MidpointRounding.AwayFromZero);

    public static decimal FromPaise(long paise) => paise / 100m;

    private async Task<JsonDocument> SendAsync(HttpMethod method, string path, object? body, CancellationToken ct)
    {
        if (!IsConfigured)
        {
            throw new PaymentGatewayException("Online payments aren't set up.");
        }

        using var request = new HttpRequestMessage(method, new Uri(new Uri(Options.BaseUrl), path));
        var credentials = Convert.ToBase64String(Encoding.UTF8.GetBytes($"{Options.KeyId}:{Options.KeySecret}"));
        request.Headers.Authorization = new AuthenticationHeaderValue("Basic", credentials);
        if (body is not null)
        {
            request.Content = JsonContent.Create(body);
        }

        using var response = await http.SendAsync(request, ct);
        var text = await response.Content.ReadAsStringAsync(ct);
        if (!response.IsSuccessStatusCode)
        {
            throw new PaymentGatewayException(string.Create(CultureInfo.InvariantCulture, $"Razorpay {(int)response.StatusCode}: {Describe(text)}"));
        }

        return JsonDocument.Parse(text);
    }

    /// <summary>Razorpay errors: {"error":{"code":"BAD_REQUEST_ERROR","description":"…"}}.</summary>
    private static string Describe(string body)
    {
        try
        {
            using var json = JsonDocument.Parse(body);
            return json.RootElement.TryGetProperty("error", out var error) && error.TryGetProperty("description", out var description)
                ? description.GetString() ?? body
                : body;
        }
        catch (JsonException)
        {
            return body.Length > 300 ? body[..300] : body;
        }
    }
}
