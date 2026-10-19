using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using ServicePro.BuildingBlocks;
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

    public void Register(IServiceCollection services, IConfiguration configuration)
    {
        services.AddScoped<ICatalogDirectory, CatalogDirectory>();
        services.AddSetting(PublicPriceSettings.ShowToCustomers);

        // "Detect my location": position -> PIN code. Provider by configuration (ADR 0009).
        var geocoding = configuration.GetSection(GeocodingOptions.Section).Get<GeocodingOptions>() ?? new GeocodingOptions();
        if (string.Equals(geocoding.Provider, "OpenStreetMap", StringComparison.OrdinalIgnoreCase))
        {
            var userAgent = geocoding.OpenStreetMap.UserAgent
                ?? $"ServicePro/1.0 (+{configuration["Notifications:PublicSiteUrl"] ?? "self-hosted"})";
            services.AddMemoryCache();
            services.AddHttpClient<OpenStreetMapGeocoder>(c =>
            {
                c.BaseAddress = new Uri(geocoding.OpenStreetMap.BaseUrl.TrimEnd('/') + "/");
                c.Timeout = TimeSpan.FromSeconds(8);
                c.DefaultRequestHeaders.UserAgent.ParseAdd(userAgent);
            });
            services.AddScoped<IReverseGeocoder>(sp => sp.GetRequiredService<OpenStreetMapGeocoder>());
        }
        else
        {
            services.AddSingleton<IReverseGeocoder, NullReverseGeocoder>();
        }
    }

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

        // The device's position -> PIN code -> serviceability. Located=false: type the PIN code instead.
        catalog.MapGet("/serviceability/near", async (double latitude, double longitude, LocateServiceability useCase, CancellationToken ct) =>
                latitude is < -90 or > 90 || longitude is < -180 or > 180
                    ? Results.ValidationProblem(new Dictionary<string, string[]> { ["latitude"] = ["Send a valid position."] })
                    : Results.Ok(await useCase.HandleAsync(new LocateRequest(latitude, longitude), ct)))
            .AllowAnonymous()
            .RequireRateLimiting(RateLimitPolicies.Public)
            .Produces<LocatedServiceabilityResponse>()
            .ProducesValidationProblem()
            .WithName("LocateServiceability");

        catalog.MapGet("/price-list", async (Guid? categoryId, ListPriceList useCase, CancellationToken ct) =>
                Results.Ok(await useCase.HandleAsync(categoryId, ct)))
            .RequireAuthorization()
            .Produces<IReadOnlyList<PriceListItemResponse>>()
            .WithName("GetPriceList");

        // Public: typical prices, only when the owner has chosen to show them.
        catalog.MapGet("/public-prices", async (Guid categoryId, GetPublicPrices useCase, CancellationToken ct) =>
                Results.Ok(await useCase.HandleAsync(categoryId, ct)))
            .AllowAnonymous()
            .RequireRateLimiting(RateLimitPolicies.Public)
            .Produces<IReadOnlyList<PublicPriceResponse>>()
            .WithName("GetPublicPrices");

        // Public: brand names are offered as suggestions on the booking form.
        catalog.MapGet("/brands", async (ListBrands useCase, CancellationToken ct) => Results.Ok(await useCase.HandleAsync(ct)))
            .AllowAnonymous()
            .RequireRateLimiting(RateLimitPolicies.Public)
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
