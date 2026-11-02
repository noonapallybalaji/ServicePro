using System.Net;
using System.Net.Http.Json;
using ServicePro.BuildingBlocks.Web;
using ServicePro.Contracts.Ports;
using ServicePro.IntegrationTests.Infrastructure;
using ServicePro.Modules.Identity.Application;

namespace ServicePro.IntegrationTests;

/// <summary>The customer phone app keeps its refresh token in secure storage (body); the website uses the cookie.</summary>
public sealed class CustomerAppSessionTests(ApiFactory factory)
{
    private const string Auth = "/api/v1/customer-auth";

    /// <summary>The phone number of a new customer (sign-in is for people who have booked).</summary>
    private async Task<string> CustomerPhoneAsync()
    {
        var (customer, _) = await (await new TestApi(factory).AsOwnerAsync()).NewAcJobAsync();
        return customer.PrimaryPhone;
    }

    private HttpClient NoCookies() => factory.CreateClient(new() { BaseAddress = new Uri("https://localhost"), HandleCookies = false });

    private static HttpRequestMessage Post(string path, object body, bool native = true)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, path) { Content = JsonContent.Create(body, options: TestApi.Json) };
        if (native) request.Headers.Add(NativeApps.ClientHeader, NativeApps.ClientValue);
        return request;
    }

    private static async Task<HttpResponseMessage> SignInAsync(HttpClient client, string phone, bool native = true)
    {
        var code = await (await client.SendAsync(Post($"{Auth}/code", new CustomerCodeRequest(phone), native)))
            .Content.ReadFromJsonAsync<OtpRequestedResponse>(TestApi.Json);
        return await client.SendAsync(Post($"{Auth}/verify", new CustomerVerifyRequest(phone, code!.DevelopmentCode!, true), native));
    }

    [Fact]
    public async Task The_app_gets_its_refresh_token_in_the_body_and_it_rotates()
    {
        using var client = NoCookies();
        var response = await SignInAsync(client, await CustomerPhoneAsync());
        response.EnsureSuccessStatusCode();
        response.Headers.Contains("Set-Cookie").ShouldBeFalse();
        var first = (await response.Content.ReadFromJsonAsync<CustomerSessionResponse>(TestApi.Json))!;
        first.RefreshToken.ShouldNotBeNullOrEmpty();

        var refreshed = await client.SendAsync(Post($"{Auth}/refresh", new NativeRefreshRequest(first.RefreshToken)));
        refreshed.StatusCode.ShouldBe(HttpStatusCode.OK);
        var second = (await refreshed.Content.ReadFromJsonAsync<CustomerSessionResponse>(TestApi.Json))!;
        second.RefreshToken.ShouldNotBe(first.RefreshToken);

        // Signing out of the app revokes the token it holds.
        (await client.SendAsync(Post($"{Auth}/logout", new NativeRefreshRequest(second.RefreshToken)))).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        (await client.SendAsync(Post($"{Auth}/refresh", new NativeRefreshRequest(second.RefreshToken)))).StatusCode.ShouldBe(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task The_website_keeps_the_cookie_and_never_sees_the_token()
    {
        using var client = NoCookies();
        var response = await SignInAsync(client, await CustomerPhoneAsync(), native: false);
        response.EnsureSuccessStatusCode();

        response.Headers.GetValues("Set-Cookie").ShouldContain(c => c.StartsWith("sp_customer=", StringComparison.Ordinal));
        (await response.Content.ReadFromJsonAsync<CustomerSessionResponse>(TestApi.Json))!.RefreshToken.ShouldBeNull();
    }
}
