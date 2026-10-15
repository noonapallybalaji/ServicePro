using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using ServicePro.BuildingBlocks;
using ServicePro.BuildingBlocks.Modules;
using ServicePro.BuildingBlocks.Persistence;
using ServicePro.BuildingBlocks.Security;
using ServicePro.BuildingBlocks.Web;
using ServicePro.Modules.Support.Application;
using ServicePro.Modules.Support.Domain;
using ServicePro.SharedKernel.Results;
using ServicePro.SharedKernel.ValueObjects;

namespace ServicePro.Modules.Support;

public sealed class SupportModule : IModule
{
    public string Name => "Support";

    public void Register(IServiceCollection services, IConfiguration configuration)
    {
        services.AddScoped<TicketNumberGenerator>();
        services.AddSetting(SupportSettings.FirstResponseMinutes);
    }

    public void MapEndpoints(IEndpointRouteBuilder endpoints)
    {
        // The signed-in customer's own requests (customer site: My bookings > Help).
        var mine = endpoints.MapGroup("/api/v1/account/support").WithTags("Customer support").RequireAuthorization(AuthPolicies.Customer);

        mine.MapGet("/", async (ListMyTickets useCase, CancellationToken ct) => (await useCase.HandleAsync(ct)).ToHttp())
            .Produces<IReadOnlyList<TicketSummary>>()
            .WithStandardErrors()
            .WithName("ListMyTickets");

        mine.MapPost("/", async (OpenTicketRequest request, OpenMyTicket useCase, CancellationToken ct) => (await useCase.HandleAsync(request, ct)).ToHttp())
            .RequireRateLimiting(RateLimitPolicies.Auth)
            .Validate<OpenTicketRequest>()
            .Produces<CustomerTicketResponse>()
            .WithStandardErrors()
            .WithName("OpenMyTicket");

        mine.MapGet("/{number}", async (string number, GetMyTicket useCase, CancellationToken ct) => (await useCase.HandleAsync(number, ct)).ToHttp())
            .Produces<CustomerTicketResponse>()
            .WithStandardErrors()
            .WithName("GetMyTicket");

        mine.MapPost("/{number}/messages", async (string number, TicketMessageRequest request, WriteToMyTicket useCase, CancellationToken ct) =>
                (await useCase.HandleAsync(number, request, ct)).ToHttp())
            .RequireRateLimiting(RateLimitPolicies.Public)
            .Validate<TicketMessageRequest>()
            .Produces<CustomerTicketResponse>()
            .WithStandardErrors()
            .WithName("WriteToMyTicket");

        mine.MapPost("/{number}/photos", async (string number, IFormFile file, AddTicketPhoto useCase, CancellationToken ct) =>
            {
                await using var stream = file.OpenReadStream();
                return (await useCase.HandleAsync(number, stream, file.ContentType, file.Length, ct)).ToHttp();
            })
            .RequireRateLimiting(RateLimitPolicies.Public)
            .DisableAntiforgery()
            .Produces<int>()
            .WithStandardErrors()
            .WithName("AddTicketPhoto");

        mine.MapPost("/{number}/resolve", async (string number, ResolveMyTicket useCase, CancellationToken ct) => (await useCase.HandleAsync(number, ct)).ToHttp())
            .Produces<CustomerTicketResponse>()
            .WithStandardErrors()
            .WithName("ResolveMyTicket");

        // Staff support console.
        var staff = endpoints.MapGroup("/api/v1/admin/support").WithTags("Support").RequireAuthorization(AuthPolicies.Staff);

        staff.MapGet("/", async Task<IResult> (string? status, bool? mine, Guid? serviceRequestId, ListTickets useCase, CancellationToken ct) =>
            {
                TicketStatus? parsed = null;
                if (!string.IsNullOrEmpty(status))
                {
                    if (!EnumText.TryParse<TicketStatus>(status, out var value))
                    {
                        return Error.Validation("support.status_invalid", $"Unknown status '{status}'.").ToProblem();
                    }

                    parsed = value;
                }

                return Results.Ok(await useCase.HandleAsync(parsed, mine ?? false, serviceRequestId, ct));
            })
            .Produces<IReadOnlyList<StaffTicketListItem>>()
            .WithName("ListTickets");

        staff.MapGet("/{id:guid}", async (Guid id, GetTicket useCase, CancellationToken ct) => (await useCase.HandleAsync(id, ct)).ToHttp())
            .Produces<StaffTicketResponse>()
            .WithStandardErrors()
            .WithName("GetTicket");

        staff.MapGet("/{id:guid}/photos/{photoId:guid}", async (Guid id, Guid photoId, OpenTicketPhoto useCase, CancellationToken ct) =>
            {
                var result = await useCase.HandleAsync(id, photoId, ct);
                return result.IsSuccess ? Results.Stream(result.Value.Content, result.Value.ContentType) : result.Error!.ToProblem();
            })
            .WithStandardErrors()
            .WithName("OpenTicketPhoto");

        staff.MapPost("/{id:guid}/messages", async (Guid id, StaffReplyRequest request, ReplyToTicket useCase, CancellationToken ct) =>
                (await useCase.HandleAsync(id, request, ct)).ToHttp())
            .Validate<StaffReplyRequest>()
            .Produces<StaffTicketResponse>()
            .WithStandardErrors()
            .WithName("ReplyToTicket");

        staff.MapPatch("/{id:guid}", async (Guid id, UpdateTicketRequest request, UpdateTicket useCase, CancellationToken ct) =>
                (await useCase.HandleAsync(id, request, ct)).ToHttp())
            .Produces<StaffTicketResponse>()
            .WithStandardErrors()
            .WithName("UpdateTicket");

        // The WhatsApp assistant hands a conversation to a person (n8n escalate_to_human).
        endpoints.MapPost("/api/v1/integrations/support-tickets", async (AssistantTicketRequest request, OpenTicketFromAssistant useCase, CancellationToken ct) =>
                (await useCase.HandleAsync(request, ct)).ToHttp())
            .WithTags("Integrations")
            .RequireAuthorization(AuthPolicies.Integration)
            .RequireRateLimiting(RateLimitPolicies.Integration)
            .Validate<AssistantTicketRequest>()
            .Produces<AssistantTicketResponse>()
            .ProducesProblem(StatusCodes.Status401Unauthorized)
            .WithStandardErrors()
            .WithName("OpenTicketFromAssistant");
    }
}

