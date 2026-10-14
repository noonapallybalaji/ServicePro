using System.Reflection;
using ServicePro.BuildingBlocks.Modules;
using ServicePro.Modules.Billing;
using ServicePro.Modules.Catalog;
using ServicePro.Modules.Customers;
using ServicePro.Modules.Dispatch;
using ServicePro.Modules.Identity;
using ServicePro.Modules.Notifications;
using ServicePro.Modules.ServiceRequests;
using ServicePro.Modules.Support;
using ServicePro.Modules.Technicians;

namespace ServicePro.Infrastructure;

/// <summary>The single list of business modules. Adding a module = one line here (ADR 0001).</summary>
public static class ModuleCatalog
{
    public static IReadOnlyList<IModule> All { get; } =
    [
        new IdentityModule(),
        new CatalogModule(),
        new CustomersModule(),
        new TechniciansModule(),
        new ServiceRequestsModule(),
        new DispatchModule(),
        new NotificationsModule(),
        new BillingModule(),
        new SupportModule(),
    ];

    /// <summary>Assemblies whose EF configurations make up the model.</summary>
    public static IReadOnlyList<Assembly> ModelAssemblies { get; } =
        [typeof(BuildingBlocks.DependencyInjection).Assembly, .. All.Select(m => m.Assembly)];
}
