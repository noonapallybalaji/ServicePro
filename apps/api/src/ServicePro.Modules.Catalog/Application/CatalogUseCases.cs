using FluentValidation;
using Microsoft.EntityFrameworkCore;
using ServicePro.BuildingBlocks.Application;
using ServicePro.Contracts;
using ServicePro.Modules.Catalog.Domain;
using ServicePro.SharedKernel.Results;

namespace ServicePro.Modules.Catalog.Application;

// ── Read model ──────────────────────────────────────────────────────────────

public sealed record IssueTypeResponse(
    Guid Id,
    Guid CategoryId,
    string Code,
    string Name,
    int TypicalDurationMinutes,
    int MinSkillLevel,
    Priority DefaultPriority,
    bool IsActive);

public sealed record CategoryResponse(
    Guid Id,
    string Code,
    string Name,
    decimal BaseVisitCharge,
    bool RequiresPhotos,
    int SortOrder,
    bool IsActive,
    IReadOnlyList<IssueTypeResponse> IssueTypes);

public sealed record BrandResponse(Guid Id, string Name, bool IsActive);

public sealed record PriceListItemResponse(Guid Id, Guid CategoryId, Guid? IssueTypeId, string ItemName, decimal PriceMin, decimal PriceMax, bool IsActive);

public sealed record ServiceAreaResponse(Guid Id, string Name, IReadOnlyList<string> Pincodes, bool IsActive);

internal static class CatalogErrors
{
    public static readonly Error CategoryNotFound = Error.NotFound("category.not_found", "That category doesn't exist.");
    public static readonly Error IssueTypeNotFound = Error.NotFound("issue_type.not_found", "That issue type doesn't exist.");
    public static readonly Error CodeTaken = Error.Conflict("catalog.code_taken", "That code is already used.");
    public static readonly Error NotFound = Error.NotFound("catalog.not_found", "That item doesn't exist.");
}

/// <summary>The full catalog tree. Used by booking, technician and admin screens.</summary>
public sealed class GetCatalog(DbContext db) : IUseCase
{
    public async Task<IReadOnlyList<CategoryResponse>> HandleAsync(bool activeOnly, CancellationToken ct)
    {
        var categories = await db.Set<ServiceCategory>().AsNoTracking()
            .Where(c => !activeOnly || c.IsActive)
            .OrderBy(c => c.SortOrder).ThenBy(c => c.Name)
            .ToListAsync(ct);
        var issues = await db.Set<IssueType>().AsNoTracking()
            .Where(i => !activeOnly || i.IsActive)
            .OrderBy(i => i.Name)
            .ToListAsync(ct);
        var issuesByCategory = issues.ToLookup(i => i.CategoryId);

        return categories
            .Select(c => new CategoryResponse(
                c.Id, c.Code, c.Name, c.BaseVisitCharge, c.RequiresPhotos, c.SortOrder, c.IsActive,
                [.. issuesByCategory[c.Id].Select(ToResponse)]))
            .ToList();
    }

    internal static IssueTypeResponse ToResponse(IssueType i) =>
        new(i.Id, i.CategoryId, i.Code, i.Name, i.TypicalDurationMinutes, i.MinSkillLevel, i.DefaultPriority, i.IsActive);
}

// ── Categories ──────────────────────────────────────────────────────────────

public sealed record SaveCategoryRequest(string Code, string Name, decimal BaseVisitCharge, bool RequiresPhotos, int SortOrder, bool IsActive = true);

internal sealed class SaveCategoryRequestValidator : AbstractValidator<SaveCategoryRequest>
{
    public SaveCategoryRequestValidator()
    {
        RuleFor(r => r.Code).NotEmpty().MaximumLength(40).Matches("^[A-Za-z0-9_ ]+$");
        RuleFor(r => r.Name).NotEmpty().MaximumLength(120);
        RuleFor(r => r.BaseVisitCharge).InclusiveBetween(0, 100_000);
    }
}

public sealed class SaveCategory(DbContext db) : IUseCase
{
    public async Task<Result<Guid>> HandleAsync(Guid? categoryId, SaveCategoryRequest request, CancellationToken ct)
    {
        var code = ServiceCategory.NormalizeCode(request.Code);
        if (await db.Set<ServiceCategory>().AnyAsync(c => c.Code == code && c.Id != categoryId, ct))
        {
            return CatalogErrors.CodeTaken;
        }

        ServiceCategory category;
        if (categoryId is { } id)
        {
            var existing = await db.Set<ServiceCategory>().FirstOrDefaultAsync(c => c.Id == id, ct);
            if (existing is null)
            {
                return CatalogErrors.CategoryNotFound;
            }

            category = existing;
            category.Update(request.Name, request.BaseVisitCharge, request.RequiresPhotos, request.SortOrder, request.IsActive);
        }
        else
        {
            category = new ServiceCategory(code, request.Name, request.BaseVisitCharge, request.RequiresPhotos, request.SortOrder);
            db.Set<ServiceCategory>().Add(category);
        }

        await db.SaveChangesAsync(ct);
        return category.Id;
    }
}

