using ServicePro.BuildingBlocks.Persistence;
using ServicePro.Contracts;
using ServicePro.SharedKernel.Domain;

namespace ServicePro.Modules.Catalog.Domain;

/// <summary>An appliance category: AC, TV, refrigerator… (PLAN.md §7.5 `service_categories`).</summary>
public sealed class ServiceCategory : TenantOwnedAggregateRoot, IAudited
{
    private ServiceCategory()
    {
    }

    public ServiceCategory(string code, string name, decimal baseVisitCharge, bool requiresPhotos, int sortOrder)
    {
        Code = NormalizeCode(code);
        Update(name, baseVisitCharge, requiresPhotos, sortOrder, isActive: true);
    }

    public string Code { get; private set; } = string.Empty;

    public string Name { get; private set; } = string.Empty;

    public decimal BaseVisitCharge { get; private set; }

    public bool RequiresPhotos { get; private set; }

    public int SortOrder { get; private set; }

    public bool IsActive { get; private set; }

    public void Update(string name, decimal baseVisitCharge, bool requiresPhotos, int sortOrder, bool isActive)
    {
        Name = name.Trim();
        BaseVisitCharge = baseVisitCharge;
        RequiresPhotos = requiresPhotos;
        SortOrder = sortOrder;
        IsActive = isActive;
    }

    public static string NormalizeCode(string code) => code.Trim().ToUpperInvariant().Replace(' ', '_');
}

/// <summary>A common problem for a category, e.g. NOT_COOLING (PLAN.md §7.5 `issue_types`).</summary>
public sealed class IssueType : TenantOwnedEntity, IAudited
{
    private IssueType()
    {
    }

    public IssueType(Guid categoryId, string code, string name, int typicalDurationMinutes, int minSkillLevel, Priority defaultPriority)
    {
        CategoryId = categoryId;
        Code = ServiceCategory.NormalizeCode(code);
        Update(name, typicalDurationMinutes, minSkillLevel, defaultPriority, isActive: true);
    }

    public Guid CategoryId { get; private set; }

    public string Code { get; private set; } = string.Empty;

    public string Name { get; private set; } = string.Empty;

    public int TypicalDurationMinutes { get; private set; }

    public int MinSkillLevel { get; private set; }

    public Priority DefaultPriority { get; private set; }

    public bool IsActive { get; private set; }

    public void Update(string name, int typicalDurationMinutes, int minSkillLevel, Priority defaultPriority, bool isActive)
    {
        Name = name.Trim();
        TypicalDurationMinutes = typicalDurationMinutes;
        MinSkillLevel = minSkillLevel;
        DefaultPriority = defaultPriority;
        IsActive = isActive;
    }
}

public sealed class Brand : TenantOwnedEntity
{
    private Brand()
    {
    }

    public Brand(string name)
    {
        Name = name.Trim();
        IsActive = true;
    }

    public string Name { get; private set; } = string.Empty;

    public bool IsActive { get; private set; }

    public void Update(string name, bool isActive)
    {
        Name = name.Trim();
        IsActive = isActive;
    }
}

/// <summary>Standard prices technicians quote from (PLAN.md §7.5 `price_list`).</summary>
public sealed class PriceListItem : TenantOwnedEntity, IAudited
{
    private PriceListItem()
    {
    }

    public PriceListItem(Guid categoryId, Guid? issueTypeId, string itemName, decimal priceMin, decimal priceMax)
    {
        CategoryId = categoryId;
        Update(issueTypeId, itemName, priceMin, priceMax, isActive: true);
    }

    public Guid CategoryId { get; private set; }

    public Guid? IssueTypeId { get; private set; }

    public string ItemName { get; private set; } = string.Empty;

    public decimal PriceMin { get; private set; }

    public decimal PriceMax { get; private set; }

    public bool IsActive { get; private set; }

    public void Update(Guid? issueTypeId, string itemName, decimal priceMin, decimal priceMax, bool isActive)
    {
        IssueTypeId = issueTypeId;
        ItemName = itemName.Trim();
        PriceMin = priceMin;
        PriceMax = priceMax;
        IsActive = isActive;
    }
}

/// <summary>A named group of pincodes technicians cover (PLAN.md §7.5 `service_areas`).</summary>
public sealed class ServiceArea : TenantOwnedEntity, IAudited
{
    private ServiceArea()
    {
    }

    public ServiceArea(string name, IEnumerable<string> pincodes)
    {
        Update(name, pincodes, isActive: true);
    }

    public string Name { get; private set; } = string.Empty;

    public string[] Pincodes { get; private set; } = [];

    public bool IsActive { get; private set; }

    public void Update(string name, IEnumerable<string> pincodes, bool isActive)
    {
        Name = name.Trim();
        Pincodes = [.. pincodes.Select(p => p.Trim()).Where(p => p.Length > 0).Distinct().Order(StringComparer.Ordinal)];
        IsActive = isActive;
    }
}
