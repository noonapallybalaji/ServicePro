using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using ServicePro.Contracts.Ports;
using ServicePro.Modules.Catalog.Domain;

namespace ServicePro.Modules.Catalog.Infrastructure;

internal static class CatalogSchema
{
    public const string Name = "catalog";
}

internal sealed class ServiceCategoryConfiguration : IEntityTypeConfiguration<ServiceCategory>
{
    public void Configure(EntityTypeBuilder<ServiceCategory> builder)
    {
        builder.ToTable("service_categories", CatalogSchema.Name);
        builder.Property(c => c.Code).HasMaxLength(40);
        builder.Property(c => c.Name).HasMaxLength(120);
        builder.Property(c => c.BaseVisitCharge).HasPrecision(12, 2);
        builder.HasIndex(c => new { c.TenantId, c.Code }).IsUnique();
    }
}

internal sealed class IssueTypeConfiguration : IEntityTypeConfiguration<IssueType>
{
    public void Configure(EntityTypeBuilder<IssueType> builder)
    {
        builder.ToTable("issue_types", CatalogSchema.Name);
        builder.Property(i => i.Code).HasMaxLength(60);
        builder.Property(i => i.Name).HasMaxLength(160);
        builder.HasIndex(i => new { i.TenantId, i.CategoryId, i.Code }).IsUnique();
        builder.HasOne<ServiceCategory>().WithMany().HasForeignKey(i => i.CategoryId).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class BrandConfiguration : IEntityTypeConfiguration<Brand>
{
    public void Configure(EntityTypeBuilder<Brand> builder)
    {
        builder.ToTable("brands", CatalogSchema.Name);
        builder.Property(b => b.Name).HasMaxLength(80);
        builder.HasIndex(b => new { b.TenantId, b.Name }).IsUnique();
    }
}

internal sealed class PriceListItemConfiguration : IEntityTypeConfiguration<PriceListItem>
{
    public void Configure(EntityTypeBuilder<PriceListItem> builder)
    {
        builder.ToTable("price_list", CatalogSchema.Name);
        builder.Property(p => p.ItemName).HasMaxLength(160);
        builder.Property(p => p.PriceMin).HasPrecision(12, 2);
        builder.Property(p => p.PriceMax).HasPrecision(12, 2);
        builder.HasOne<ServiceCategory>().WithMany().HasForeignKey(p => p.CategoryId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<IssueType>().WithMany().HasForeignKey(p => p.IssueTypeId).OnDelete(DeleteBehavior.SetNull);
    }
}

internal sealed class ServiceAreaConfiguration : IEntityTypeConfiguration<ServiceArea>
{
    public void Configure(EntityTypeBuilder<ServiceArea> builder)
    {
        builder.ToTable("service_areas", CatalogSchema.Name);
        builder.Property(a => a.Name).HasMaxLength(120);
    }
}

/// <summary>Read port for other modules (ADR 0001).</summary>
internal sealed class CatalogDirectory(DbContext db) : ICatalogDirectory
{
    public async Task<CategoryInfo?> GetCategoryAsync(Guid categoryId, CancellationToken ct) =>
        await db.Set<ServiceCategory>().AsNoTracking()
            .Where(c => c.Id == categoryId)
            .Select(c => new CategoryInfo(c.Id, c.Code, c.Name, c.BaseVisitCharge, c.RequiresPhotos))
            .FirstOrDefaultAsync(ct);

    public async Task<IReadOnlyDictionary<Guid, CategoryInfo>> GetCategoriesAsync(IEnumerable<Guid> categoryIds, CancellationToken ct)
    {
        var ids = categoryIds.Distinct().ToList();
        return await db.Set<ServiceCategory>().AsNoTracking()
            .Where(c => ids.Contains(c.Id))
            .Select(c => new CategoryInfo(c.Id, c.Code, c.Name, c.BaseVisitCharge, c.RequiresPhotos))
            .ToDictionaryAsync(c => c.Id, ct);
    }

    public async Task<IssueTypeInfo?> GetIssueTypeAsync(Guid issueTypeId, CancellationToken ct) =>
        await db.Set<IssueType>().AsNoTracking()
            .Where(i => i.Id == issueTypeId)
            .Select(i => new IssueTypeInfo(i.Id, i.CategoryId, i.Code, i.Name, i.MinSkillLevel, i.TypicalDurationMinutes))
            .FirstOrDefaultAsync(ct);

    public async Task<IReadOnlyList<Guid>> FindServiceAreaIdsByPincodeAsync(string pincode, CancellationToken ct) =>
        await db.Set<ServiceArea>().AsNoTracking()
            .Where(a => a.IsActive && a.Pincodes.Contains(pincode))
            .Select(a => a.Id)
            .ToListAsync(ct);
}
