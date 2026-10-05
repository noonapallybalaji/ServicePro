using System.Globalization;
using Microsoft.EntityFrameworkCore;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;
using ServicePro.BuildingBlocks.Application;
using ServicePro.BuildingBlocks.Settings;
using ServicePro.Contracts.Ports;
using ServicePro.Modules.Billing.Domain;
using ServicePro.SharedKernel.Results;

namespace ServicePro.Modules.Billing.Application;

public sealed record InvoicePdfModel(
    string BusinessName,
    string BusinessContact,
    string? Gstin,
    string InvoiceNumber,
    string SrNumber,
    DateTimeOffset IssuedAt,
    string CustomerName,
    string CustomerAddress,
    IReadOnlyList<InvoiceLine> Lines,
    decimal Subtotal,
    decimal TaxRatePercent,
    decimal TaxAmount,
    decimal Total,
    decimal AmountPaid,
    TimeZoneInfo TimeZone);

/// <summary>A one-page bill (PLAN.md §6.2 QuestPDF). Same calm visual language as the app.</summary>
public sealed class InvoiceDocument(InvoicePdfModel model) : IDocument
{
    private static readonly CultureInfo India = CultureInfo.GetCultureInfo("en-IN");
    private const string Ink = "#141B19";
    private const string Muted = "#6A736F";
    private const string Brand = "#0B6276";
    private const string Line = "#D6DBD7";

    public DocumentMetadata GetMetadata() => new() { Title = model.InvoiceNumber, Author = model.BusinessName };

    public void Compose(IDocumentContainer container) =>
        container.Page(page =>
        {
            page.Size(PageSizes.A4);
            page.Margin(40);
            page.DefaultTextStyle(t => t.FontSize(10).FontColor(Ink));

            page.Header().Column(header =>
            {
                header.Item().Row(row =>
                {
                    row.RelativeItem().Column(c =>
                    {
                        c.Item().Text(model.BusinessName).FontSize(16).Bold().FontColor(Brand);
                        if (!string.IsNullOrWhiteSpace(model.BusinessContact))
                        {
                            c.Item().Text(model.BusinessContact).FontColor(Muted);
                        }

                        if (!string.IsNullOrWhiteSpace(model.Gstin))
                        {
                            c.Item().Text($"GSTIN {model.Gstin}").FontColor(Muted);
                        }
                    });
                    row.ConstantItem(180).AlignRight().Column(c =>
                    {
                        c.Item().AlignRight().Text("TAX INVOICE").FontSize(9).Bold().FontColor(Muted).LetterSpacing(0.06f);
                        c.Item().AlignRight().Text(model.InvoiceNumber).FontSize(14).Bold();
                        c.Item().AlignRight().Text(TimeZoneInfo.ConvertTime(model.IssuedAt, model.TimeZone).ToString("d MMM yyyy", India)).FontColor(Muted);
                    });
                });
                header.Item().PaddingVertical(16).LineHorizontal(1).LineColor(Line);
            });

            page.Content().Column(content =>
            {
                content.Spacing(16);
                content.Item().Row(row =>
                {
                    row.RelativeItem().Column(c =>
                    {
                        c.Item().Text("Billed to").FontSize(9).FontColor(Muted);
                        c.Item().Text(model.CustomerName).Bold();
                        c.Item().Text(model.CustomerAddress).FontColor(Muted);
                    });
                    row.ConstantItem(180).AlignRight().Column(c =>
                    {
                        c.Item().AlignRight().Text("Service request").FontSize(9).FontColor(Muted);
                        c.Item().AlignRight().Text(model.SrNumber).Bold();
                    });
                });

                content.Item().Table(table =>
                {
                    table.ColumnsDefinition(columns =>
                    {
                        columns.RelativeColumn(5);
                        columns.RelativeColumn(1);
                        columns.RelativeColumn(2);
                        columns.RelativeColumn(2);
                    });

                    table.Header(h =>
                    {
                        HeaderCell(h.Cell(), "Description");
                        HeaderCell(h.Cell().AlignRight(), "Qty");
                        HeaderCell(h.Cell().AlignRight(), "Rate");
                        HeaderCell(h.Cell().AlignRight(), "Amount");
                    });

                    foreach (var line in model.Lines.OrderBy(l => l.Position))
                    {
                        BodyCell(table.Cell()).Text(line.Description);
                        BodyCell(table.Cell()).AlignRight().Text(line.Quantity.ToString("0.##", India));
                        BodyCell(table.Cell()).AlignRight().Text(Rupees(line.UnitPrice));
                        BodyCell(table.Cell()).AlignRight().Text(Rupees(line.Amount));
                    }
                });

                content.Item().AlignRight().Width(220).Column(totals =>
                {
                    TotalRow(totals, "Subtotal", model.Subtotal);
                    if (model.TaxRatePercent > 0)
                    {
                        TotalRow(totals, $"GST {model.TaxRatePercent:0.##}%", model.TaxAmount);
                    }

                    totals.Item().PaddingVertical(4).LineHorizontal(1).LineColor(Line);
                    totals.Item().Row(r =>
                    {
                        r.RelativeItem().Text("Total").Bold();
                        r.RelativeItem().AlignRight().Text(Rupees(model.Total)).Bold().FontSize(13);
                    });
                    TotalRow(totals, "Paid", model.AmountPaid);
                    TotalRow(totals, "Balance", Math.Max(0, model.Total - model.AmountPaid));
                });
            });

            page.Footer().AlignCenter().Text("Thank you. Questions about this bill? Reply on WhatsApp or call us.").FontSize(9).FontColor(Muted);
        });

