using System.Text.RegularExpressions;
using ServicePro.BuildingBlocks.Persistence;
using ServicePro.SharedKernel.Domain;

namespace ServicePro.Modules.Notifications.Domain;

public enum NotificationChannel
{
    WhatsApp,
    Sms,
}

public enum RecipientType
{
    Customer,
    Technician,
    Staff,
}

public enum NotificationStatus
{
    Queued,
    Sent,
    Delivered,
    Read,
    Failed,
}

/// <summary>
/// A message template (PLAN.md §7.10). WhatsApp templates must be approved by Meta; the
/// approved name goes in <see cref="ProviderTemplateName"/> and placeholders map to its
/// numbered parameters in <see cref="Variables"/> order.
/// </summary>
public sealed partial class NotificationTemplate : TenantOwnedEntity, IAudited
{
    private NotificationTemplate()
    {
    }

    public NotificationTemplate(string code, NotificationChannel channel, string language, string body, string? providerTemplateName)
    {
        Code = code;
        Channel = channel;
        Language = language;
        Update(body, providerTemplateName, isActive: true);
    }

    public string Code { get; private set; } = string.Empty;

    public NotificationChannel Channel { get; private set; }

    public string Language { get; private set; } = "en";

    public string Body { get; private set; } = string.Empty;

    public string? ProviderTemplateName { get; private set; }

    /// <summary>Placeholder names in the order they appear: "Hi {{name}}, {{sr}}" → [name, sr].</summary>
    public string[] Variables { get; private set; } = [];

    public bool IsActive { get; private set; }

    public void Update(string body, string? providerTemplateName, bool isActive)
    {
        Body = body.Trim();
        ProviderTemplateName = string.IsNullOrWhiteSpace(providerTemplateName) ? null : providerTemplateName.Trim();
        Variables = [.. PlaceholderPattern().Matches(Body).Select(m => m.Groups[1].Value).Distinct()];
        IsActive = isActive;
    }

    public string Render(IReadOnlyDictionary<string, string> values) =>
        PlaceholderPattern().Replace(Body, m => values.TryGetValue(m.Groups[1].Value, out var value) ? value : string.Empty);

    public IReadOnlyList<string> OrderedParameters(IReadOnlyDictionary<string, string> values) =>
        [.. Variables.Select(v => values.GetValueOrDefault(v, string.Empty))];

    [GeneratedRegex(@"\{\{\s*([a-z_]+)\s*\}\}")]
    private static partial Regex PlaceholderPattern();
}

/// <summary>One message sent (or attempted) to one person (PLAN.md §7.10 `notifications`).</summary>
public sealed class Notification : TenantOwnedEntity
{
    private Notification()
    {
    }

    public Notification(
        string templateCode,
        NotificationChannel channel,
        RecipientType recipientType,
        Guid? recipientId,
        string recipientAddress,
        Guid? serviceRequestId,
        string renderedBody)
    {
        TemplateCode = templateCode;
        Channel = channel;
        RecipientType = recipientType;
        RecipientId = recipientId;
        RecipientAddress = recipientAddress;
        ServiceRequestId = serviceRequestId;
        RenderedBody = renderedBody;
        Status = NotificationStatus.Queued;
    }

    public string TemplateCode { get; private set; } = string.Empty;

    public NotificationChannel Channel { get; private set; }

    public RecipientType RecipientType { get; private set; }

    public Guid? RecipientId { get; private set; }

    public string RecipientAddress { get; private set; } = string.Empty;

    public Guid? ServiceRequestId { get; private set; }

    public string RenderedBody { get; private set; } = string.Empty;

    public NotificationStatus Status { get; private set; }

    public string? ProviderMessageId { get; private set; }

    public string? Error { get; private set; }

    public DateTimeOffset? SentAt { get; private set; }

    public void MarkSent(string? providerMessageId, DateTimeOffset at)
    {
        Status = NotificationStatus.Sent;
        ProviderMessageId = providerMessageId;
        SentAt = at;
    }

    public void MarkFailed(string error)
    {
        Status = NotificationStatus.Failed;
        Error = error.Length > 1000 ? error[..1000] : error;
    }
}
