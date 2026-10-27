using ServicePro.Modules.Notifications.Channels;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using ServicePro.BuildingBlocks.Messaging;
using ServicePro.Modules.Billing.Application;
using ServicePro.Modules.Catalog.Application;
using ServicePro.Modules.Dispatch.Application;
using ServicePro.SharedKernel.Abstractions;
using Testcontainers.PostgreSql;

[assembly: AssemblyFixture(typeof(ServicePro.IntegrationTests.Infrastructure.ApiFactory))]

namespace ServicePro.IntegrationTests.Infrastructure;

/// <summary>Controllable time for workers (offer expiry). Tokens keep using real time.</summary>
public sealed class TestClock : IClock
{
    private TimeSpan _offset;

    public DateTimeOffset UtcNow => DateTimeOffset.UtcNow + _offset;

    public IDisposable TravelForward(TimeSpan by)
    {
        _offset += by;
        return new Restore(() => _offset -= by);
    }

    private sealed class Restore(Action action) : IDisposable
    {
        public void Dispose() => action();
    }
}

/// <summary>
/// The real API on a real PostgreSQL (Testcontainers), migrated and seeded like Development.
/// Background workers are off; tests drive the outbox and offer expiry explicitly so every
/// assertion is deterministic.
/// </summary>
public sealed class ApiFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    public const string OwnerEmail = "owner@test.local";
    public const string OwnerPassword = "Integration!2026";

    /// <summary>The n8n integration key used by the tests; only its hash is configured, as in production.</summary>
    public const string IntegrationKey = "sp_n8n_integration-test-key-0123456789abcdefghij";

    private readonly PostgreSqlContainer _database = new PostgreSqlBuilder("postgres:17-alpine")
        .WithDatabase("servicepro_tests")
        .Build();

    public TestClock Clock { get; } = new();

    public async ValueTask InitializeAsync()
    {
        await _database.StartAsync();
        _ = Services; // build the host: migrates and seeds
    }

    public new async ValueTask DisposeAsync()
    {
        await base.DisposeAsync();
        await _database.DisposeAsync();
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.UseSetting("ConnectionStrings:Database", _database.GetConnectionString());
        builder.UseSetting("Auth:SigningKey", "integration-test-signing-key-0123456789abcdef");
        builder.UseSetting("Auth:ExposeOtpInResponse", "true");
        builder.UseSetting("Auth:OtpCooldownSeconds", "0");
        builder.UseSetting("Database:MigrateOnStartup", "true");
        builder.UseSetting("Database:SeedDemoData", "true");
        builder.UseSetting("Seed:OwnerEmail", OwnerEmail);
        builder.UseSetting("Seed:OwnerPassword", OwnerPassword);
        builder.UseSetting("Outbox:Enabled", "false");
        builder.UseSetting("Security:ExposureGuard", "false"); // tests deliberately use echoed OTPs and a seeded password
        builder.UseSetting("Dispatch:OfferExpiryWorker", "false");
        builder.UseSetting("Feedback:RequestWorker", "false");
        builder.UseSetting("RateLimits:AuthPerMinute", "10000");
        builder.UseSetting("RateLimits:PublicPerMinute", "10000");
        builder.UseSetting("RateLimits:IntegrationPerMinute", "10000");
        builder.UseSetting("Integrations:Keys:n8n", ServicePro.BuildingBlocks.Security.SecureTokens.Hash(IntegrationKey));
        builder.UseSetting("Notifications:PublicSiteUrl", "https://track.test");
        builder.UseSetting("Geocoding:Provider", "None"); // the fake below answers instead of OpenStreetMap
        builder.UseSetting("Realtime:AllowedOrigins", "https://track.test, https://tech.test/");
        builder.UseSetting("Payments:Razorpay:WebhookSecret", WebhookSecret);
        builder.UseSetting("Storage:Local:RootPath", Path.Combine(Path.GetTempPath(), "servicepro-tests", Guid.NewGuid().ToString("N")));

        builder.ConfigureTestServices(services =>
        {
            services.RemoveAll<IClock>();
            services.AddSingleton<IClock>(Clock);
            services.RemoveAll<IPaymentGateway>();
            services.AddSingleton<IPaymentGateway>(Payments);
            services.RemoveAll<IReverseGeocoder>();
            services.AddSingleton<IReverseGeocoder>(Geocoder);

            // Channels: the bell, a WhatsApp that can be told to fail per number, and a working SMS.
            services.RemoveAll<INotificationChannel>();
            services.AddScoped<INotificationChannel, InAppChannel>();
            services.AddScoped<INotificationChannel, FakeWhatsApp>();
            services.AddScoped<INotificationChannel, FakeSms>();
        });
    }

    public const string WebhookSecret = "integration-test-webhook-secret";

    public FakePaymentGateway Payments { get; } = new();

    public FakeGeocoder Geocoder { get; } = new();

    /// <summary>HTTPS so the Secure refresh cookie is sent back.</summary>
    public HttpClient CreateApiClient() =>
        CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost"), HandleCookies = true });

    private readonly SemaphoreSlim _drain = new(1, 1);

    /// <summary>
    /// Delivers everything in the outbox (notifications, duty automation, counters). Drains run one
    /// at a time: otherwise a parallel test's drain can lease this test's events, and this drain
    /// would return before they are handled.
    /// </summary>
    public async Task DrainOutboxAsync()
    {
        await _drain.WaitAsync();
        try
        {
            var processor = Services.GetRequiredService<OutboxProcessor>();
            for (var i = 0; i < 20 && await processor.ProcessBatchAsync(CancellationToken.None) > 0; i++)
            {
            }
        }
        finally
        {
            _drain.Release();
        }
    }

    public Task<int> SendFeedbackRequestsAsync() =>
        Services.GetRequiredService<ServicePro.Modules.ServiceRequests.Application.FeedbackRequestWorker>().SendDueRequestsAsync(CancellationToken.None);

    public Task<int> ExpireOffersAsync() =>
        Services.GetRequiredService<OfferExpiryWorker>().ExpireDueOffersAsync(CancellationToken.None);
}

/// <summary>
/// Tests that move <see cref="TestClock"/> forward. The clock is shared, so they run on their own,
/// after the parallel tests: otherwise sessions and offers created meanwhile get future times.
/// </summary>
[CollectionDefinition(Name, DisableParallelization = true)]
public sealed class TimeTravelCollection
{
    public const string Name = "Time travel";
}
