using System.Net;
using System.Net.Http.Json;
using ServicePro.IntegrationTests.Infrastructure;
using ServicePro.Modules.Identity.Application;
using ServicePro.SharedKernel.Abstractions;

namespace ServicePro.IntegrationTests;

public sealed class AuthTests(ApiFactory factory)
{
    [Fact]
    public async Task Owner_signs_in_with_email_and_password()
    {
        var api = await new TestApi(factory).AsOwnerAsync();

        var me = await api.GetAsync<MeResponse>("/api/v1/auth/me");

        me.Role.ShouldBe(UserRole.Owner);
        me.Email.ShouldBe(ApiFactory.OwnerEmail);
    }

    [Fact]
    public async Task Wrong_password_is_rejected_without_saying_which_part_was_wrong()
    {
        var api = new TestApi(factory);

        var response = await api.PostRawAsync("/api/v1/auth/login", new PasswordLoginRequest(ApiFactory.OwnerEmail, "wrong-password-1"));

        (await TestApi.ProblemAsync(response)).ShouldBe((HttpStatusCode.Unauthorized, "auth.invalid_credentials"));
    }

    [Fact]
    public async Task Refresh_tokens_rotate_and_a_replayed_token_ends_the_session()
    {
        var api = new TestApi(factory);
        var login = await api.Client.PostAsJsonAsync("/api/v1/auth/login", new PasswordLoginRequest(ApiFactory.OwnerEmail, ApiFactory.OwnerPassword), TestApi.Json);
        login.EnsureSuccessStatusCode();
        var firstCookie = login.Headers.GetValues("Set-Cookie").Single(c => c.StartsWith("sp_refresh=", StringComparison.Ordinal)).Split(';')[0];

        // Normal rotation through the cookie jar.
        (await api.Client.PostAsync("/api/v1/auth/refresh", null)).StatusCode.ShouldBe(HttpStatusCode.OK);

        // Replaying the first (already rotated) token is treated as theft.
        using var attacker = factory.CreateClient(new() { BaseAddress = new Uri("https://localhost"), HandleCookies = false });
        using var replay = new HttpRequestMessage(HttpMethod.Post, "/api/v1/auth/refresh");
        replay.Headers.Add("Cookie", firstCookie);
        (await attacker.SendAsync(replay)).StatusCode.ShouldBe(HttpStatusCode.Unauthorized);

        // …which revokes the whole chain, including the legitimate latest token.
        (await api.Client.PostAsync("/api/v1/auth/refresh", null)).StatusCode.ShouldBe(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Otp_request_does_not_reveal_whether_a_number_is_registered()
    {
        var api = new TestApi(factory);

        var unknown = await api.PostAsync<OtpRequestedResponse>("/api/v1/auth/otp/request", new OtpRequest(TestApi.RandomPhone()));

        unknown.CodeLength.ShouldBe(6);
        unknown.DevelopmentCode.ShouldBeNull();
    }

    [Fact]
    public async Task Technicians_sign_in_with_otp_and_cannot_use_staff_endpoints()
    {
        var owner = await new TestApi(factory).AsOwnerAsync();
        var ravi = await owner.TechnicianAsync("Ravi Kumar");
        var technician = await new TestApi(factory).AsTechnicianAsync(ravi.Phone);

        var me = await technician.GetAsync<MeResponse>("/api/v1/auth/me");
        me.Role.ShouldBe(UserRole.Technician);
        me.TechnicianId.ShouldBe(ravi.Id);

        (await technician.Client.GetAsync("/api/v1/admin/dashboard/summary")).StatusCode.ShouldBe(HttpStatusCode.Forbidden);
        (await owner.Client.GetAsync("/api/v1/tech/jobs")).StatusCode.ShouldBe(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task Anonymous_callers_are_challenged() =>
        (await new TestApi(factory).Client.GetAsync("/api/v1/admin/customers")).StatusCode.ShouldBe(HttpStatusCode.Unauthorized);
}
