using ServicePro.Modules.Notifications.Domain;

namespace ServicePro.Modules.Notifications.Application;

/// <summary>Template codes (PLAN.md §7.10, §11.2). Bodies are seeded and editable under Settings.</summary>
public static class TemplateCodes
{
    public const string SrCreated = "SR_CREATED";
    public const string SrConfirmed = "SR_CONFIRMED";
    public const string TechAssigned = "TECH_ASSIGNED";
    public const string TechEnRoute = "TECH_EN_ROUTE";
    public const string CompletionCode = "COMPLETION_CODE";
    public const string JobCompleted = "JOB_COMPLETED";
    public const string WaitingForParts = "WAITING_FOR_PARTS";
    public const string Rescheduled = "RESCHEDULED";
    public const string CustomerMissed = "CUSTOMER_MISSED";
    public const string SrCancelled = "SR_CANCELLED";
    public const string JobOffer = "JOB_OFFER";
    public const string PaymentLink = "PAYMENT_LINK";
    public const string PaymentReceived = "PAYMENT_RECEIVED";
    public const string RefundProcessed = "REFUND_PROCESSED";
    public const string OtpLogin = "OTP_LOGIN";
    public const string OtpBooking = "OTP_BOOKING";
    public const string OtpCustomerLogin = "OTP_CUSTOMER_LOGIN";
}

public sealed record TemplateSeed(string Code, NotificationChannel Channel, string Body);

/// <summary>Default English wording (DESIGN-SYSTEM.md §9: plain, specific, named people).</summary>
public static class DefaultTemplates
{
    public static readonly IReadOnlyList<TemplateSeed> All =
    [
        new(TemplateCodes.SrCreated, NotificationChannel.WhatsApp,
            "Hi {{customer}}, we've received your request {{sr}} for {{service}}. We'll confirm your visit time shortly. Visiting charge: {{visit_charge}}. Track it here: {{link}}"),
        new(TemplateCodes.SrConfirmed, NotificationChannel.WhatsApp,
            "Your request {{sr}} for {{service}} is confirmed. We're assigning a technician now. Track it here: {{link}}"),
        new(TemplateCodes.TechAssigned, NotificationChannel.WhatsApp,
            "{{technician}} will handle your service {{sr}}. You can follow every step here: {{link}}"),
        new(TemplateCodes.TechEnRoute, NotificationChannel.WhatsApp,
            "{{technician}} is on the way for {{sr}}. Track the visit: {{link}}"),
        new(TemplateCodes.CompletionCode, NotificationChannel.WhatsApp,
            "{{technician}} has arrived for {{sr}}. Your completion code is {{code}}. Share it only after the work is done."),
        new(TemplateCodes.JobCompleted, NotificationChannel.WhatsApp,
            "Your service {{sr}} is complete. See the photos and bill here: {{link}}. Thank you for choosing us."),
        new(TemplateCodes.WaitingForParts, NotificationChannel.WhatsApp,
            "Your service {{sr}} needs a spare part. We'll confirm a new visit time as soon as it arrives. Details: {{link}}"),
        new(TemplateCodes.Rescheduled, NotificationChannel.WhatsApp,
            "Your visit for {{sr}} has been rescheduled. We'll confirm the new time shortly: {{link}}"),
        new(TemplateCodes.CustomerMissed, NotificationChannel.WhatsApp,
            "We missed you for {{sr}}. Reply here or call us to choose a new time: {{link}}"),
        new(TemplateCodes.SrCancelled, NotificationChannel.WhatsApp,
            "Your service request {{sr}} has been cancelled. If this is unexpected, please call us."),
        new(TemplateCodes.PaymentLink, NotificationChannel.WhatsApp,
            "Your bill for {{sr}} is {{amount}}. Pay securely online by UPI, card or net banking: {{pay_link}}"),
        new(TemplateCodes.PaymentReceived, NotificationChannel.WhatsApp,
            "We've received your payment of {{amount}} for {{sr}}. Thank you! Your bill: {{link}}"),
        new(TemplateCodes.RefundProcessed, NotificationChannel.WhatsApp,
            "We've refunded {{amount}} for {{sr}} to the way you paid. Your bank may take a few days to show it."),
        new(TemplateCodes.JobOffer, NotificationChannel.WhatsApp,
            "New job {{sr}}: {{service}} in {{area}}. Open the app to accept within {{minutes}} minutes."),
        new(TemplateCodes.OtpLogin, NotificationChannel.Sms,
            "{{code}} is your ServicePro login code. It expires in 5 minutes. Don't share it."),
        new(TemplateCodes.OtpBooking, NotificationChannel.Sms,
            "{{code}} is your code to confirm your repair booking. It expires in 5 minutes. Don't share it."),
        new(TemplateCodes.OtpCustomerLogin, NotificationChannel.Sms,
            "{{code}} is your code to see your bookings. It expires in 5 minutes. Don't share it."),

        // WhatsApp "authentication" templates (used when Notifications:OtpChannel = WhatsApp).
        // Meta fixes their wording; set each one's approved name under Settings > Messages.
        new(TemplateCodes.OtpLogin, NotificationChannel.WhatsApp, "{{code}} is your verification code. For your security, do not share this code."),
        new(TemplateCodes.OtpBooking, NotificationChannel.WhatsApp, "{{code}} is your verification code. For your security, do not share this code."),
        new(TemplateCodes.OtpCustomerLogin, NotificationChannel.WhatsApp, "{{code}} is your verification code. For your security, do not share this code."),
    ];

    /// <summary>
    /// Earlier default wording that was wrong, keyed by code. The seeder replaces it only if staff
    /// never edited the template (the body still matches exactly).
    /// </summary>
    public static readonly IReadOnlyDictionary<string, string> Superseded = new Dictionary<string, string>
    {
        // Said "confirmed" for bookings that still await review.
        [TemplateCodes.SrCreated] =
            "Hi {{customer}}, your request {{sr}} for {{service}} is confirmed. Visiting charge: {{visit_charge}}. Track it here: {{link}}",
    };
}
