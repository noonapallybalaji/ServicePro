using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using ServicePro.BuildingBlocks.Security;
using ServicePro.BuildingBlocks.Web;
using ServicePro.Contracts.Ports;
using ServicePro.Modules.Identity.Application;

namespace ServicePro.Modules.Identity.Endpoints;

internal static class IdentityEndpoints
{
    /// <summary>The refresh cookie is scoped to the auth routes only (ADR 0005).</summary>
    private const string RefreshCookie = "sp_refresh";
    private const string AuthPath = "/api/v1/auth";

    public static void Map(IEndpointRouteBuilder app)
    {
        var auth = app.MapGroup(AuthPath).WithTags("Auth");

        auth.MapPost("/login", async (PasswordLoginRequest request, LoginWithPassword useCase, HttpContext http, CancellationToken ct) =>
                IssueSession(await useCase.HandleAsync(request, ct), http))
            .Validate<PasswordLoginRequest>()
            .RequireRateLimiting(RateLimitPolicies.Auth)
            .Produces<AuthSessionResponse>()
            .ProducesProblem(StatusCodes.Status401Unauthorized)
            .WithName("LoginWithPassword");

        auth.MapPost("/otp/request", async (OtpRequest request, RequestLoginOtp useCase, CancellationToken ct) =>
                (await useCase.HandleAsync(request, ct)).ToHttp())
            .RequireRateLimiting(RateLimitPolicies.Auth)
            .Produces<OtpRequestedResponse>()
            .WithStandardErrors()
            .WithName("RequestLoginOtp");

        auth.MapPost("/otp/verify", async (OtpVerifyRequest request, VerifyLoginOtp useCase, HttpContext http, CancellationToken ct) =>
                IssueSession(await useCase.HandleAsync(request, ct), http))
            .Validate<OtpVerifyRequest>()
            .RequireRateLimiting(RateLimitPolicies.Auth)
            .Produces<AuthSessionResponse>()
            .ProducesProblem(StatusCodes.Status401Unauthorized)
            .WithName("VerifyLoginOtp");

        // Runs on every app load, so it gets the looser policy: a whole office shares one IP,
        // and a 256-bit refresh token can't be brute-forced anyway.
        auth.MapPost("/refresh", async (RefreshSession useCase, HttpContext http, CancellationToken ct) =>
                IssueSession(await useCase.HandleAsync(http.Request.Cookies[RefreshCookie], ct), http))
            .RequireRateLimiting(RateLimitPolicies.Public)
            .Produces<AuthSessionResponse>()
            .ProducesProblem(StatusCodes.Status401Unauthorized)
            .WithName("RefreshSession");

        auth.MapPost("/logout", async (Logout useCase, HttpContext http, CancellationToken ct) =>
            {
                await useCase.HandleAsync(http.Request.Cookies[RefreshCookie], ct);
                http.Response.Cookies.Delete(RefreshCookie, CookieOptions(DateTimeOffset.UnixEpoch));
                return Results.NoContent();
            })
            .Produces(StatusCodes.Status204NoContent)
            .WithName("Logout");

        auth.MapGet("/me", async (GetMe useCase, CancellationToken ct) => (await useCase.HandleAsync(ct)).ToHttp())
            .RequireAuthorization()
            .Produces<MeResponse>()
            .WithName("GetMe");

        MapCustomerAuth(app);

        var users = app.MapGroup("/api/v1/admin/users").WithTags("Users").RequireAuthorization(AuthPolicies.Admin);

        users.MapGet("/", async (ListStaffUsers useCase, CancellationToken ct) => Results.Ok(await useCase.HandleAsync(ct)))
            .Produces<IReadOnlyList<UserResponse>>()
            .WithName("ListStaffUsers");

        users.MapPost("/", async (CreateStaffUserRequest request, CreateStaffUser useCase, CancellationToken ct) =>
                (await useCase.HandleAsync(request, ct)).ToCreated(u => $"/api/v1/admin/users/{u.Id}"))
            .Validate<CreateStaffUserRequest>()
            .Produces<UserResponse>(StatusCodes.Status201Created)
            .WithStandardErrors()
            .WithName("CreateStaffUser");

        users.MapPut("/{userId:guid}", async (Guid userId, UpdateStaffUserRequest request, UpdateStaffUser useCase, CancellationToken ct) =>
                (await useCase.HandleAsync(userId, request, ct)).ToHttp())
            .Validate<UpdateStaffUserRequest>()
            .Produces<UserResponse>()
            .WithStandardErrors()
            .WithName("UpdateStaffUser");
    }