// ── Issue types ─────────────────────────────────────────────────────────────

public sealed record SaveIssueTypeRequest(
    Guid CategoryId,
    string Code,
    string Name,
    int TypicalDurationMinutes,
    int MinSkillLevel,
    Priority DefaultPriority = Priority.Normal,
    bool IsActive = true);

internal sealed class SaveIssueTypeRequestValidator : AbstractValidator<SaveIssueTypeRequest>
{
    public SaveIssueTypeRequestValidator()
    {
        RuleFor(r => r.CategoryId).NotEmpty();
        RuleFor(r => r.Code).NotEmpty().MaximumLength(60).Matches("^[A-Za-z0-9_ ]+$");
        RuleFor(r => r.Name).NotEmpty().MaximumLength(160);
        RuleFor(r => r.TypicalDurationMinutes).InclusiveBetween(10, 8 * 60);
        RuleFor(r => r.MinSkillLevel).InclusiveBetween(1, 5);
    }
}

public sealed class SaveIssueType(DbContext db) : IUseCase
{
    public async Task<Result<Guid>> HandleAsync(Guid? issueTypeId, SaveIssueTypeRequest request, CancellationToken ct)
    {
        if (!await db.Set<ServiceCategory>().AnyAsync(c => c.Id == request.CategoryId, ct))
        {
            return CatalogErrors.CategoryNotFound;
        }

        var code = ServiceCategory.NormalizeCode(request.Code);
        if (await db.Set<IssueType>().AnyAsync(i => i.CategoryId == request.CategoryId && i.Code == code && i.Id != issueTypeId, ct))
        {
            return CatalogErrors.CodeTaken;
        }

        IssueType issueType;
        if (issueTypeId is { } id)
        {
            var existing = await db.Set<IssueType>().FirstOrDefaultAsync(i => i.Id == id, ct);
            if (existing is null)
            {
                return CatalogErrors.IssueTypeNotFound;
            }

            issueType = existing;
            issueType.Update(request.Name, request.TypicalDurationMinutes, request.MinSkillLevel, request.DefaultPriority, request.IsActive);
        }
        else
        {
            issueType = new IssueType(request.CategoryId, code, request.Name, request.TypicalDurationMinutes, request.MinSkillLevel, request.DefaultPriority);
            db.Set<IssueType>().Add(issueType);
        }

        await db.SaveChangesAsync(ct);
        return issueType.Id;
    }
}

// ── Brands ──────────────────────────────────────────────────────────────────

public sealed record SaveBrandRequest(string Name, bool IsActive = true);

internal sealed class SaveBrandRequestValidator : AbstractValidator<SaveBrandRequest>
{
    public SaveBrandRequestValidator() => RuleFor(r => r.Name).NotEmpty().MaximumLength(80);
}

public sealed class ListBrands(DbContext db) : IUseCase
{
    public async Task<IReadOnlyList<BrandResponse>> HandleAsync(CancellationToken ct) =>
        await db.Set<Brand>().AsNoTracking().OrderBy(b => b.Name)
            .Select(b => new BrandResponse(b.Id, b.Name, b.IsActive))
            .ToListAsync(ct);
}

public sealed class SaveBrand(DbContext db) : IUseCase
{
    public async Task<Result<Guid>> HandleAsync(Guid? brandId, SaveBrandRequest request, CancellationToken ct)
    {
        var name = request.Name.Trim();
        if (await db.Set<Brand>().AnyAsync(b => b.Name == name && b.Id != brandId, ct))
        {
            return Error.Conflict("brand.exists", "That brand already exists.");
        }

        Brand brand;
        if (brandId is { } id)
        {
            var existing = await db.Set<Brand>().FirstOrDefaultAsync(b => b.Id == id, ct);
            if (existing is null)
            {
                return CatalogErrors.NotFound;
            }

            brand = existing;
            brand.Update(name, request.IsActive);
        }
        else
        {
            brand = new Brand(name);
            db.Set<Brand>().Add(brand);
        }

        await db.SaveChangesAsync(ct);
        return brand.Id;
    }
}

// ── Price list ──────────────────────────────────────────────────────────────

public sealed record SavePriceListItemRequest(Guid CategoryId, Guid? IssueTypeId, string ItemName, decimal PriceMin, decimal PriceMax, bool IsActive = true);

