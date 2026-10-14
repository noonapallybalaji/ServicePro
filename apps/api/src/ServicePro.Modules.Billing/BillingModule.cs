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
using ServicePro.Contracts.Ports;
using ServicePro.Modules.Billing.Application;
using ServicePro.Modules.Billing.Domain;
using ServicePro.SharedKernel;
using ServicePro.SharedKernel.Abstractions;

namespace ServicePro.Modules.Billing;

public sealed class BillingModule : IModule
{
    public string Name => "Billing";

    public void Register(IServiceCollection services, IConfiguration configuration)
    {
        services.AddScoped<BillingDirectory>();
        services.AddScoped<IBillingDirectory, OnlinePaymentsBillingDirectory>();

        services.Configure<RazorpayOptions>(configuration.GetSection("Payments:Razorpay"));
        services.Configure<BillingSiteOptions>(configuration.GetSection("Notifications"));
        services.AddHttpClient<IPaymentGateway, RazorpayGateway>(http => http.Timeout = TimeSpan.FromSeconds(20));
        services.AddScoped<PaymentLinks>();
        services.AddScoped<OnlinePaymentPosting>();
        services.AddSetting(BillingSettings.GstRatePercent);
        services.AddSetting(BillingSettings.BusinessName);
        services.AddSetting(BillingSettings.BusinessContact);
        services.AddSetting(BillingSettings.Gstin);
    }

