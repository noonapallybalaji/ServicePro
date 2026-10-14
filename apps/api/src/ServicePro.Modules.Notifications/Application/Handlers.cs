using System.Globalization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using ServicePro.BuildingBlocks.Messaging;
using ServicePro.Contracts;
using ServicePro.Contracts.Events;
using ServicePro.Contracts.Ports;
using ServicePro.Modules.Notifications.Channels;
using ServicePro.Modules.Notifications.Domain;
using ServicePro.SharedKernel.Abstractions;
using ServicePro.SharedKernel.ValueObjects;

namespace ServicePro.Modules.Notifications.Application;

/// <summary>Builds the values every customer message can use, from the job's ports.</summary>
public sealed class CustomerMessageContext(
    ICustomerDirectory customers,
    IServiceRequestWorkflow serviceRequests,
    ICatalogDirectory catalog,
    ITechnicianDirectory technicians,
    IOptions<NotificationOptions> options,
    NotificationDispatcher dispatcher)
{
    private static readonly CultureInfo India = CultureInfo.GetCultureInfo("en-IN");

    public async Task SendToCustomerAsync(Guid customerId, Guid serviceRequestId, string srNumber, string templateCode,
        Guid? technicianId, IReadOnlyDictionary<string, string>? extra, CancellationToken ct)
    {
        var customer = await customers.GetAsync(customerId, ct);
        if (customer is null)
        {
            return;
        }

        var values = new Dictionary<string, string>
        {
            ["customer"] = customer.FullName.Split(' ', StringSplitOptions.RemoveEmptyEntries).FirstOrDefault() ?? customer.FullName,
            ["sr"] = srNumber,
            ["link"] = await TrackingLinkAsync(serviceRequestId, ct),
        };

        var job = await serviceRequests.GetDispatchContextAsync(serviceRequestId, ct);
        var billing = await serviceRequests.GetBillingContextAsync(serviceRequestId, ct);
        if (job.IsSuccess && await catalog.GetCategoryAsync(job.Value.CategoryId, ct) is { } category)
        {
            values["service"] = category.Name;
        }

        if (billing.IsSuccess)
        {
            values["visit_charge"] = billing.Value.VisitCharge.ToString("C0", India);
        }

        if (technicianId is { } id && await technicians.GetAsync(id, ct) is { } technician)
        {
            values["technician"] = technician.FullName;
        }

        foreach (var (key, value) in extra ?? new Dictionary<string, string>())
        {
            values[key] = value;
        }

        await dispatcher.SendAsync(new NotificationRequest(
            templateCode, NotificationChannel.WhatsApp, RecipientType.Customer, customer.Id, customer.Phone.Value,
            customer.PreferredLanguage, values, serviceRequestId), ct);
    }

    /// <summary>The tracking link is built from the token via the public tracking route.</summary>
    private async Task<string> TrackingLinkAsync(Guid serviceRequestId, CancellationToken ct)
    {
        var token = await serviceRequests.GetTrackingTokenAsync(serviceRequestId, ct);
        return token is null ? options.Value.PublicSiteUrl : $"{options.Value.PublicSiteUrl.TrimEnd('/')}/t/{token}";
    }
}

/// <summary>
/// "We've received it" goes only to bookings that wait for review. Staff-created jobs are confirmed
/// at once, so their customer gets the single SR_CONFIRMED message from the status change instead.
/// </summary>
public sealed class NotifyCustomerOnCreated(CustomerMessageContext messages) : IEventHandler<ServiceRequestCreated>
{
    public Task HandleAsync(ServiceRequestCreated e, CancellationToken ct) =>
        e.AwaitsReview
            ? messages.SendToCustomerAsync(e.CustomerId, e.ServiceRequestId, e.SrNumber, TemplateCodes.SrCreated, null, null, ct)
            : Task.CompletedTask;
}