// ── Persistence ─────────────────────────────────────────────────────────────

internal sealed class SupportTicketConfiguration : IEntityTypeConfiguration<SupportTicket>
{
    public void Configure(EntityTypeBuilder<SupportTicket> builder)
    {
        builder.ToTable("tickets", SupportSchema.Name);
        builder.Property(t => t.Number).HasMaxLength(20);
        builder.Property(t => t.ContactPhone)
            .HasConversion(p => p!.Value, v => PhoneNumber.FromTrusted(v))
            .HasMaxLength(16);
        builder.Property(t => t.ContactName).HasMaxLength(120);
        builder.Property(t => t.SrNumber).HasMaxLength(20);
        builder.Property(t => t.ExternalReference).HasMaxLength(100);
        builder.HasIndex(t => new { t.TenantId, t.Number }).IsUnique();
        builder.HasIndex(t => new { t.TenantId, t.ExternalReference }).IsUnique().HasFilter("external_reference IS NOT NULL");
        builder.HasIndex(t => new { t.Status, t.FirstResponseDueAt });
        builder.HasIndex(t => t.CustomerId);
        builder.HasIndex(t => t.ServiceRequestId);
        builder.HasMany(t => t.Messages).WithOne().HasForeignKey(m => m.TicketId).OnDelete(DeleteBehavior.Cascade);
        builder.Navigation(t => t.Messages).UsePropertyAccessMode(PropertyAccessMode.Field);
        builder.HasMany(t => t.Photos).WithOne().HasForeignKey(p => p.TicketId).OnDelete(DeleteBehavior.Cascade);
        builder.Navigation(t => t.Photos).UsePropertyAccessMode(PropertyAccessMode.Field);
    }
}

internal sealed class TicketPhotoConfiguration : IEntityTypeConfiguration<TicketPhoto>
{
    public void Configure(EntityTypeBuilder<TicketPhoto> builder)
    {
        builder.ToTable("ticket_photos", SupportSchema.Name);
        builder.Property(p => p.StorageKey).HasMaxLength(300);
        builder.Property(p => p.ContentType).HasMaxLength(60);
        builder.HasIndex(p => p.TicketId);
    }
}

internal sealed class TicketMessageConfiguration : IEntityTypeConfiguration<TicketMessage>
{
    public void Configure(EntityTypeBuilder<TicketMessage> builder)
    {
        builder.ToTable("ticket_messages", SupportSchema.Name);
        builder.Property(m => m.Body).HasMaxLength(SupportTicket.MaxMessageLength);
        builder.HasIndex(m => new { m.TicketId, m.SentAt });
    }
}

internal sealed class SupportModelContributor : IModelContributor
{
    public void Configure(ModelBuilder modelBuilder) =>
        modelBuilder.HasSequence<long>(TicketNumberGenerator.Sequence, SupportSchema.Name).StartsAt(10001);
}
