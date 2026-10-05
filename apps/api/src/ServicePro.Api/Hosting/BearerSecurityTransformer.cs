using Microsoft.AspNetCore.OpenApi;
using Microsoft.OpenApi;

namespace ServicePro.Api.Hosting;

/// <summary>Documents bearer authentication so API explorers can call protected endpoints.</summary>
internal sealed class BearerSecurityTransformer : IOpenApiDocumentTransformer
{
    public Task TransformAsync(OpenApiDocument document, OpenApiDocumentTransformerContext context, CancellationToken cancellationToken)
    {
        document.Info = new OpenApiInfo
        {
            Title = "ServicePro API",
            Version = "v1",
            Description = "Service management & technician dispatch (PLAN.md).",
        };

        document.Components ??= new OpenApiComponents();
        document.Components.SecuritySchemes ??= new Dictionary<string, IOpenApiSecurityScheme>();
        document.Components.SecuritySchemes["Bearer"] = new OpenApiSecurityScheme
        {
            Type = SecuritySchemeType.Http,
            Scheme = "bearer",
            BearerFormat = "JWT",
            Description = "Access token from /api/v1/auth/login or /api/v1/auth/otp/verify.",
        };
        return Task.CompletedTask;
    }
}
