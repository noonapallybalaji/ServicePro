using System.Reflection;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace ServicePro.BuildingBlocks.Modules;

/// <summary>
/// A business module (ADR 0001). The host discovers modules from a single list, so adding
/// a module never requires changing the host's composition code (open/closed).
/// </summary>
public interface IModule
{
    string Name { get; }

    /// <summary>Assembly scanned for EF configurations, validators, use cases and event handlers.</summary>
    Assembly Assembly => GetType().Assembly;

    void Register(IServiceCollection services, IConfiguration configuration);

    void MapEndpoints(IEndpointRouteBuilder endpoints);
}