    public void MapEndpoints(IEndpointRouteBuilder endpoints)
    {
        // Shared by staff and the assigned technician (access checked per job).
        var job = endpoints.MapGroup("/api/v1/service-requests/{serviceRequestId:guid}").WithTags("Billing").RequireAuthorization();

        job.MapGet("/invoice", async (Guid serviceRequestId, GetInvoiceForServiceRequest useCase, CancellationToken ct) =>
                (await useCase.HandleAsync(serviceRequestId, ct)).ToHttp())
            .Produces<InvoiceResponse>()
            .WithStandardErrors()
            .WithName("GetInvoice");

        job.MapPut("/invoice", async (Guid serviceRequestId, SaveInvoiceRequest request, SaveInvoice useCase, CancellationToken ct) =>
                (await useCase.HandleAsync(serviceRequestId, request, ct)).ToHttp())
            .Validate<SaveInvoiceRequest>()
            .Produces<InvoiceResponse>()
            .WithStandardErrors()
            .WithName("SaveInvoice");

        job.MapGet("/invoice.pdf", async (Guid serviceRequestId, RenderInvoicePdf useCase, ICurrentUser user, IServiceRequestWorkflow workflow, CancellationToken ct) =>
            {
                var context = await workflow.GetBillingContextAsync(serviceRequestId, ct);
                if (context.IsSuccess && user.Role == UserRole.Technician && context.Value.TechnicianId != user.TechnicianId)
                {
                    return Results.Forbid();
                }

                var result = await useCase.ForServiceRequestAsync(serviceRequestId, ct);
                return result.IsSuccess ? Results.File(result.Value.Pdf, "application/pdf", result.Value.FileName) : result.Error!.ToProblem();
            })
            .Produces(StatusCodes.Status200OK, contentType: "application/pdf")
            .WithStandardErrors()
            .WithName("GetInvoicePdf");

        job.MapPost("/payments", async (Guid serviceRequestId, RecordPaymentRequest request, RecordPayment useCase, CancellationToken ct) =>
                (await useCase.HandleAsync(serviceRequestId, request, ct)).ToHttp())
            .Validate<RecordPaymentRequest>()
            .Produces<PaymentResponse>()
            .WithStandardErrors()
            .WithName("RecordPayment");

        job.MapPost("/payments/waive", async (Guid serviceRequestId, WaivePaymentRequest request, WaivePayment useCase, CancellationToken ct) =>
                (await useCase.HandleAsync(serviceRequestId, request, ct)).ToHttp())
            .RequireAuthorization(AuthPolicies.Admin)
            .Produces(StatusCodes.Status204NoContent)
            .WithStandardErrors()
            .WithName("WaivePayment");

        var admin = endpoints.MapGroup("/api/v1/admin/billing").WithTags("Billing").RequireAuthorization(AuthPolicies.Staff);

        admin.MapGet("/payments", async (DateOnly? from, DateOnly? to, PaymentMethod? method, int? page, int? pageSize, ListPayments useCase, CancellationToken ct) =>
                Results.Ok(await useCase.HandleAsync(from, to, method, new PageRequest(page ?? 1, pageSize ?? 25), ct)))
            .Produces<PagedResult<PaymentListItem>>()
            .WithName("ListPayments");

        admin.MapGet("/ledger/{technicianId:guid}", async (Guid technicianId, TechnicianLedger useCase, CancellationToken ct) =>
                Results.Ok(await useCase.GetAsync(technicianId, 100, ct)))
            .Produces<LedgerResponse>()
            .WithName("GetTechnicianLedger");

        admin.MapPost("/ledger/{technicianId:guid}", async (Guid technicianId, LedgerEntryRequest request, TechnicianLedger useCase, CancellationToken ct) =>
                (await useCase.AddEntryAsync(technicianId, request, ct)).ToHttp())
            .RequireAuthorization(AuthPolicies.Admin)
            .Validate<LedgerEntryRequest>()
            .Produces<LedgerResponse>()
            .WithStandardErrors()
            .WithName("AddLedgerEntry");

        endpoints.MapGet("/api/v1/tech/me/earnings", async (TechnicianLedger useCase, ICurrentUser user, CancellationToken ct) =>
                Results.Ok(await useCase.GetAsync(user.TechnicianId!.Value, 50, ct)))
            .WithTags("Technician app")
            .RequireAuthorization(AuthPolicies.Technician)
            .Produces<LedgerResponse>()
            .WithName("GetMyEarnings");

        endpoints.MapGet("/api/v1/public/track/{token}/invoice.pdf", async (string token, RenderInvoicePdf useCase, CancellationToken ct) =>
            {
                var result = await useCase.ForTrackingTokenAsync(token, ct);
                return result.IsSuccess ? Results.File(result.Value.Pdf, "application/pdf", result.Value.FileName) : result.Error!.ToProblem();
            })
            .WithTags("Tracking")
            .AllowAnonymous()
            .RequireRateLimiting(RateLimitPolicies.Public)
            .Produces(StatusCodes.Status200OK, contentType: "application/pdf")
            .WithStandardErrors()
            .WithName("GetTrackingInvoicePdf");

        // Online payment (customer, by tracking link)
        var pay = endpoints.MapGroup("/api/v1/public/track/{token}").WithTags("Tracking").AllowAnonymous().RequireRateLimiting(RateLimitPolicies.Public);

        pay.MapPost("/pay", async (string token, StartOnlinePayment useCase, CancellationToken ct) => (await useCase.HandleAsync(token, ct)).ToHttp())
            .Produces<PayOnlineResponse>()
            .WithStandardErrors()
            .WithName("StartOnlinePayment");

        pay.MapPost("/payment-check", async (string token, CheckOnlinePayment useCase, CancellationToken ct) => (await useCase.HandleAsync(token, ct)).ToHttp())
            .Produces<PaymentCheckResponse>()
            .WithStandardErrors()
            .WithName("CheckOnlinePayment");

        // Gateway webhook: authenticated by its signature, not by a session.
        endpoints.MapPost("/api/v1/webhooks/razorpay", async (HttpRequest request, HandleRazorpayWebhook useCase, CancellationToken ct) =>
            {
                using var reader = new StreamReader(request.Body);
                var body = await reader.ReadToEndAsync(ct);
                var result = await useCase.HandleAsync(body, request.Headers["X-Razorpay-Signature"], ct);
                return result.IsSuccess ? Results.Ok() : result.Error!.ToProblem();
            })
            .WithTags("Webhooks")
            .AllowAnonymous()
            .ExcludeFromDescription();

        // Staff and the assigned technician
        job.MapPost("/payment-link", async (Guid serviceRequestId, SendPaymentLink useCase, CancellationToken ct) =>
                (await useCase.HandleAsync(serviceRequestId, ct)).ToHttp())
            .Produces<PayOnlineResponse>()
            .WithStandardErrors()
            .WithName("SendPaymentLink");

        job.MapGet("/payment-activity", async (Guid serviceRequestId, GetPaymentActivity useCase, CancellationToken ct) =>
                (await useCase.HandleAsync(serviceRequestId, ct)).ToHttp())
            .Produces<PaymentActivityResponse>()
            .WithStandardErrors()
            .WithName("GetPaymentActivity");

        job.MapPost("/payments/{paymentId:guid}/refunds", async (Guid serviceRequestId, Guid paymentId, RefundRequest request, RefundPayment useCase, CancellationToken ct) =>
                (await useCase.HandleAsync(serviceRequestId, paymentId, request, ct)).ToHttp())
            .RequireAuthorization(AuthPolicies.Admin)
            .Validate<RefundRequest>()
            .Produces<RefundResponse>()
            .WithStandardErrors()
            .WithName("RefundPayment");

        job.MapPost("/refunds/{refundId:guid}/process", async (Guid serviceRequestId, Guid refundId, ProcessRefundRequest request, ProcessQueuedRefund useCase, CancellationToken ct) =>
                (await useCase.HandleAsync(serviceRequestId, refundId, request, ct)).ToHttp())
            .RequireAuthorization(AuthPolicies.Admin)
            .Produces<RefundResponse>()
            .WithStandardErrors()
            .WithName("ProcessQueuedRefund");
    }
}

