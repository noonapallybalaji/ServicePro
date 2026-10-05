using System.Reflection;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using Scalar.AspNetCore;
using Serilog;
using ServicePro.Api.Hosting;
using ServicePro.Api.Realtime;
using ServicePro.BuildingBlocks;
using ServicePro.BuildingBlocks.Messaging;
using ServicePro.BuildingBlocks.Web;
using ServicePro.Infrastructure;
using ServicePro.Infrastructure.Persistence;

var builder = WebApplication.CreateBuilder(args);

// The build composes the app once to write the OpenAPI contract (ADR 0007). That run has no
// database or secrets, so give it inert placeholders and keep background workers off.
var isDocumentGeneration = Assembly.GetEntryAssembly()?.GetName().Name == "GetDocument.Insider";
if (isDocumentGeneration)
{
    builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
    {
        ["Auth:SigningKey"] = "openapi-generation-placeholder-signing-key",
        ["Outbox:Enabled"] = "false",
        ["Dispatch:OfferExpiryWorker"] = "false",
        ["Database:MigrateOnStartup"] = "false",
    });
}

builder.Host.UseSerilog((context, services, logger) =>
{
    logger.ReadFrom.Configuration(context.Configuration)
        .ReadFrom.Services(services)
        .Enrich.FromLogContext()
        .WriteTo.Console();

    // Seq is optional (docker compose --profile observability).
    if (context.Configuration["Seq:ServerUrl"] is { Length: > 0 } seqUrl)
    {
        logger.WriteTo.Seq(seqUrl);
    }
});

// ── Composition: building blocks → persistence → modules (ADR 0001) ──────────
var eventRegistry = new EventHandlerRegistry();
builder.Services.AddBuildingBlocks(builder.Configuration, eventRegistry);
builder.Services.AddInfrastructure(builder.Configuration);
foreach (var module in ModuleCatalog.All)
{
    module.Register(builder.Services, builder.Configuration);
    builder.Services.AddModuleComponents(module.Assembly, eventRegistry);
}

builder.Services.AddModuleComponents(typeof(Program).Assembly, eventRegistry); // realtime handlers

// ── HTTP concerns ────────────────────────────────────────────────────────────
var snakeUpperEnums = new JsonStringEnumConverter(JsonNamingPolicy.SnakeCaseUpper);
builder.Services.ConfigureHttpJsonOptions(o =>
{
    o.SerializerOptions.Converters.Add(snakeUpperEnums);
    // Numbers are numbers: keeps the OpenAPI contract (and the TypeScript client) free of `number | string`.
    o.SerializerOptions.NumberHandling = JsonNumberHandling.Strict;
});
builder.Services.AddSignalR().AddJsonProtocol(o => o.PayloadSerializerOptions.Converters.Add(snakeUpperEnums));

builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<GlobalExceptionHandler>();
builder.Services.AddOpenApi("v1", o => o.AddDocumentTransformer<BearerSecurityTransformer>());

builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.AddPolicy(RateLimitPolicies.Auth, http => RateLimitPartition.GetFixedWindowLimiter(
        http.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = builder.Configuration.GetValue("RateLimits:AuthPerMinute", 20), Window = TimeSpan.FromMinutes(1) }));
    o.AddPolicy(RateLimitPolicies.Public, http => RateLimitPartition.GetFixedWindowLimiter(
        http.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = builder.Configuration.GetValue("RateLimits:PublicPerMinute", 120), Window = TimeSpan.FromMinutes(1) }));
});

builder.Services.AddHealthChecks().AddDbContextCheck<ServiceProDbContext>("database", tags: ["ready"]);

var app = builder.Build();

app.UseExceptionHandler();
app.UseStatusCodePages();
app.UseSerilogRequestLogging();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.MapScalarApiReference("/docs", o => o.WithTitle("ServicePro API"));
}

foreach (var module in ModuleCatalog.All)
{
    module.MapEndpoints(app);
}

app.MapSettingsEndpoints();
app.MapHub<OpsHub>("/hubs/ops");
app.MapHub<TechHub>("/hubs/tech");
app.MapHealthChecks("/health/live", new() { Predicate = _ => false });
app.MapHealthChecks("/health/ready", new() { Predicate = check => check.Tags.Contains("ready") });

// Development: migrate and seed on start.
if (app.Configuration.GetValue("Database:MigrateOnStartup", false))
{
    await using var scope = app.Services.CreateAsyncScope();
    await scope.ServiceProvider.GetRequiredService<DatabaseInitializer>()
        .InitializeAsync(app.Configuration.GetValue("Database:SeedDemoData", false), CancellationToken.None);
}

await app.RunAsync();

/// <summary>Exposed for WebApplicationFactory in integration tests.</summary>
public partial class Program;
