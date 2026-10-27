using Microsoft.EntityFrameworkCore;
using ServicePro.Modules.Notifications.Channels;
using ServicePro.Modules.Notifications.Domain;
using ServicePro.SharedKernel.Abstractions;

namespace ServicePro.Modules.Notifications.Application;

public sealed record NotificationRequest(
    string TemplateCode,
    NotificationChannel Channel,
    RecipientType RecipientType,
    Guid? RecipientId,
    string To,
    string Language,
    IReadOnlyDictionary<string, string> Values,
    Guid? ServiceRequestId);

/// <summary>
/// Renders a template, sends it through the channel and records the attempt.
/// The record joins the caller's unit of work (event handlers never save; the outbox commits).
/// </summary>
public sealed class NotificationDispatcher(DbContext db, IEnumerable<INotificationChannel> channels, IClock clock)
{
    public const string DefaultLanguage = "en";

    public async Task<Notification> SendAsync(NotificationRequest request, CancellationToken ct)
    {
        var template = await FindTemplateAsync(request.TemplateCode, request.Channel, request.Language, ct)
            ?? (request.Channel == NotificationChannel.InApp
                ? await FindTemplateAsync(request.TemplateCode, NotificationChannel.WhatsApp, request.Language, ct)
                : null);
        var rendered = template?.Render(request.Values) ?? string.Empty;
        var notification = new Notification(
            request.TemplateCode, request.Channel, request.RecipientType, request.RecipientId, request.To, request.ServiceRequestId, rendered);
        db.Set<Notification>().Add(notification);

        if (template is null)
        {
            notification.MarkFailed($"No active template '{request.TemplateCode}' for {request.Channel}.");
            return notification;
        }

        var channel = channels.FirstOrDefault(c => c.Channel == request.Channel);
        if (channel is null)
        {
            notification.MarkFailed($"No {request.Channel} channel is configured.");
            return notification;
        }

        var result = await channel.SendAsync(
            new OutgoingMessage(request.To, template.Code, template.ProviderTemplateName, template.Language, template.OrderedParameters(request.Values), rendered)
            {
                Variables = template.Variables.ToDictionary(name => name, name => request.Values.GetValueOrDefault(name, string.Empty)),
            },
            ct);

        if (result.Succeeded)
        {
            notification.MarkSent(result.ProviderMessageId, clock.UtcNow);
        }
        else
        {
            notification.MarkFailed(result.Error ?? "Unknown error");
        }

        return notification;
    }

    /// <summary>Whether a channel has wording for this message (an SMS fallback exists only where an SMS template does).</summary>
    public async Task<bool> HasTemplateAsync(string code, NotificationChannel channel, string language, CancellationToken ct) =>
        await FindTemplateAsync(code, channel, language, ct) is not null;

    /// <summary>Preferred language first, English as fallback.</summary>
    private async Task<NotificationTemplate?> FindTemplateAsync(string code, NotificationChannel channel, string language, CancellationToken ct)
    {
        var candidates = await db.Set<NotificationTemplate>().AsNoTracking()
            .Where(t => t.Code == code && t.Channel == channel && t.IsActive && (t.Language == language || t.Language == DefaultLanguage))
            .ToListAsync(ct);
        return candidates.FirstOrDefault(t => t.Language == language) ?? candidates.FirstOrDefault();
    }
}
