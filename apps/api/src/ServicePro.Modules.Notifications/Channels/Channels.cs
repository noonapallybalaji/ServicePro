using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using ServicePro.Modules.Notifications.Domain;

namespace ServicePro.Modules.Notifications.Channels;

/// <summary>A rendered message ready for a provider.</summary>
public sealed record OutgoingMessage(
    string To,
    string TemplateCode,
    string? ProviderTemplateName,
    string Language,
    IReadOnlyList<string> Parameters,
    string RenderedBody)
{
    /// <summary>The same values by placeholder name (SMS providers address variables by name).</summary>
    public IReadOnlyDictionary<string, string> Variables { get; init; } = new Dictionary<string, string>();
}

public sealed record SendResult(bool Succeeded, string? ProviderMessageId, string? Error)
{
    public static SendResult Ok(string? providerMessageId) => new(true, providerMessageId, null);

    public static SendResult Fail(string error) => new(false, null, error);
}

/// <summary>A delivery channel (ADR 0009). One implementation per provider.</summary>
public interface INotificationChannel
{
    NotificationChannel Channel { get; }

    /// <summary>False for the logging stand-in: the message reaches no one.</summary>
    bool IsLive { get; }

    Task<SendResult> SendAsync(OutgoingMessage message, CancellationToken ct);
}

public sealed class NotificationOptions
{
    public const string SectionName = "Notifications";

    /// <summary>Base URL of the customer site, used in tracking links ("{base}/t/{token}").</summary>
    public string PublicSiteUrl { get; set; } = "http://localhost:5175";

    public WhatsAppOptions WhatsApp { get; set; } = new();

    public SmsOptions Sms { get; set; } = new();

    /// <summary>
    /// Where one-time codes go first: "WhatsApp" (authentication templates; no DLT needed) or "Sms".
    /// If the first channel fails, the code is sent by the other one when it is configured.
    /// </summary>
    public NotificationChannel OtpChannel { get; set; } = NotificationChannel.Sms;
}

/// <summary>SMS provider. India requires DLT-registered templates; MSG91 "flows" carry the DLT template.</summary>
public sealed class SmsOptions
{
    /// <summary>"Msg91" to send for real; empty to only log.</summary>
    public string? Provider { get; set; }

    public string? AuthKey { get; set; }

    public string BaseUrl { get; set; } = "https://control.msg91.com";

    public bool IsConfigured =>
        string.Equals(Provider, "Msg91", StringComparison.OrdinalIgnoreCase) && !string.IsNullOrWhiteSpace(AuthKey);
}

public sealed class WhatsAppOptions
{
    public string? PhoneNumberId { get; set; }

    public string? AccessToken { get; set; }

    public string ApiVersion { get; set; } = "v21.0";

    public bool IsConfigured => !string.IsNullOrWhiteSpace(PhoneNumberId) && !string.IsNullOrWhiteSpace(AccessToken);
}

/// <summary>
/// Development / not-yet-onboarded fallback: writes the full message to the log so every flow
/// can be exercised end to end without a provider account.
/// </summary>
public sealed partial class LoggingChannel(NotificationChannel channel, ILogger<LoggingChannel> logger) : INotificationChannel
{
    public NotificationChannel Channel => channel;

    public bool IsLive => false;

    public Task<SendResult> SendAsync(OutgoingMessage message, CancellationToken ct)
    {
        LogMessage(channel, message.To, message.TemplateCode, message.RenderedBody);
        return Task.FromResult(SendResult.Ok($"log-{Guid.CreateVersion7():N}"));
    }

    [LoggerMessage(Level = LogLevel.Information, Message = "[{Channel} → {To}] {Template}: {Body}")]
    private partial void LogMessage(NotificationChannel channel, string to, string template, string body);
}

/// <summary>
/// Meta WhatsApp Cloud API, template messages (PLAN.md §11.1).
/// Business-initiated messages must use approved templates, so a template without a
/// provider name is rejected rather than sent as free text.
/// </summary>
public sealed class MetaWhatsAppChannel(HttpClient http, IOptions<NotificationOptions> options) : INotificationChannel
{
    public NotificationChannel Channel => NotificationChannel.WhatsApp;

    public bool IsLive => true;