internal sealed class SavePriceListItemRequestValidator : AbstractValidator<SavePriceListItemRequest>
{
    public SavePriceListItemRequestValidator()
    {
        RuleFor(r => r.CategoryId).NotEmpty();
        RuleFor(r => r.ItemName).NotEmpty().MaximumLength(160);
        RuleFor(r => r.PriceMin).GreaterThanOrEqualTo(0);
        RuleFor(r => r.PriceMax).GreaterThanOrEqualTo(r => r.PriceMin).WithMessage("Maximum price can't be below the minimum.");
    }
}

public sealed class ListPriceList(DbContext db) : IUseCase
{
    public async Task<IReadOnlyList<PriceListItemResponse>> HandleAsync(Guid? categoryId, CancellationToken ct) =>
        await db.Set<PriceListItem>().AsNoTracking()
            .Where(p => categoryId == null || p.CategoryId == categoryId)
            .OrderBy(p => p.ItemName)
            .Select(p => new PriceListItemResponse(p.Id, p.CategoryId, p.IssueTypeId, p.ItemName, p.PriceMin, p.PriceMax, p.IsActive))
            .ToListAsync(ct);
}

public sealed class SavePriceListItem(DbContext db) : IUseCase
{
    public async Task<Result<Guid>> HandleAsync(Guid? itemId, SavePriceListItemRequest request, CancellationToken ct)
    {
        if (!await db.Set<ServiceCategory>().AnyAsync(c => c.Id == request.CategoryId, ct))
        {
            return CatalogErrors.CategoryNotFound;
        }

        PriceListItem item;
        if (itemId is { } id)
        {
            var existing = await db.Set<PriceListItem>().FirstOrDefaultAsync(p => p.Id == id, ct);
            if (existing is null)
            {
                return CatalogErrors.NotFound;
            }

            item = existing;
            item.Update(request.IssueTypeId, request.ItemName, request.PriceMin, request.PriceMax, request.IsActive);
        }
        else
        {
            item = new PriceListItem(request.CategoryId, request.IssueTypeId, request.ItemName, request.PriceMin, request.PriceMax);
            db.Set<PriceListItem>().Add(item);
        }

        await db.SaveChangesAsync(ct);
        return item.Id;
    }
}

// ── Service areas ───────────────────────────────────────────────────────────

public sealed record SaveServiceAreaRequest(string Name, IReadOnlyList<string> Pincodes, bool IsActive = true);

internal sealed class SaveServiceAreaRequestValidator : AbstractValidator<SaveServiceAreaRequest>
{
    public SaveServiceAreaRequestValidator()
    {
        RuleFor(r => r.Name).NotEmpty().MaximumLength(120);
        RuleFor(r => r.Pincodes).NotEmpty().WithMessage("Add at least one pincode.");
        RuleForEach(r => r.Pincodes).Matches("^[1-9][0-9]{5}$").WithMessage("Pincodes are 6 digits.");
    }
}

public sealed class ListServiceAreas(DbContext db) : IUseCase
{
    public async Task<IReadOnlyList<ServiceAreaResponse>> HandleAsync(CancellationToken ct) =>
        await db.Set<ServiceArea>().AsNoTracking().OrderBy(a => a.Name)
            .Select(a => new ServiceAreaResponse(a.Id, a.Name, a.Pincodes, a.IsActive))
            .ToListAsync(ct);
}

public sealed class SaveServiceArea(DbContext db) : IUseCase
{
    public async Task<Result<Guid>> HandleAsync(Guid? areaId, SaveServiceAreaRequest request, CancellationToken ct)
    {
        ServiceArea area;
        if (areaId is { } id)
        {
            var existing = await db.Set<ServiceArea>().FirstOrDefaultAsync(a => a.Id == id, ct);
            if (existing is null)
            {
                return CatalogErrors.NotFound;
            }

            area = existing;
            area.Update(request.Name, request.Pincodes, request.IsActive);
        }
        else
        {
            area = new ServiceArea(request.Name, request.Pincodes);
            db.Set<ServiceArea>().Add(area);
        }

        await db.SaveChangesAsync(ct);
        return area.Id;
    }
}

/// <summary>Is a pincode served? Used by booking forms before asking for more details.</summary>
public sealed class CheckServiceability(DbContext db) : IUseCase
{
    public async Task<ServiceabilityResponse> HandleAsync(string pincode, CancellationToken ct)
    {
        var areas = await db.Set<ServiceArea>().AsNoTracking()
            .Where(a => a.IsActive && a.Pincodes.Contains(pincode))
            .Select(a => a.Name)
            .ToListAsync(ct);
        return new ServiceabilityResponse(pincode, areas.Count > 0, areas);
    }
}

public sealed record ServiceabilityResponse(string Pincode, bool IsServiceable, IReadOnlyList<string> Areas);
