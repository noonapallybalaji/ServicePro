using System.Net;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using ServicePro.BuildingBlocks.Security;
using ServicePro.BuildingBlocks.Web;
using ServicePro.Contracts;
using ServicePro.Modules.ServiceRequests.Application;
using ServicePro.Modules.ServiceRequests.Domain;
using ServicePro.SharedKernel.Abstractions;

namespace ServicePro.UnitTests.Identity;

public sealed class IntegrationSafetyTests
{
    /* ── Client IP behind Cloudflare Tunnel ─────────────────────────────── */

    private static HttpContext Request(string remoteIp, string? cfConnectingIp)
    {
        var http = new DefaultHttpContext();
        http.Connection.RemoteIpAddress = IPAddress.Parse(remoteIp);
        if (cfConnectingIp is not null)
        {
            http.Request.Headers["CF-Connecting-IP"] = cfConnectingIp;
        }

        return http;
    }

    [Fact]
    public void Cloudflare_client_ip_is_used_only_when_the_connection_is_local()
    {
        ClientAddress.For(Request("127.0.0.1", "203.0.113.7")).ShouldBe("203.0.113.7");
        ClientAddress.For(Request("::1", "2001:db8::1")).ShouldBe("2001:db8::1");

        // A remote caller cannot choose its own rate-limit bucket.
        ClientAddress.For(Request("198.51.100.9", "203.0.113.7")).ShouldBe("198.51.100.9");
        // Garbage in the header is ignored.
        ClientAddress.For(Request("127.0.0.1", "not-an-ip")).ShouldBe("127.0.0.1");
    }

    /* ── Integration key ────────────────────────────────────────────────── */

    private const string Key = "n8n-test-key-0123456789abcdefghijklmnopqrstuvwxyz";

    private static async Task<AuthenticateResult> AuthenticateAsync(string? presented)
    {
        var options = new IntegrationKeyOptions();
        options.KeyHashes["n8n"] = SecureTokens.Hash(Key);
        var monitor = new StaticOptionsMonitor(options);
        var handler = new IntegrationKeyHandler(monitor, NullLoggerFactory.Instance, UrlEncoder.Default);

        var http = new DefaultHttpContext();
        http.Connection.RemoteIpAddress = IPAddress.Loopback;
        if (presented is not null)
        {
            http.Request.Headers[IntegrationKeys.Header] = presented;
        }

        await handler.InitializeAsync(new AuthenticationScheme(IntegrationKeys.Scheme, null, typeof(IntegrationKeyHandler)), http);
        return await handler.AuthenticateAsync();
    }

    [Fact]
    public async Task The_configured_integration_key_authenticates_with_the_integration_role_only()
    {
        var result = await AuthenticateAsync(Key);

        result.Succeeded.ShouldBeTrue();
        result.Principal!.IsInRole(IntegrationKeys.Role).ShouldBeTrue();
        result.Principal.IsInRole(nameof(UserRole.Owner)).ShouldBeFalse();
        result.Principal.Identity!.Name.ShouldBe("n8n");
    }

    [Fact]
    public async Task Wrong_short_or_missing_keys_are_rejected()
    {
        (await AuthenticateAsync(Key + "x")).Succeeded.ShouldBeFalse();
        (await AuthenticateAsync("short")).Succeeded.ShouldBeFalse();
        (await AuthenticateAsync(null)).None.ShouldBeTrue();
    }

    private sealed class StaticOptionsMonitor(IntegrationKeyOptions value) : IOptionsMonitor<IntegrationKeyOptions>
    {
        public IntegrationKeyOptions CurrentValue => value;

        public IntegrationKeyOptions Get(string? name) => value;

        public IDisposable? OnChange(Action<IntegrationKeyOptions, string?> listener) => null;
    }

    /* ── Integration booking request ────────────────────────────────────── */

    private static IntegrationBookingRequest Booking(bool confirmed = true, string key = "wamid.HBgMOTE5ODc2NTQzMjEwFQIAEhgg") => new(
        key,
        confirmed,
        Guid.NewGuid(),
        null,
        "AC not cooling",
        "Ravi",
        "919876543210",
        new BookingAddressRequest("Home", "Flat 1", null, null, "Madhapur", "Hyderabad", null, "500081", null, null));

    [Fact]
    public void A_booking_without_explicit_customer_confirmation_is_refused()
    {
        var validator = new IntegrationBookingRequestValidator();

        validator.Validate(Booking()).IsValid.ShouldBeTrue();
        validator.Validate(Booking(confirmed: false)).Errors.ShouldContain(e => e.PropertyName == nameof(IntegrationBookingRequest.CustomerConfirmed));
        validator.Validate(Booking(key: "")).IsValid.ShouldBeFalse();
        validator.Validate(Booking(key: "has spaces")).IsValid.ShouldBeFalse();
    }

    [Fact]
    public void The_idempotency_key_is_stored_on_the_job()
    {
        var request = ServiceRequest.Create(
            new NewServiceRequest("SR-1", Guid.NewGuid(), Guid.NewGuid(), null, Guid.NewGuid(), null, "AC", RequestChannel.WhatsApp, Priority.Normal, 349,
                null, null, null, null, false, null, AwaitsReview: true, ExternalReference: " wamid.1 "),
            new Actor(ActorType.AiAgent, null),
            DateTimeOffset.UtcNow);

        request.ExternalReference.ShouldBe("wamid.1");
        request.Status.ShouldBe(ServiceRequestStatus.New); // a request, not a confirmed appointment
        request.ScheduledStart.ShouldBeNull();
    }
}
