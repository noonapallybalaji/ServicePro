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
    string RenderedBody);

public sealed record SendResult(bool Succeeded, string? ProviderMessageId, string? Error)
{
    public static SendResult Ok(string? providerMessageId) => new(true, providerMessageId, null);

    public static SendResult Fail(string error) => new(false, null, error);
}

/// <summary>A delivery channel (ADR 0009). One implementation per provider.</summary>
public interface INotificationChannel
{
    NotificationChannel Channel { get; }

    Task<SendResult> SendAsync(OutgoingMessage message, CancellationToken ct);
}

public sealed class NotificationOptions
{
    public const string SectionName = "Notifications";

    /// <summary>Base URL of the customer site, used in tracking links ("{base}/t/{token}").</summary>
    public string PublicSiteUrl { get; set; } = "http://localhost:5175";

    public WhatsAppOptions WhatsApp { get; set; } = new();
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
    public static object BuildPayload(OutgoingMessage message) => new
    {
        messaging_product = "whatsapp",
        to = message.To.TrimStart('+'),
        type = "template",
        template = new
        {
            name = message.ProviderTemplateName,
            language = new { code = message.Language },
            components = message.Parameters.Count == 0
                ? Array.Empty<object>()
                : [new { type = "body", parameters = message.Parameters.Select(p => new { type = "text", text = p }).ToArray() }],
        },
    };

    private static readonly JsonSerializerOptions Json = new() { DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull };
}
