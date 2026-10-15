using Microsoft.EntityFrameworkCore;
using ServicePro.BuildingBlocks.Application;
using ServicePro.BuildingBlocks.Settings;
using ServicePro.Modules.Catalog.Domain;

namespace ServicePro.Modules.Catalog.Application;

public static class PublicPriceSettings
{
    public static readonly SettingDefinition<bool> ShowToCustomers = new(
        "catalog.show_prices_to_customers",
        false,
        "Show typical repair prices (the active price-list items, as ranges) on the website and when booking. Turn on once the price list is reviewed.");
}

/// <summary>A typical price a customer may see: what it is, and the range we usually charge.</summary>
public sealed record PublicPriceResponse(Guid? IssueTypeId, string ItemName, decimal PriceMin, decimal PriceMax);

/// <summary>
/// Typical repair prices for one appliance, from the business's own price list (active items
/// only). Empty until the owner turns on catalog.show_prices_to_customers: prices are never
/// published before someone has checked them.
/// </summary>
public sealed class GetPublicPrices(DbContext db, ISettingsStore settings) : IUseCase
{
    public async Task<IReadOnlyList<PublicPriceResponse>> HandleAsync(Guid categoryId, CancellationToken ct)
    {
        if (!await settings.GetAsync(PublicPriceSettings.ShowToCustomers, ct))
        {
            return [];
        }

        return await db.Set<PriceListItem>().AsNoTracking()
            .Where(p => p.CategoryId == categoryId && p.IsActive)
            .OrderBy(p => p.PriceMin)
            .Select(p => new PublicPriceResponse(p.IssueTypeId, p.ItemName, p.PriceMin, p.PriceMax))
            .ToListAsync(ct);
    }
}