    public async Task<SendResult> SendAsync(OutgoingMessage message, CancellationToken ct)
    {
        if (message.ProviderTemplateName is null)
        {
            return SendResult.Fail($"Template '{message.TemplateCode}' has no approved WhatsApp template name.");
        }

        var whatsApp = options.Value.WhatsApp;
        using var request = new HttpRequestMessage(HttpMethod.Post, $"https://graph.facebook.com/{whatsApp.ApiVersion}/{whatsApp.PhoneNumberId}/messages")
        {
            Content = JsonContent.Create(BuildPayload(message), options: Json),
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", whatsApp.AccessToken);

        using var response = await http.SendAsync(request, ct);
        var body = await response.Content.ReadAsStringAsync(ct);
        if (!response.IsSuccessStatusCode)
        {
            return SendResult.Fail($"WhatsApp API {(int)response.StatusCode}: {body}");
        }

        using var document = JsonDocument.Parse(body);
        var messageId = document.RootElement.TryGetProperty("messages", out var messages) && messages.GetArrayLength() > 0
            ? messages[0].GetProperty("id").GetString()
            : null;
        return SendResult.Ok(messageId);
    }

    /// <summary>Cloud API template payload. Public for unit tests of the request shape.</summary>
    public static object BuildPayload(OutgoingMessage message)
    {
        var components = new List<object>();
        if (message.Parameters.Count > 0)
        {
            components.Add(new { type = "body", parameters = message.Parameters.Select(p => new { type = "text", text = p }).ToArray() });
        }

        // One-time codes use Meta "authentication" templates: the code also fills the copy-code button.
        if (IsOneTimeCode(message.TemplateCode) && message.Parameters.Count > 0)
        {
            components.Add(new
            {
                type = "button",
                sub_type = "url",
                index = "0",
                parameters = new[] { new { type = "text", text = message.Parameters[0] } },
            });
        }

        return new
        {
            messaging_product = "whatsapp",
            to = message.To.TrimStart('+'),
            type = "template",
            template = new
            {
                name = message.ProviderTemplateName,
                language = new { code = message.Language },
                components = components.ToArray(),
            },
        };
    }

    public static bool IsOneTimeCode(string templateCode) => templateCode.StartsWith("OTP_", StringComparison.Ordinal);

    private static readonly JsonSerializerOptions Json = new() { DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull };
}

/// <summary>
/// MSG91 Flow API (SMS with a DLT-registered template). The flow id goes in the template's
/// "provider template name"; MSG91 flow variables must be named like our placeholders
/// (e.g. ##code## for {{code}}).
/// </summary>
public sealed class Msg91SmsChannel(HttpClient http, IOptions<NotificationOptions> options) : INotificationChannel
{
    public NotificationChannel Channel => NotificationChannel.Sms;

    public bool IsLive => true;

    public async Task<SendResult> SendAsync(OutgoingMessage message, CancellationToken ct)
    {
        if (message.ProviderTemplateName is null)
        {
            return SendResult.Fail($"Template '{message.TemplateCode}' has no MSG91 flow id (DLT template).");
        }

        var sms = options.Value.Sms;
        using var request = new HttpRequestMessage(HttpMethod.Post, $"{sms.BaseUrl.TrimEnd('/')}/api/v5/flow")
        {
            Content = JsonContent.Create(BuildPayload(message, message.Variables)),
        };
        request.Headers.Add("authkey", sms.AuthKey);
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

        using var response = await http.SendAsync(request, ct);
        var body = await response.Content.ReadAsStringAsync(ct);
        if (!response.IsSuccessStatusCode)
        {
            return SendResult.Fail($"MSG91 {(int)response.StatusCode}: {body}");
        }

        using var document = JsonDocument.Parse(body);
        var root = document.RootElement;
        var ok = root.TryGetProperty("type", out var type) && type.GetString() == "success";
        var id = root.TryGetProperty("message", out var idElement) ? idElement.GetString() : null;
        return ok ? SendResult.Ok(id) : SendResult.Fail($"MSG91: {body}");
    }

    /// <summary>Flow payload: one recipient, variables by name. Public for unit tests.</summary>
    public static Dictionary<string, object> BuildPayload(OutgoingMessage message, IReadOnlyDictionary<string, string> variables)
    {
        var recipient = new Dictionary<string, string> { ["mobiles"] = message.To.TrimStart('+') };
        foreach (var (name, value) in variables)
        {
            recipient[name] = value;
        }

        return new Dictionary<string, object>
        {
            ["template_id"] = message.ProviderTemplateName!,
            ["short_url"] = "0",
            ["recipients"] = new[] { recipient },
        };
    }
}
