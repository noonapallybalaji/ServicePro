using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using ServicePro.BuildingBlocks.Modules;
using ServicePro.BuildingBlocks.Security;
using ServicePro.BuildingBlocks.Web;
using ServicePro.Contracts.Ports;
using ServicePro.Modules.Customers.Application;
using ServicePro.Modules.Customers.Infrastructure;
using ServicePro.SharedKernel;

namespace ServicePro.Modules.Customers;

public sealed class CustomersModule : IModule
{
    public string Name => "Customers";

    public void Register(IServiceCollection services, IConfiguration configuration)
    {
        services.AddScoped<ICustomerDirectory, CustomerDirectory>();
        services.AddScoped<ICustomerRegistry, CustomerRegistry>();
        services.AddScoped<CustomerEraser>();
        services.Configure<LegalOptions>(configuration.GetSection("Legal"));
    }

    public void MapEndpoints(IEndpointRouteBuilder endpoints)
    {
        // The signed-in customer's own account (customer site).
        var account = endpoints.MapGroup("/api/v1/account").WithTags("Customer account").RequireAuthorization(AuthPolicies.Customer);

        account.MapGet("/", async (GetMyAccount useCase, CancellationToken ct) => (await useCase.HandleAsync(ct)).ToHttp())
            .Produces<AccountResponse>()
            .WithStandardErrors()
            .WithName("GetMyAccount");

        account.MapPut("/", async (UpdateAccountRequest request, UpdateMyAccount useCase, CancellationToken ct) =>
                (await useCase.HandleAsync(request, ct)).ToHttp())
            .Validate<UpdateAccountRequest>()
            .Produces<AccountResponse>()
            .WithStandardErrors()
            .WithName("UpdateMyAccount");

        account.MapPost("/addresses", async (AddAccountAddressRequest request, AddMyAddress useCase, CancellationToken ct) =>
                (await useCase.HandleAsync(request, ct)).ToHttp())
            .Validate<AddAccountAddressRequest>()
            .Produces<AccountResponse>()
            .WithStandardErrors()
            .WithName("AddMyAddress");

        account.MapDelete("/", async (DeleteMyAccount useCase, CancellationToken ct) => (await useCase.HandleAsync(ct)).ToHttp())
            .Produces(StatusCodes.Status204NoContent)
            .WithStandardErrors()
            .WithName("DeleteMyAccount");

        var customers = endpoints.MapGroup("/api/v1/admin/customers").WithTags("Customers").RequireAuthorization(AuthPolicies.Staff);

        customers.MapGet("/", async (string? search, int? page, int? pageSize, SearchCustomers useCase, CancellationToken ct) =>
                Results.Ok(await useCase.HandleAsync(search, new PageRequest(page ?? 1, pageSize ?? 25), ct)))
            .Produces<PagedResult<CustomerListItem>>()
            .WithName("SearchCustomers");

        customers.MapGet("/by-phone/{phone}", async (string phone, FindCustomerByPhone useCase, CancellationToken ct) =>
                (await useCase.HandleAsync(phone, ct)).ToHttp())
            .Produces<CustomerResponse>()
            .WithStandardErrors()
            .WithName("FindCustomerByPhone");

        customers.MapGet("/{customerId:guid}", async (Guid customerId, GetCustomer useCase, CancellationToken ct) =>
                (await useCase.HandleAsync(customerId, ct)).ToHttp())
            .Produces<CustomerResponse>()
            .WithStandardErrors()
            .WithName("GetCustomer");

        customers.MapPost("/", async (CreateCustomerRequest request, CreateCustomer useCase, CancellationToken ct) =>
                (await useCase.HandleAsync(request, ct)).ToCreated(c => $"/api/v1/admin/customers/{c.Id}"))
            .Validate<CreateCustomerRequest>()
            .Produces<CustomerResponse>(StatusCodes.Status201Created)
            .WithStandardErrors()
            .WithName("CreateCustomer");

        customers.MapPut("/{customerId:guid}", async (Guid customerId, UpdateCustomerRequest request, UpdateCustomer useCase, CancellationToken ct) =>
                (await useCase.HandleAsync(customerId, request, ct)).ToHttp())
            .Validate<UpdateCustomerRequest>()
            .Produces<CustomerResponse>()
            .WithStandardErrors()
            .WithName("UpdateCustomer");

        customers.MapPost("/{customerId:guid}/addresses", async (Guid customerId, SaveAddressRequest request, SaveAddress useCase, CancellationToken ct) =>
                (await useCase.HandleAsync(customerId, null, request, ct)).ToHttp())
            .Validate<SaveAddressRequest>()
            .Produces<AddressResponse>()
            .WithStandardErrors()
            .WithName("AddCustomerAddress");

        customers.MapPut("/{customerId:guid}/addresses/{addressId:guid}", async (Guid customerId, Guid addressId, SaveAddressRequest request, SaveAddress useCase, CancellationToken ct) =>
                (await useCase.HandleAsync(customerId, addressId, request, ct)).ToHttp())
            .Validate<SaveAddressRequest>()
            .Produces<AddressResponse>()
            .WithStandardErrors()
            .WithName("UpdateCustomerAddress");

        customers.MapPost("/{customerId:guid}/appliances", async (Guid customerId, ApplianceInput request, SaveAppliance useCase, CancellationToken ct) =>
                (await useCase.HandleAsync(customerId, null, request, ct)).ToHttp())
            .Validate<ApplianceInput>()
            .Produces<ApplianceResponse>()
            .WithStandardErrors()
            .WithName("AddCustomerAppliance");

        customers.MapPut("/{customerId:guid}/appliances/{applianceId:guid}", async (Guid customerId, Guid applianceId, ApplianceInput request, SaveAppliance useCase, CancellationToken ct) =>
                (await useCase.HandleAsync(customerId, applianceId, request, ct)).ToHttp())
            .Validate<ApplianceInput>()
            .Produces<ApplianceResponse>()
            .WithStandardErrors()
            .WithName("UpdateCustomerAppliance");

        customers.MapPost("/import", async (IFormFile file, ImportCustomers useCase, CancellationToken ct) =>
            {
                await using var stream = file.OpenReadStream();
                return Results.Ok(await useCase.HandleAsync(stream, ct));
            })
            .RequireAuthorization(AuthPolicies.Admin)
            .DisableAntiforgery()
            .Produces<ImportCustomersResponse>()
            .WithName("ImportCustomers");

        customers.MapPost("/{customerId:guid}/erase", async (Guid customerId, EraseCustomer useCase, CancellationToken ct) =>
                (await useCase.HandleAsync(customerId, ct)).ToHttp())
            .RequireAuthorization(AuthPolicies.Admin)
            .Produces(StatusCodes.Status204NoContent)
            .WithStandardErrors()
            .WithName("EraseCustomer");
    }
}