// ── Persistence ─────────────────────────────────────────────────────────────

internal sealed class InvoiceConfiguration : IEntityTypeConfiguration<Invoice>
{
    public void Configure(EntityTypeBuilder<Invoice> builder)
    {
        builder.ToTable("invoices", "billing");
        builder.Property(i => i.InvoiceNumber).HasMaxLength(30);
        builder.Property(i => i.SrNumber).HasMaxLength(20);
        foreach (var money in new[] { nameof(Invoice.Subtotal), nameof(Invoice.TaxAmount), nameof(Invoice.Total), nameof(Invoice.AmountPaid) })
        {
            builder.Property(money).HasPrecision(12, 2);
        }

        builder.Property(i => i.TaxRatePercent).HasPrecision(5, 2);
        builder.Property(i => i.Version).IsRowVersion();
        builder.Ignore(i => i.Outstanding);
        builder.HasIndex(i => new { i.TenantId, i.InvoiceNumber }).IsUnique();
        builder.HasIndex(i => i.ServiceRequestId).IsUnique().HasFilter("status <> 'VOID'");
        builder.HasMany(i => i.Lines).WithOne().HasForeignKey(l => l.InvoiceId).OnDelete(DeleteBehavior.Cascade);
        builder.Navigation(i => i.Lines).UsePropertyAccessMode(PropertyAccessMode.Field);
    }
}

internal sealed class InvoiceLineConfiguration : IEntityTypeConfiguration<InvoiceLine>
{
    public void Configure(EntityTypeBuilder<InvoiceLine> builder)
    {
        builder.ToTable("invoice_lines", "billing");
        builder.Property(l => l.Description).HasMaxLength(200);
        builder.Property(l => l.Quantity).HasPrecision(10, 2);
        builder.Property(l => l.UnitPrice).HasPrecision(12, 2);
        builder.Property(l => l.Amount).HasPrecision(12, 2);
    }
}

internal sealed class PaymentConfiguration : IEntityTypeConfiguration<Payment>
{
    public void Configure(EntityTypeBuilder<Payment> builder)
    {
        builder.ToTable("payments", "billing");
        builder.Property(p => p.Amount).HasPrecision(12, 2);
        builder.Property(p => p.Reference).HasMaxLength(100);
        builder.Property(p => p.ProviderPaymentId).HasMaxLength(64);
        builder.Property(p => p.AmountRefunded).HasPrecision(12, 2);
        builder.Ignore(p => p.Refundable);
        builder.HasIndex(p => p.ServiceRequestId);
        builder.HasIndex(p => p.ReceivedAt);
        builder.HasIndex(p => p.ProviderPaymentId).IsUnique().HasFilter("provider_payment_id IS NOT NULL");
    }
}

internal sealed class PaymentLinkConfiguration : IEntityTypeConfiguration<PaymentLink>
{
    public void Configure(EntityTypeBuilder<PaymentLink> builder)
    {
        builder.ToTable("payment_links", "billing");
        builder.Property(l => l.Provider).HasMaxLength(20);
        builder.Property(l => l.ProviderLinkId).HasMaxLength(64);
        builder.Property(l => l.Url).HasMaxLength(300);
        builder.Property(l => l.Amount).HasPrecision(12, 2);
        builder.HasIndex(l => l.ProviderLinkId).IsUnique();
        builder.HasIndex(l => l.ServiceRequestId);
    }
}

internal sealed class RefundConfiguration : IEntityTypeConfiguration<Refund>
{
    public void Configure(EntityTypeBuilder<Refund> builder)
    {
        builder.ToTable("refunds", "billing");
        builder.Property(r => r.Amount).HasPrecision(12, 2);
        builder.Property(r => r.Reason).HasMaxLength(300);
        builder.Property(r => r.Reference).HasMaxLength(100);
        builder.Property(r => r.FailureReason).HasMaxLength(500);
        builder.HasIndex(r => r.ServiceRequestId);
        builder.HasIndex(r => r.Reference);
    }
}

internal sealed class TechnicianLedgerEntryConfiguration : IEntityTypeConfiguration<TechnicianLedgerEntry>
{
    public void Configure(EntityTypeBuilder<TechnicianLedgerEntry> builder)
    {
        builder.ToTable("technician_ledger", "billing");
        builder.Property(e => e.Amount).HasPrecision(12, 2);
        builder.Property(e => e.Note).HasMaxLength(200);
        builder.HasIndex(e => new { e.TechnicianId, e.OccurredAt });
    }
}

internal sealed class BillingModelContributor : IModelContributor
{
    public void Configure(ModelBuilder modelBuilder) =>
        modelBuilder.HasSequence<long>("invoice_number_seq", "billing").StartsAt(1);
}