    /// <summary>Customer sign-in for "My bookings" (bookings sign customers in automatically).</summary>
    private static void MapCustomerAuth(IEndpointRouteBuilder app)
    {
        var customer = app.MapGroup(CustomerSessionCookie.Path).WithTags("Customer sign-in").AllowAnonymous();

        customer.MapPost("/code", async (CustomerCodeRequest request, RequestCustomerSignInCode useCase, CancellationToken ct) =>
                (await useCase.HandleAsync(request, ct)).ToHttp())
            .Validate<CustomerCodeRequest>()
            .RequireRateLimiting(RateLimitPolicies.Auth)
            .Produces<OtpRequestedResponse>()
            .WithStandardErrors()
            .WithName("RequestCustomerSignInCode");

        customer.MapPost("/verify", async (CustomerVerifyRequest request, VerifyCustomerSignIn useCase, HttpContext http, CancellationToken ct) =>
                IssueCustomerSession(await useCase.HandleAsync(request, ct), http))
            .Validate<CustomerVerifyRequest>()
            .RequireRateLimiting(RateLimitPolicies.Auth)
            .Produces<CustomerSessionResponse>()
            .WithStandardErrors()
            .WithName("VerifyCustomerSignIn");

        customer.MapPost("/refresh", async (RefreshCustomerSession useCase, HttpContext http, CancellationToken ct) =>
                IssueCustomerSession(await useCase.HandleAsync(CustomerSessionCookie.Read(http.Request), ct), http))
            .RequireRateLimiting(RateLimitPolicies.Public)
            .Produces<CustomerSessionResponse>()
            .ProducesProblem(StatusCodes.Status401Unauthorized)
            .WithName("RefreshCustomerSession");

        customer.MapPost("/logout", async (SignOutCustomer useCase, HttpContext http, CancellationToken ct) =>
            {
                await useCase.HandleAsync(CustomerSessionCookie.Read(http.Request), ct);
                CustomerSessionCookie.Delete(http.Response);
                return Results.NoContent();
            })
            .Produces(StatusCodes.Status204NoContent)
            .WithName("SignOutCustomer");
    }

    private static IResult IssueCustomerSession(SharedKernel.Results.Result<IssuedCustomerSession> result, HttpContext http)
    {
        if (result.IsFailure)
        {
            if (result.Error!.Type == SharedKernel.Results.ErrorType.Unauthorized)
            {
                CustomerSessionCookie.Delete(http.Response);
            }

            return result.Error.ToProblem();
        }

        CustomerSessionCookie.Append(http.Response, result.Value.RefreshToken, result.Value.RefreshExpiresAt);
        return Results.Ok(result.Value.Response);
    }

    private static IResult IssueSession(SharedKernel.Results.Result<IssuedSession> result, HttpContext http)
    {
        if (result.IsFailure)
        {
            if (result.Error!.Type == SharedKernel.Results.ErrorType.Unauthorized)
            {
                http.Response.Cookies.Delete(RefreshCookie, CookieOptions(DateTimeOffset.UnixEpoch));
            }

            return result.Error.ToProblem();
        }

        var session = result.Value;
        http.Response.Cookies.Append(RefreshCookie, session.RefreshToken, CookieOptions(session.RefreshExpiresAt));
        return Results.Ok(session.Response);
    }

    private static CookieOptions CookieOptions(DateTimeOffset expires) => new()
    {
        HttpOnly = true,
        Secure = true,
        SameSite = SameSiteMode.Strict,
        Path = AuthPath,
        Expires = expires,
        IsEssential = true,
    };
}
