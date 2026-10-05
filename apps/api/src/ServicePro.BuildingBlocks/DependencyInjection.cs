using System.Reflection;
using FluentValidation;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using ServicePro.BuildingBlocks.Application;
using ServicePro.BuildingBlocks.Messaging;
using ServicePro.BuildingBlocks.Persistence;
using ServicePro.BuildingBlocks.Security;
using ServicePro.BuildingBlocks.Settings;
using ServicePro.BuildingBlocks.Storage;
using ServicePro.SharedKernel.Abstractions;

namespace ServicePro.BuildingBlocks;

public static class DependencyInjection
{
    public static IServiceCollection AddBuildingBlocks(this IServiceCollection services, IConfiguration configuration, EventHandlerRegistry registry)
    {
        services.AddHttpContextAccessor();
        services.AddSingleton(registry);
        services.AddSingleton<IClock, SystemClock>();

        services.Configure<TenancyOptions>(configuration.GetSection("Tenancy"));
        services.AddScoped<TenantScope>();
        services.AddScoped<ITenantContext>(sp => sp.GetRequiredService<TenantScope>());
        services.AddScoped<ICurrentUser, HttpCurrentUser>();

        services.AddScoped<EntityStampingInterceptor>();
        services.AddScoped<AuditInterceptor>();
        services.AddScoped<OutboxInterceptor>();

        services.AddScoped<ISettingsStore, SettingsStore>();
        services.AddSetting(BusinessSettings.TimeZone);

        services.Configure<LocalFileStorageOptions>(configuration.GetSection("Storage:Local"));
        services.AddSingleton<IFileStorage, LocalFileStorage>();

        services.Configure<OutboxOptions>(configuration.GetSection("Outbox"));
        services.AddSingleton<OutboxProcessor>();
        if (configuration.GetValue("Outbox:Enabled", defaultValue: true))
        {
            services.AddHostedService(sp => sp.GetRequiredService<OutboxProcessor>());
        }

        registry.RegisterEventTypes(typeof(Contracts.Events.ServiceRequestCreated).Assembly);
        return services;
    }

    /// <summary>
    /// Registers a module's use cases, event handlers and validators by convention,
    /// so a new use case or handler needs no registration code.
    /// </summary>
    public static IServiceCollection AddModuleComponents(this IServiceCollection services, Assembly assembly, EventHandlerRegistry registry)
    {
        foreach (var type in assembly.GetTypes().Where(t => t is { IsClass: true, IsAbstract: false }))
        {
            if (typeof(IUseCase).IsAssignableFrom(type))
            {
                services.AddScoped(type);
            }

            if (typeof(IDataSeeder).IsAssignableFrom(type))
            {
                services.AddScoped(typeof(IDataSeeder), type);
            }

            var handlerInterfaces = type.GetInterfaces()
                .Where(i => i.IsGenericType && i.GetGenericTypeDefinition() == typeof(IEventHandler<>));
            foreach (var handlerInterface in handlerInterfaces)
            {
                services.AddScoped(type);
                registry.RegisterHandler(handlerInterface.GetGenericArguments()[0], type);
            }
        }

        services.AddValidatorsFromAssembly(assembly, includeInternalTypes: true);
        return services;
    }

    /// <summary>Declares a configurable setting (shown and editable under Settings).</summary>
    public static IServiceCollection AddSetting<T>(this IServiceCollection services, SettingDefinition<T> definition)
        where T : notnull =>
        services.AddSingleton<ISettingDefinition>(definition);
}