/// <summary>Status → customer message. Adding a message is a new row, not new code (open/closed).</summary>
public sealed class NotifyCustomerOnStatusChange(CustomerMessageContext messages) : IEventHandler<ServiceRequestStatusChanged>
{
    private static readonly IReadOnlyDictionary<ServiceRequestStatus, string> TemplateFor = new Dictionary<ServiceRequestStatus, string>
    {
        [ServiceRequestStatus.Accepted] = TemplateCodes.TechAssigned,
        [ServiceRequestStatus.EnRoute] = TemplateCodes.TechEnRoute,
        [ServiceRequestStatus.Completed] = TemplateCodes.JobCompleted,
        [ServiceRequestStatus.WaitingForParts] = TemplateCodes.WaitingForParts,
        [ServiceRequestStatus.Rescheduled] = TemplateCodes.Rescheduled,
        [ServiceRequestStatus.CustomerUnavailable] = TemplateCodes.CustomerMissed,
        [ServiceRequestStatus.Cancelled] = TemplateCodes.SrCancelled,
    };

    public Task HandleAsync(ServiceRequestStatusChanged e, CancellationToken ct)
    {
        // NEW → READY: staff confirmed a reviewed booking, or created the job. Returning a job to the queue later must not repeat it.
        if (e.From == ServiceRequestStatus.New && e.To == ServiceRequestStatus.ReadyForAssignment)
        {
            return messages.SendToCustomerAsync(e.CustomerId, e.ServiceRequestId, e.SrNumber, TemplateCodes.SrConfirmed, null, null, ct);
        }

        // A customer who moved their own booking gets BOOKING_MOVED (with the new time) instead.
        if (e.To == ServiceRequestStatus.Rescheduled && e.ActorType == ActorType.Customer)
        {
            return Task.CompletedTask;
        }

        return TemplateFor.TryGetValue(e.To, out var template)
            ? messages.SendToCustomerAsync(e.CustomerId, e.ServiceRequestId, e.SrNumber, template, e.TechnicianId, null, ct)
            : Task.CompletedTask;
    }
}

/// <summary>Customers changing their own booking: confirm the new time to them, and tell the technician who had the job.</summary>
public sealed class NotifyAboutCustomerChanges(CustomerMessageContext messages, ITechnicianDirectory technicians, NotificationDispatcher dispatcher)
    : IEventHandler<BookingTimeChanged>, IEventHandler<ServiceRequestStatusChanged>
{
    private static readonly TimeZoneInfo India = TimeZoneInfo.FindSystemTimeZoneById("Asia/Kolkata");

    public async Task HandleAsync(BookingTimeChanged e, CancellationToken ct)
    {
        var window = Window(e.PreferredSlotStart, e.PreferredSlotEnd);
        await messages.SendToCustomerAsync(e.CustomerId, e.ServiceRequestId, e.SrNumber, TemplateCodes.BookingMoved, null,
            new Dictionary<string, string> { ["window"] = window }, ct);
        if (e.TechnicianId is { } technicianId)
        {
            await SendToTechnicianAsync(technicianId, e.ServiceRequestId, TemplateCodes.TechJobMoved, e.SrNumber, window, ct);
        }
    }

    public Task HandleAsync(ServiceRequestStatusChanged e, CancellationToken ct) =>
        e is { To: ServiceRequestStatus.Cancelled, ActorType: ActorType.Customer, TechnicianId: { } technicianId } &&
        e.From is ServiceRequestStatus.Offered or ServiceRequestStatus.Accepted or ServiceRequestStatus.Rescheduled
            ? SendToTechnicianAsync(technicianId, e.ServiceRequestId, TemplateCodes.TechJobCancelled, e.SrNumber, string.Empty, ct)
            : Task.CompletedTask;

    /// <summary>"Wed 15 Oct, 10:00 to 13:00" in Indian time.</summary>
    public static string Window(DateTimeOffset start, DateTimeOffset end)
    {
        var from = TimeZoneInfo.ConvertTime(start, India);
        var to = TimeZoneInfo.ConvertTime(end, India);
        return string.Create(CultureInfo.InvariantCulture, $"{from:ddd d MMM}, {from:HH:mm} to {to:HH:mm}");
    }

    private async Task SendToTechnicianAsync(Guid technicianId, Guid serviceRequestId, string template, string srNumber, string window, CancellationToken ct)
    {
        var technician = await technicians.GetAsync(technicianId, ct);
        if (technician is null)
        {
            return;
        }

        await dispatcher.SendAsync(new NotificationRequest(
            template, NotificationChannel.WhatsApp, RecipientType.Technician, technician.Id, technician.Phone.Value,
            NotificationDispatcher.DefaultLanguage, new Dictionary<string, string> { ["sr"] = srNumber, ["window"] = window }, serviceRequestId), ct);
    }
}