    private static void HeaderCell(IContainer cell, string text) =>
        cell.BorderBottom(1).BorderColor(Line).PaddingVertical(6).Text(text).FontSize(9).Bold().FontColor(Muted);

    private static IContainer BodyCell(IContainer cell) => cell.BorderBottom(0.5f).BorderColor(Line).PaddingVertical(6);

    private static void TotalRow(ColumnDescriptor column, string label, decimal amount) =>
        column.Item().Row(r =>
        {
            r.RelativeItem().Text(label).FontColor(Muted);
            r.RelativeItem().AlignRight().Text(Rupees(amount));
        });

    private static string Rupees(decimal amount) => amount.ToString("C2", India);
}

public sealed class RenderInvoicePdf(DbContext db, ICustomerDirectory customers, IServiceRequestWorkflow serviceRequests, ISettingsStore settings) : IUseCase
{
    static RenderInvoicePdf() => QuestPDF.Settings.License = LicenseType.Community;

    public async Task<Result<(byte[] Pdf, string FileName)>> ForServiceRequestAsync(Guid serviceRequestId, CancellationToken ct)
    {
        var invoice = await db.Set<Invoice>().Include(i => i.Lines).AsNoTracking()
            .FirstOrDefaultAsync(i => i.ServiceRequestId == serviceRequestId && i.Status != InvoiceStatus.Void, ct);
        if (invoice is null)
        {
            return BillingErrors.InvoiceNotFound;
        }

        var customer = await customers.GetAsync(invoice.CustomerId, ct);
        var job = await serviceRequests.GetDispatchContextAsync(serviceRequestId, ct);
        var model = new InvoicePdfModel(
            await settings.GetAsync(BillingSettings.BusinessName, ct),
            await settings.GetAsync(BillingSettings.BusinessContact, ct),
            await settings.GetAsync(BillingSettings.Gstin, ct),
            invoice.InvoiceNumber,
            invoice.SrNumber,
            invoice.IssuedAt,
            customer?.FullName ?? "Customer",
            job.IsSuccess ? string.Join(", ", new[] { job.Value.Locality, job.Value.Pincode }.Where(s => s.Length > 0)) : string.Empty,
            [.. invoice.Lines],
            invoice.Subtotal,
            invoice.TaxRatePercent,
            invoice.TaxAmount,
            invoice.Total,
            invoice.AmountPaid,
            await settings.GetTimeZoneAsync(ct));

        return (new InvoiceDocument(model).GeneratePdf(), $"{invoice.InvoiceNumber}.pdf");
    }

    public async Task<Result<(byte[] Pdf, string FileName)>> ForTrackingTokenAsync(string token, CancellationToken ct) =>
        await serviceRequests.FindIdByTrackingTokenAsync(token, ct) is { } serviceRequestId
            ? await ForServiceRequestAsync(serviceRequestId, ct)
            : Error.NotFound("tracking.not_found", "This tracking link has expired or doesn't exist.");
}
