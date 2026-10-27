using System.Collections.Concurrent;
using ServicePro.Modules.Notifications.Channels;
using ServicePro.Modules.Notifications.Domain;

namespace ServicePro.IntegrationTests.Infrastructure;

/// <summary>WhatsApp that delivers, except to numbers a test marks as "not on WhatsApp" (to exercise the SMS fallback).</summary>
public sealed class FakeWhatsApp : INotificationChannel
{
    public static ConcurrentDictionary<string, bool> NotOnWhatsApp { get; } = new();

    public NotificationChannel Channel => NotificationChannel.WhatsApp;

    public bool IsLive => true;

    public Task<SendResult> SendAsync(OutgoingMessage message, CancellationToken ct) =>
        Task.FromResult(NotOnWhatsApp.ContainsKey(message.To)
            ? SendResult.Fail("131026: recipient is not a WhatsApp user (test)")
            : SendResult.Ok($"wamid.test.{Guid.NewGuid():N}"));
}

/// <summary>A working SMS provider (the SMS fallback and code delivery need a live channel, as in production).</summary>
public sealed class FakeSms : INotificationChannel
{
    public NotificationChannel Channel => NotificationChannel.Sms;

    public bool IsLive => true;

    public Task<SendResult> SendAsync(OutgoingMessage message, CancellationToken ct) => Task.FromResult(SendResult.Ok($"sms.test.{Guid.NewGuid():N}"));
}