/// <summary>Staff replied to a support request: the customer hears it on WhatsApp (with the text, so WhatsApp-only contacts can read it).</summary>
public sealed class NotifySupportReply(ICustomerDirectory customers, NotificationDispatcher dispatcher, IOptions<NotificationOptions> options)
    : IEventHandler<SupportReplySent>
{
    public async Task HandleAsync(SupportReplySent e, CancellationToken ct)
    {
        var customer = e.CustomerId is { } id ? await customers.GetAsync(id, ct) : null;
        var to = customer?.Phone.Value ?? e.ContactPhone;
        if (to is null)
        {
            return;
        }

        var message = e.Message.Length > 500 ? e.Message[..500] + "…" : e.Message;
        await dispatcher.SendAsync(new NotificationRequest(
            customer is null ? TemplateCodes.SupportReplyWhatsApp : TemplateCodes.SupportReply,
            NotificationChannel.WhatsApp, RecipientType.Customer, customer?.Id, to, customer?.PreferredLanguage ?? NotificationDispatcher.DefaultLanguage,
            new Dictionary<string, string>
            {
                ["ticket"] = e.Number,
                ["message"] = message,
                ["link"] = $"{options.Value.PublicSiteUrl.TrimEnd('/')}/account?tab=help",
            },
            null), ct);
    }
}

/// <summary>Asks the customer to rate the visit (sent once, a while after the job closes).</summary>
public sealed class AskForFeedback(CustomerMessageContext messages) : IEventHandler<FeedbackRequested>
{
    public Task HandleAsync(FeedbackRequested e, CancellationToken ct) =>
        messages.SendToCustomerAsync(e.CustomerId, e.ServiceRequestId, e.SrNumber, TemplateCodes.FeedbackRequest, e.TechnicianId, null, ct);
}

/// <summary>Estimates: the customer is asked to review; the technician hears the answer.</summary>
public sealed class NotifyAboutEstimates(
    CustomerMessageContext messages,
    IServiceRequestWorkflow serviceRequests,
    ITechnicianDirectory technicians,
    NotificationDispatcher dispatcher) : IEventHandler<EstimateSent>, IEventHandler<EstimateAnswered>
{
    private static readonly CultureInfo India = CultureInfo.GetCultureInfo("en-IN");

    public async Task HandleAsync(EstimateSent e, CancellationToken ct)
    {
        var job = await serviceRequests.GetBillingContextAsync(e.ServiceRequestId, ct);
        if (job.IsSuccess)
        {
            await messages.SendToCustomerAsync(e.CustomerId, e.ServiceRequestId, job.Value.SrNumber, TemplateCodes.EstimateSent, e.TechnicianId,
                new Dictionary<string, string> { ["amount"] = e.Total.ToString("C", India) }, ct);
        }
    }

    public async Task HandleAsync(EstimateAnswered e, CancellationToken ct)
    {
        var job = await serviceRequests.GetBillingContextAsync(e.ServiceRequestId, ct);
        if (job.IsFailure || job.Value.TechnicianId is not { } technicianId || await technicians.GetAsync(technicianId, ct) is not { } technician)
        {
            return;
        }

        await dispatcher.SendAsync(new NotificationRequest(
            e.Approved ? TemplateCodes.TechEstimateApproved : TemplateCodes.TechEstimateDeclined,
            NotificationChannel.WhatsApp, RecipientType.Technician, technician.Id, technician.Phone.Value, NotificationDispatcher.DefaultLanguage,
            new Dictionary<string, string> { ["sr"] = job.Value.SrNumber, ["amount"] = e.Total.ToString("C", India) },
            e.ServiceRequestId), ct);
    }
}

