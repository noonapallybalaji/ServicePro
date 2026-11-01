using System.Net;
using System.Net.Http.Json;
using ServicePro.BuildingBlocks.Web;
using ServicePro.IntegrationTests.Infrastructure;
using ServicePro.Modules.Identity.Application;

namespace ServicePro.IntegrationTests;

/// <summary>The phone apps keep the refresh token in secure storage (body), browsers in an HttpOnly cookie.</summary>
public sealed class NativeAppSessionTests(ApiFactory factory)
{
    private static HttpRequestMessage Login(string? origin, bool native = true)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/v1/auth/login")
        {
            Content = JsonContent.Create(new PasswordLoginRequest(ApiFactory.OwnerEmail, ApiFactory.OwnerPassword), options: TestApi.Json),
        };
        if (native) request.Headers.Add(NativeApps.ClientHeader, NativeApps.ClientValue);
        if (origin is not null) request.Headers.Add("Origin", origin);
        return request;
    }

    private static HttpRequestMessage Native(string path, string? refreshToken, string? origin = null)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, path) { Content = JsonContent.Create(new NativeRefreshRequest(refreshToken), options: TestApi.Json) };
        request.Headers.Add(NativeApps.ClientHeader, NativeApps.ClientValue);
        if (origin is not null) request.Headers.Add("Origin", origin);
        return request;
    }

    private HttpClient NoCookies() => factory.CreateClient(new() { BaseAddress = new Uri("https://localhost"), HandleCookies = false });

    [Theory]
    [InlineData(null)] // React Native: no browser origin
    [InlineData("capacitor://localhost")] // Capacitor on iOS
    [InlineData("https://localhost")] // Capacitor on Android
    public async Task A_phone_app_gets_its_refresh_token_in_the_body_and_no_cookie(string? origin)
    {
        using var client = NoCookies();

        var response = await client.SendAsync(Login(origin));
        response.EnsureSuccessStatusCode();
        var session = (await response.Content.ReadFromJsonAsync<AuthSessionResponse>(TestApi.Json))!;

        session.RefreshToken.ShouldNotBeNullOrEmpty();
        session.RefreshExpiresAt.ShouldNotBeNull();
        response.Headers.Contains("Set-Cookie").ShouldBeFalse();
    }

    [Fact]
    public async Task Refresh_tokens_from_the_app_rotate_and_a_replay_ends_the_session()
    {
        using var client = NoCookies();
        var first = (await (await client.SendAsync(Login(null))).Content.ReadFromJsonAsync<AuthSessionResponse>(TestApi.Json))!;

        var refreshed = await client.SendAsync(Native("/api/v1/auth/refresh", first.RefreshToken));
        refreshed.StatusCode.ShouldBe(HttpStatusCode.OK);
        var second = (await refreshed.Content.ReadFromJsonAsync<AuthSessionResponse>(TestApi.Json))!;
        second.RefreshToken.ShouldNotBe(first.RefreshToken);

        // The first token was already used: a replay is treated as theft and ends the chain.
        (await client.SendAsync(Native("/api/v1/auth/refresh", first.RefreshToken))).StatusCode.ShouldBe(HttpStatusCode.Unauthorized);
        (await client.SendAsync(Native("/api/v1/auth/refresh", second.RefreshToken))).StatusCode.ShouldBe(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Signing_out_of_the_app_revokes_its_token()
    {
        using var client = NoCookies();
        var session = (await (await client.SendAsync(Login(null))).Content.ReadFromJsonAsync<AuthSessionResponse>(TestApi.Json))!;

        (await client.SendAsync(Native("/api/v1/auth/logout", session.RefreshToken))).StatusCode.ShouldBe(HttpStatusCode.NoContent);

        (await client.SendAsync(Native("/api/v1/auth/refresh", session.RefreshToken))).StatusCode.ShouldBe(HttpStatusCode.Unauthorized);
    }

    [Theory]
    [InlineData(false, null)] // the website
    [InlineData(true, "https://evil.example")] // a web page pretending to be the app
    public async Task Browsers_never_see_the_refresh_token(bool claimsNative, string? origin)
    {
        using var client = NoCookies();

        var response = await client.SendAsync(Login(origin, claimsNative));
        response.EnsureSuccessStatusCode();
        var session = (await response.Content.ReadFromJsonAsync<AuthSessionResponse>(TestApi.Json))!;

        session.RefreshToken.ShouldBeNull();
        response.Headers.GetValues("Set-Cookie").ShouldContain(c => c.StartsWith("sp_refresh=", StringComparison.Ordinal));
    }

    [Theory]
    [InlineData("https://localhost", true)]
    [InlineData("capacitor://localhost", true)]
    [InlineData("https://evil.example", false)]
    public async Task Only_the_app_origins_may_call_the_api_cross_origin(string origin, bool allowed)
    {
        using var client = NoCookies();
        using var preflight = new HttpRequestMessage(HttpMethod.Options, "/api/v1/auth/login");
        preflight.Headers.Add("Origin", origin);
        preflight.Headers.Add("Access-Control-Request-Method", "POST");
        preflight.Headers.Add("Access-Control-Request-Headers", "content-type,x-servicepro-client,authorization");

        var response = await client.SendAsync(preflight);

        response.Headers.TryGetValues("Access-Control-Allow-Origin", out var allow);
        (allow?.Single() == origin).ShouldBe(allowed);
        response.Headers.Contains("Access-Control-Allow-Credentials").ShouldBeFalse();
    }
}
