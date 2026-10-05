using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using ServicePro.BuildingBlocks.Modules;
using ServicePro.BuildingBlocks.Security;
using ServicePro.BuildingBlocks.Web;
using ServicePro.Contracts.Ports;
using ServicePro.Modules.Catalog.Application;
using ServicePro.Modules.Catalog.Infrastructure;

namespace ServicePro.Modules.Catalog;

public sealed class CatalogModule : IModule
{
    public string Name => "Catalog";

    public void Register(IServiceCollection services, IConfiguration configuration) =>
        services.AddScoped<ICatalogDirectory, CatalogDirectory>();

    public void MapEndpoints(IEndpointRouteBuilder endpoints)
    {
        // Public: what we fix and where (customer site, technician app).
        var catalog = endpoints.MapGroup("/api/v1/catalog").WithTags("Catalog");

        catalog.MapGet("/categories", async (GetCatalog useCase, CancellationToken ct) =>
                Results.Ok(await useCase.HandleAsync(activeOnly: true, ct)))
            .AllowAnonymous()
            .Produces<IReadOnlyList<CategoryResponse>>()
            .WithName("GetActiveCatalog");

        catalog.MapGet("/serviceability/{pincode}", async (string pincode, CheckServiceability useCase, CancellationToken ct) =>
                Results.Ok(await useCase.HandleAsync(pincode, ct)))
            .AllowAnonymous()
            .RequireRateLimiting(RateLimitPolicies.Public)
            .Produces<ServiceabilityResponse>()
            .WithName("CheckServiceability");

        catalog.MapGet("/price-list", async (Guid? categoryId, ListPriceList useCase, CancellationToken ct) =>
                Results.Ok(await useCase.HandleAsync(categoryId, ct)))
            .RequireAuthorization()
            .Produces<IReadOnlyList<PriceListItemResponse>>()
            .WithName("GetPriceList");

        catalog.MapGet("/brands", async (ListBrands useCase, CancellationToken ct) => Results.Ok(await useCase.HandleAsync(ct)))
            .RequireAuthorization()
            .Produces<IReadOnlyList<BrandResponse>>()
            .WithName("ListBrands");

        catalog.MapGet("/service-areas", async (ListServiceAreas useCase, CancellationToken ct) => Results.Ok(await useCase.HandleAsync(ct)))
            .RequireAuthorization(AuthPolicies.Staff)
            .Produces<IReadOnlyList<ServiceAreaResponse>>()
            .WithName("ListServiceAreas");

        // Admin: maintain the catalog.
        var admin = endpoints.MapGroup("/api/v1/admin/catalog").WithTags("Catalog admin").RequireAuthorization(AuthPolicies.Admin);

        admin.MapGet("/categories", async (GetCatalog useCase, CancellationToken ct) =>
                Results.Ok(await useCase.HandleAsync(activeOnly: false, ct)))
            .Produces<IReadOnlyList<CategoryResponse>>()
            .WithName("GetFullCatalog");

        MapSave<SaveCategoryRequest, SaveCategory>(admin, "/categories", "Category",
            (useCase, id, request, ct) => useCase.HandleAsync(id, request, ct));
        MapSave<SaveIssueTypeRequest, SaveIssueType>(admin, "/issue-types", "IssueType",
            (useCase, id, request, ct) => useCase.HandleAsync(id, request, ct));
        MapSave<SaveBrandRequest, SaveBrand>(admin, "/brands", "Brand",
            (useCase, id, request, ct) => useCase.HandleAsync(id, request, ct));
        MapSave<SavePriceListItemRequest, SavePriceListItem>(admin, "/price-list", "PriceListItem",
            (useCase, id, request, ct) => useCase.HandleAsync(id, request, ct));
        MapSave<SaveServiceAreaRequest, SaveServiceArea>(admin, "/service-areas", "ServiceArea",
            (useCase, id, request, ct) => useCase.HandleAsync(id, request, ct));
    }

    /// <summary>POST (create) + PUT /{id} (update) for a catalog entity sharing one save use case.</summary>
    private static void MapSave<TRequest, TUseCase>(
        RouteGroupBuilder group,
        string path,
        string entityName,
        Func<TUseCase, Guid?, TRequest, CancellationToken, Task<SharedKernel.Results.Result<Guid>>> save)
        where TRequest : class
        where TUseCase : notnull
    {
        group.MapPost(path, async (TRequest request, TUseCase useCase, CancellationToken ct) =>
                (await save(useCase, null, request, ct)).ToIdResponse())
            .Validate<TRequest>()
            .Produces<IdResponse>()
            .WithStandardErrors()
            .WithName($"Create{entityName}");

        group.MapPut($"{path}/{{id:guid}}", async (Guid id, TRequest request, TUseCase useCase, CancellationToken ct) =>
                (await save(useCase, id, request, ct)).ToIdResponse())
            .Validate<TRequest>()
            .Produces<IdResponse>()
            .WithStandardErrors()
            .WithName($"Update{entityName}");
    }
}