/// <summary>Payment link, online payment receipt and refund: money messages to the customer.</summary>
public sealed class NotifyCustomerAboutMoney(CustomerMessageContext messages, IServiceRequestWorkflow serviceRequests)
    : IEventHandler<PaymentLinkSent>, IEventHandler<PaymentRecorded>, IEventHandler<RefundProcessed>
{
    private static readonly CultureInfo India = CultureInfo.GetCultureInfo("en-IN");

    public Task HandleAsync(PaymentLinkSent e, CancellationToken ct) =>
        SendAsync(e.ServiceRequestId, TemplateCodes.PaymentLink, e.Amount, new() { ["pay_link"] = e.Url }, ct);

    /// <summary>Only online payments: cash and UPI are handed over in person, with the bill.</summary>
    public Task HandleAsync(PaymentRecorded e, CancellationToken ct) =>
        e.Method == "Online" ? SendAsync(e.ServiceRequestId, TemplateCodes.PaymentReceived, e.Amount, [], ct) : Task.CompletedTask;

    public Task HandleAsync(RefundProcessed e, CancellationToken ct) =>
        SendAsync(e.ServiceRequestId, TemplateCodes.RefundProcessed, e.Amount, [], ct);

    private async Task SendAsync(Guid serviceRequestId, string template, decimal amount, Dictionary<string, string> extra, CancellationToken ct)
    {
        var job = await serviceRequests.GetBillingContextAsync(serviceRequestId, ct);
        if (job.IsFailure)
        {
            return;
        }

        extra["amount"] = amount.ToString("C", India);
        await messages.SendToCustomerAsync(job.Value.CustomerId, serviceRequestId, job.Value.SrNumber, template, null, extra, ct);
    }
}

/// <summary>Messages to a customer's phone, including sign-in codes (which aren't linked to a customer id).</summary>
public sealed class MessageHistory(DbContext db) : IMessageHistory
{
    public async Task ForgetRecipientAsync(PhoneNumber phone, CancellationToken ct)
    {
        var messages = await db.Set<Notification>()
            .Where(n => n.RecipientType == RecipientType.Customer && n.RecipientAddress == phone.Value)
            .ToListAsync(ct);
        messages.ForEach(n => n.Redact());
    }
}

/// <summary>Account deletion: the customer's past messages lose their phone number and text (also any sent to an older number).</summary>
public sealed class RedactErasedCustomerMessages(DbContext db) : IEventHandler<CustomerErased>
{
    public async Task HandleAsync(CustomerErased e, CancellationToken ct)
    {
        var messages = await db.Set<Notification>()
            .Where(n => n.RecipientType == RecipientType.Customer && n.RecipientId == e.CustomerId)
            .ToListAsync(ct);
        messages.ForEach(n => n.Redact());
        await db.SaveChangesAsync(ct);
    }
}

public sealed class SendCompletionCode(CustomerMessageContext messages, IServiceRequestWorkflow serviceRequests) : IEventHandler<CompletionCodeIssued>
{
    public async Task HandleAsync(CompletionCodeIssued e, CancellationToken ct)
    {
        var billing = await serviceRequests.GetBillingContextAsync(e.ServiceRequestId, ct);
        await messages.SendToCustomerAsync(e.CustomerId, e.ServiceRequestId, e.SrNumber, TemplateCodes.CompletionCode,
            billing.IsSuccess ? billing.Value.TechnicianId : null,
            new Dictionary<string, string> { ["code"] = e.Code }, ct);
    }
}

