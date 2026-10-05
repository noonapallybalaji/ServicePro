using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;
using ServicePro.BuildingBlocks.Modules;
using ServicePro.BuildingBlocks.Security;
using ServicePro.Contracts.Ports;
using ServicePro.Modules.Identity.Application;
using ServicePro.Modules.Identity.Domain;
using ServicePro.Modules.Identity.Endpoints;
using ServicePro.SharedKernel.Abstractions;

namespace ServicePro.Modules.Identity;

public sealed class IdentityModule : IModule
{
    public string Name => "Identity";

    public void Register(IServiceCollection services, IConfiguration configuration)
    {
        var section = configuration.GetSection(AuthOptions.SectionName);
        services.AddOptions<AuthOptions>()
            .Bind(section)
            .Validate(o => o.SigningKey.Length >= 32, "Auth:SigningKey must be at least 32 characters.")
            .ValidateOnStart();

        services.AddScoped<IPasswordHasher<User>, PasswordHasher<User>>();
        services.AddScoped<SessionIssuer>();
        services.AddScoped<UserAccounts>();
        services.AddScoped<IUserProvisioning>(sp => sp.GetRequiredService<UserAccounts>());

        var options = section.Get<AuthOptions>() ?? new AuthOptions();
        services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(jwt =>
            {
                jwt.MapInboundClaims = false;
                jwt.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidIssuer = options.Issuer,
                    ValidAudience = options.Audience,
                    IssuerSigningKey = options.CreateSigningKey(),
                    NameClaimType = ServiceProClaims.Name,
                    RoleClaimType = ServiceProClaims.Role,
                    ClockSkew = TimeSpan.FromSeconds(30),
                };

                // SignalR sends the token in the query string for WebSocket connections.
                jwt.Events = new JwtBearerEvents
                {
                    OnMessageReceived = context =>
                    {
                        var token = context.Request.Query["access_token"];
                        if (!string.IsNullOrEmpty(token) && context.HttpContext.Request.Path.StartsWithSegments("/hubs"))
                        {
                            context.Token = token;
                        }

                        return Task.CompletedTask;
                    },
                };
            });

        services.AddAuthorizationBuilder()
            .AddPolicy(AuthPolicies.Staff, p => p.RequireRole(
                nameof(UserRole.Owner), nameof(UserRole.Admin), nameof(UserRole.Dispatcher)))
            .AddPolicy(AuthPolicies.Admin, p => p.RequireRole(nameof(UserRole.Owner), nameof(UserRole.Admin)))
            .AddPolicy(AuthPolicies.Technician, p => p.RequireRole(nameof(UserRole.Technician)).RequireClaim(ServiceProClaims.TechnicianId));
    }

    public void MapEndpoints(IEndpointRouteBuilder endpoints) => IdentityEndpoints.Map(endpoints);
}
