using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using ServicePro.BuildingBlocks.Security;
using ServicePro.BuildingBlocks.Web;
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

        auth.MapPost("/refresh", async (RefreshSession useCase, HttpContext http, CancellationToken ct) =>
                IssueSession(await useCase.HandleAsync(http.Request.Cookies[RefreshCookie], ct), http))
            .RequireRateLimiting(RateLimitPolicies.Auth)
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