public sealed class NotifyTechnicianOfOffer(
    ITechnicianDirectory technicians,
    IServiceRequestWorkflow serviceRequests,
    ICatalogDirectory catalog,
    NotificationDispatcher dispatcher,
    ServicePro.SharedKernel.Abstractions.IClock clock) : IEventHandler<JobOffered>
{
    public async Task HandleAsync(JobOffered e, CancellationToken ct)
    {
        var technician = await technicians.GetAsync(e.TechnicianId, ct);
        var job = await serviceRequests.GetDispatchContextAsync(e.ServiceRequestId, ct);
        if (technician is null || job.IsFailure)
        {
            return;
        }

        var category = await catalog.GetCategoryAsync(job.Value.CategoryId, ct);
        var minutes = Math.Max(1, (int)Math.Round((e.ExpiresAt - clock.UtcNow).TotalMinutes));
        await dispatcher.SendAsync(new NotificationRequest(
            TemplateCodes.JobOffer, NotificationChannel.WhatsApp, RecipientType.Technician, technician.Id, technician.Phone.Value,
            NotificationDispatcher.DefaultLanguage,
            new Dictionary<string, string>
            {
                ["sr"] = job.Value.SrNumber,
                ["service"] = category?.Name ?? "Service",
                ["area"] = string.IsNullOrEmpty(job.Value.Locality) ? job.Value.Pincode : job.Value.Locality,
                ["minutes"] = minutes.ToString(CultureInfo.InvariantCulture),
            },
            e.ServiceRequestId), ct);
    }
}

/// <summary>
/// Implements the Identity module's OTP port. Sends on the configured first channel
/// (Notifications:OtpChannel) and falls back to the other channel if the first one fails.
/// </summary>
public sealed class OtpSender(NotificationDispatcher dispatcher, IEnumerable<INotificationChannel> channels, IOptions<NotificationOptions> options) : IOtpSender
{
    public async Task<bool> SendAsync(PhoneNumber phone, string code, OtpPurpose purpose, CancellationToken ct)
    {
        var (template, recipient) = purpose switch
        {
            OtpPurpose.Booking => (TemplateCodes.OtpBooking, RecipientType.Customer),
            OtpPurpose.CustomerLogin => (TemplateCodes.OtpCustomerLogin, RecipientType.Customer),
            OtpPurpose.EstimateApproval => (TemplateCodes.OtpEstimate, RecipientType.Customer),
            _ => (TemplateCodes.OtpLogin, RecipientType.Technician),
        };

        foreach (var channel in DeliveryOrder(options.Value.OtpChannel, channels))
        {
            var notification = await dispatcher.SendAsync(new NotificationRequest(
                template, channel, recipient, null, phone.Value,
                NotificationDispatcher.DefaultLanguage, new Dictionary<string, string> { ["code"] = code }, null), ct);
            if (notification.Status != NotificationStatus.Failed)
            {
                return true;
            }
        }

        return false;
    }

    /// <summary>
    /// Channels that really deliver, preferred one first. Only when none does (development) is the
    /// preferred channel used as-is, which logs the code. A logging channel never counts as a fallback:
    /// that would report "sent" for a code nobody received.
    /// </summary>
    public static IReadOnlyList<NotificationChannel> DeliveryOrder(NotificationChannel preferred, IEnumerable<INotificationChannel> channels)
    {
        var live = channels.Where(c => c.IsLive).Select(c => c.Channel).Distinct().ToList();
        if (live.Count == 0)
        {
            return [preferred];
        }

        return [.. live.OrderBy(c => c == preferred ? 0 : 1)];
    }
}
