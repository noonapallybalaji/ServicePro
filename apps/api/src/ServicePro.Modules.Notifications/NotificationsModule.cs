using FluentValidation;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using ServicePro.BuildingBlocks.Application;
using ServicePro.BuildingBlocks.Modules;
using ServicePro.BuildingBlocks.Persistence;
using ServicePro.BuildingBlocks.Security;
using ServicePro.BuildingBlocks.Web;
using ServicePro.Contracts.Ports;
using ServicePro.Modules.Notifications.Application;
using ServicePro.Modules.Notifications.Channels;
using ServicePro.Modules.Notifications.Domain;
using ServicePro.SharedKernel.Results;

namespace ServicePro.Modules.Notifications;

public sealed class NotificationsModule : IModule
{
    public string Name => "Notifications";

    public void Register(IServiceCollection services, IConfiguration configuration)
    {
        var section = configuration.GetSection(NotificationOptions.SectionName);
        services.Configure<NotificationOptions>(section);
        var options = section.Get<NotificationOptions>() ?? new NotificationOptions();

        services.AddScoped<NotificationDispatcher>();
        services.AddScoped<CustomerMessageContext>();
        services.AddScoped<IOtpSender, SmsOtpSender>();

        // Provider selection is configuration only (ADR 0009).
        if (options.WhatsApp.IsConfigured)
        {
            services.AddHttpClient<MetaWhatsAppChannel>();
            services.AddScoped<INotificationChannel>(sp => sp.GetRequiredService<MetaWhatsAppChannel>());
        }
        else
        {
            services.AddScoped<INotificationChannel>(sp => new LoggingChannel(NotificationChannel.WhatsApp, sp.GetRequiredService<ILogger<LoggingChannel>>()));
        }

        // SMS vendor is chosen after DLT registration (ADR 0009).
        services.AddScoped<INotificationChannel>(sp => new LoggingChannel(NotificationChannel.Sms, sp.GetRequiredService<ILogger<LoggingChannel>>()));
    }

    public void MapEndpoints(IEndpointRouteBuilder endpoints)
    {
        var admin = endpoints.MapGroup("/api/v1/admin/notifications").WithTags("Notifications").RequireAuthorization(AuthPolicies.Staff);

        admin.MapGet("/", async (Guid? serviceRequestId, int? take, ListNotifications useCase, CancellationToken ct) =>
                Results.Ok(await useCase.HandleAsync(serviceRequestId, take ?? 50, ct)))
            .Produces<IReadOnlyList<NotificationResponse>>()
            .WithName("ListNotifications");

        admin.MapGet("/templates", async (ManageTemplates useCase, CancellationToken ct) => Results.Ok(await useCase.ListAsync(ct)))
            .Produces<IReadOnlyList<TemplateResponse>>()
            .WithName("ListNotificationTemplates");

        admin.MapPut("/templates/{templateId:guid}", async (Guid templateId, UpdateTemplateRequest request, ManageTemplates useCase, CancellationToken ct) =>
                (await useCase.UpdateAsync(templateId, request, ct)).ToHttp())
            .RequireAuthorization(AuthPolicies.Admin)
            .Validate<UpdateTemplateRequest>()
            .Produces<TemplateResponse>()
            .WithStandardErrors()
            .WithName("UpdateNotificationTemplate");
    }
}

// ── Admin read/write ────────────────────────────────────────────────────────

public sealed record NotificationResponse(
    Guid Id,
    string TemplateCode,
    NotificationChannel Channel,
    RecipientType RecipientType,
    string RecipientAddress,
    Guid? ServiceRequestId,
    string RenderedBody,
    NotificationStatus Status,
    string? Error,
    DateTimeOffset CreatedAt,
    DateTimeOffset? SentAt);

public sealed record TemplateResponse(Guid Id, string Code, NotificationChannel Channel, string Language, string Body, string? ProviderTemplateName, IReadOnlyList<string> Variables, bool IsActive);

public sealed record UpdateTemplateRequest(string Body, string? ProviderTemplateName, bool IsActive);

internal sealed class UpdateTemplateRequestValidator : AbstractValidator<UpdateTemplateRequest>
{
    public UpdateTemplateRequestValidator() => RuleFor(r => r.Body).NotEmpty().MaximumLength(1024);
}

