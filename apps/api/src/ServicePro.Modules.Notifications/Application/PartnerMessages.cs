using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using ServicePro.BuildingBlocks.Messaging;
using ServicePro.BuildingBlocks.Persistence;
using ServicePro.Contracts.Events;
using ServicePro.Modules.Notifications.Channels;
using ServicePro.Modules.Notifications.Domain;

namespace ServicePro.Modules.Notifications.Application;

/// <summary>An approved partner hears it on WhatsApp, with the app download link.</summary>
public sealed class WelcomeApprovedPartner(NotificationDispatcher dispatcher, IOptions<NotificationOptions> options)
    : IEventHandler<TechnicianApplicationApproved>
{
    public async Task HandleAsync(TechnicianApplicationApproved e, CancellationToken ct)
    {
        var firstName = e.FullName.Split(' ', StringSplitOptions.RemoveEmptyEntries).FirstOrDefault() ?? e.FullName;
        var link = $"{options.Value.PublicSiteUrl.TrimEnd('/')}/downloads/pakka-fix-partner.apk";
        await dispatcher.SendAsync(new NotificationRequest(
            TemplateCodes.PartnerApproved, NotificationChannel.WhatsApp, RecipientType.Technician, e.TechnicianId, e.Phone,
            NotificationDispatcher.DefaultLanguage, new Dictionary<string, string> { ["name"] = firstName, ["link"] = link }, null), ct);
    }
}

/// <summary>
/// Templates seeded before the Pakka Fix name still say "ServicePro". Update those the office hasn't
/// edited (the text is exactly the old default); edited ones are left alone.
/// </summary>
public sealed class RenamedTemplateSeeder(DbContext db) : IDataSeeder
{
    private static readonly (string Code, NotificationChannel Channel, string OldBody)[] Renamed =
    [
        (TemplateCodes.OtpLogin, NotificationChannel.Sms, "{{code}} is your ServicePro login code. It expires in 5 minutes. Don't share it."),
    ];

    public int Order => 31; // after the templates are seeded

    public async Task SeedAsync(SeedContext context, CancellationToken ct)
    {
        foreach (var (code, channel, oldBody) in Renamed)
        {
            var current = DefaultTemplates.All.First(t => t.Code == code && t.Channel == channel).Body;
            var stale = await db.Set<NotificationTemplate>()
                .Where(t => t.Code == code && t.Channel == channel && t.Body == oldBody)
                .ToListAsync(ct);
            foreach (var template in stale)
            {
                template.Update(current, template.ProviderTemplateName, template.IsActive);
            }
        }

        await db.SaveChangesAsync(ct);
    }
}
