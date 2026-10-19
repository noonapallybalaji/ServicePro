using Microsoft.EntityFrameworkCore;
using ServicePro.BuildingBlocks.Application;
using ServicePro.Modules.Notifications.Domain;
using ServicePro.SharedKernel.Abstractions;
using ServicePro.SharedKernel.Results;

namespace ServicePro.Modules.Notifications.Application;

/*
 * The customer site's notification bell: the messages we sent the signed-in customer (WhatsApp/SMS),
 * newest first, each with a short title. Sign-in and booking codes never appear, failed sends are left
 * out, and the same message sent on two channels (SMS after WhatsApp failed) shows once.
 *
 * Read state is stored on the server, per message, so it is the same on every device. An item is
 * read once the customer opens it (or marks everything read); opening the list alone changes nothing.
 * Marking an item read marks every copy of it.
 */

public sealed record CustomerNotificationResponse(Guid Id, string Title, string Body, Guid? ServiceRequestId, DateTimeOffset CreatedAt, bool IsRead);

public sealed record CustomerNotificationsResponse(IReadOnlyList<CustomerNotificationResponse> Items, int UnreadCount);

internal static class CustomerFeed
{
    /// <summary>How far back the list (and the unread count) reaches.</summary>
    public const int MaxItems = 50;

    private static readonly TimeSpan SameMessageWindow = TimeSpan.FromMinutes(10);

    private static readonly string[] Hidden =
        [TemplateCodes.OtpLogin, TemplateCodes.OtpBooking, TemplateCodes.OtpCustomerLogin, TemplateCodes.OtpEstimate, TemplateCodes.OtpChangePhone];

    private static readonly Dictionary<string, string> Titles = new(StringComparer.Ordinal)
    {
        [TemplateCodes.SrCreated] = "Booking received",
        [TemplateCodes.SrConfirmed] = "Booking confirmed",
        [TemplateCodes.TechAssigned] = "Technician assigned",
        [TemplateCodes.TechEnRoute] = "Technician on the way",
        [TemplateCodes.CompletionCode] = "Your completion code",
        [TemplateCodes.JobCompleted] = "Repair completed",
        [TemplateCodes.WaitingForParts] = "Waiting for parts",
        [TemplateCodes.Rescheduled] = "Visit rescheduled",
        [TemplateCodes.CustomerMissed] = "We missed you",
        [TemplateCodes.SrCancelled] = "Booking cancelled",
        [TemplateCodes.PaymentLink] = "Your bill is ready",
        [TemplateCodes.PaymentReceived] = "Payment received",
        [TemplateCodes.RefundProcessed] = "Refund processed",
        [TemplateCodes.FeedbackRequest] = "How was your visit?",
        [TemplateCodes.SupportReply] = "Reply from our team",
        [TemplateCodes.SupportReplyWhatsApp] = "Reply from our team",
        [TemplateCodes.EstimateSent] = "Estimate to approve",
    };

    public static string TitleFor(string code) => Titles.GetValueOrDefault(code, "Update on your booking");

    /// <summary>The customer's visible messages, newest first.</summary>
    public static IQueryable<Notification> Visible(DbContext db, Guid customerId) =>
        db.Set<Notification>().Where(n => n.RecipientType == RecipientType.Customer && n.RecipientId == customerId
            && n.Status != NotificationStatus.Failed && !Hidden.Contains(n.TemplateCode));

    /// <summary>Copies of one message (same booking and title, minutes apart) folded into one item.</summary>
    public static List<List<Notification>> Group(IEnumerable<Notification> newestFirst)
    {
        var groups = new List<List<Notification>>();
        foreach (var n in newestFirst)
        {
            var group = groups.FirstOrDefault(g => SameMessage(g[0], n));
            if (group is null)
            {
                groups.Add([n]);
            }
            else
            {
                group.Add(n);
            }
        }

        return groups;
    }

    public static bool SameMessage(Notification a, Notification b) =>
        a.ServiceRequestId == b.ServiceRequestId && TitleFor(a.TemplateCode) == TitleFor(b.TemplateCode)
        && (a.CreatedAt - b.CreatedAt).Duration() < SameMessageWindow;

    public static async Task<CustomerNotificationsResponse> LoadAsync(DbContext db, Guid customerId, int take, CancellationToken ct)
    {
        var rows = await Visible(db, customerId).AsNoTracking()
            .OrderByDescending(n => n.CreatedAt)
            .Take(MaxItems * 2) // room for WhatsApp+SMS pairs
            .ToListAsync(ct);
        var groups = Group(rows).Take(MaxItems).ToList();
        var items = groups.Select(g => new CustomerNotificationResponse(
            g[0].Id, TitleFor(g[0].TemplateCode), g[0].RenderedBody, g[0].ServiceRequestId, g[0].CreatedAt, g.Any(n => n.ReadAt is not null))).ToList();
        return new CustomerNotificationsResponse(items.Take(Math.Clamp(take, 1, MaxItems)).ToList(), items.Count(i => !i.IsRead));
    }
}

internal static class FeedErrors
{
    public static readonly Error NotSignedIn = Error.Unauthorized("account.not_signed_in", "Please sign in to see your notifications.");
    public static readonly Error NotFound = Error.NotFound("notification.not_found", "We couldn't find this notification.");
}

public sealed class ListMyNotifications(DbContext db, ICurrentUser currentUser) : IUseCase
{
    public async Task<Result<CustomerNotificationsResponse>> HandleAsync(int take, CancellationToken ct) =>
        currentUser.CustomerId is { } customerId
            ? await CustomerFeed.LoadAsync(db, customerId, take, ct)
            : FeedErrors.NotSignedIn;
}

/// <summary>Marks one item read (with its copies on other channels), or everything when no id is given. Returns the updated list.</summary>
public sealed class MarkMyNotificationsRead(DbContext db, ICurrentUser currentUser, IClock clock) : IUseCase
{
    public async Task<Result<CustomerNotificationsResponse>> HandleAsync(Guid? notificationId, CancellationToken ct)
    {
        if (currentUser.CustomerId is not { } customerId)
        {
            return FeedErrors.NotSignedIn;
        }

        var now = clock.UtcNow;
        if (notificationId is { } id)
        {
            // Only the customer's own messages: someone else's id looks like it doesn't exist.
            var target = await CustomerFeed.Visible(db, customerId).FirstOrDefaultAsync(n => n.Id == id, ct);
            if (target is null)
            {
                return FeedErrors.NotFound;
            }

            var from = target.CreatedAt.AddMinutes(-10);
            var to = target.CreatedAt.AddMinutes(10);
            var nearby = await CustomerFeed.Visible(db, customerId)
                .Where(n => n.ServiceRequestId == target.ServiceRequestId && n.CreatedAt > from && n.CreatedAt < to && n.ReadAt == null)
                .ToListAsync(ct);
            foreach (var n in nearby.Where(n => CustomerFeed.SameMessage(target, n)))
            {
                n.MarkRead(now);
            }

            target.MarkRead(now);
        }
        else
        {
            foreach (var n in await CustomerFeed.Visible(db, customerId).Where(n => n.ReadAt == null).ToListAsync(ct))
            {
                n.MarkRead(now);
            }
        }

        await db.SaveChangesAsync(ct);
        return await CustomerFeed.LoadAsync(db, customerId, 30, ct);
    }
}