public sealed class ListNotifications(DbContext db) : IUseCase
{
    public async Task<IReadOnlyList<NotificationResponse>> HandleAsync(Guid? serviceRequestId, int take, CancellationToken ct) =>
        await db.Set<Notification>().AsNoTracking()
            .Where(n => serviceRequestId == null || n.ServiceRequestId == serviceRequestId)
            .OrderByDescending(n => n.CreatedAt)
            .Take(Math.Clamp(take, 1, 200))
            .Select(n => new NotificationResponse(n.Id, n.TemplateCode, n.Channel, n.RecipientType, n.RecipientAddress, n.ServiceRequestId,
                n.TemplateCode == TemplateCodes.OtpLogin ? "•••• (login code hidden)" : n.RenderedBody,
                n.Status, n.Error, n.CreatedAt, n.SentAt))
            .ToListAsync(ct);
}

public sealed class ManageTemplates(DbContext db) : IUseCase
{
    public async Task<IReadOnlyList<TemplateResponse>> ListAsync(CancellationToken ct) =>
        (await db.Set<NotificationTemplate>().AsNoTracking().OrderBy(t => t.Code).ThenBy(t => t.Language).ToListAsync(ct))
        .Select(ToResponse).ToList();

    public async Task<Result<TemplateResponse>> UpdateAsync(Guid templateId, UpdateTemplateRequest request, CancellationToken ct)
    {
        var template = await db.Set<NotificationTemplate>().FirstOrDefaultAsync(t => t.Id == templateId, ct);
        if (template is null)
        {
            return Error.NotFound("template.not_found", "That template doesn't exist.");
        }

        template.Update(request.Body, request.ProviderTemplateName, request.IsActive);
        await db.SaveChangesAsync(ct);
        return ToResponse(template);
    }

    private static TemplateResponse ToResponse(NotificationTemplate t) =>
        new(t.Id, t.Code, t.Channel, t.Language, t.Body, t.ProviderTemplateName, t.Variables, t.IsActive);
}

/// <summary>Seeds the default message templates once per tenant.</summary>
public sealed class NotificationTemplateSeeder(DbContext db) : IDataSeeder
{
    public int Order => 30;

    public async Task SeedAsync(SeedContext context, CancellationToken ct)
    {
        var existing = (await db.Set<NotificationTemplate>().Select(t => new { t.Code, t.Channel, t.Language }).ToListAsync(ct))
            .Select(t => (t.Code, t.Channel, t.Language)).ToHashSet();

        foreach (var seed in DefaultTemplates.All.Where(s => !existing.Contains((s.Code, s.Channel, NotificationDispatcher.DefaultLanguage))))
        {
            db.Set<NotificationTemplate>().Add(new NotificationTemplate(seed.Code, seed.Channel, NotificationDispatcher.DefaultLanguage, seed.Body, null));
        }

        await db.SaveChangesAsync(ct);
    }
}

// ── Persistence ─────────────────────────────────────────────────────────────

internal sealed class NotificationTemplateConfiguration : IEntityTypeConfiguration<NotificationTemplate>
{
    public void Configure(EntityTypeBuilder<NotificationTemplate> builder)
    {
        builder.ToTable("notification_templates", "comms");
        builder.Property(t => t.Code).HasMaxLength(60);
        builder.Property(t => t.Language).HasMaxLength(8);
        builder.Property(t => t.Body).HasMaxLength(1024);
        builder.Property(t => t.ProviderTemplateName).HasMaxLength(120);
        builder.HasIndex(t => new { t.TenantId, t.Code, t.Channel, t.Language }).IsUnique();
    }
}

internal sealed class NotificationConfiguration : IEntityTypeConfiguration<Notification>
{
    public void Configure(EntityTypeBuilder<Notification> builder)
    {
        builder.ToTable("notifications", "comms");
        builder.Property(n => n.TemplateCode).HasMaxLength(60);
        builder.Property(n => n.RecipientAddress).HasMaxLength(254);
        builder.Property(n => n.RenderedBody).HasMaxLength(2000);
        builder.Property(n => n.ProviderMessageId).HasMaxLength(200);
        builder.Property(n => n.Error).HasMaxLength(1000);
        builder.HasIndex(n => new { n.ServiceRequestId, n.CreatedAt });
    }
}
