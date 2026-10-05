using FluentValidation;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using ServicePro.SharedKernel.Results;

namespace ServicePro.BuildingBlocks.Web;

/// <summary>Maps business results to HTTP. Errors become RFC 7807 problem details with a stable `code`.</summary>
public static class ResultHttpExtensions
{
    public static IResult ToProblem(this Error error)
    {
        var status = error.Type switch
        {
            ErrorType.Validation => StatusCodes.Status400BadRequest,
            ErrorType.NotFound => StatusCodes.Status404NotFound,
            ErrorType.Conflict => StatusCodes.Status409Conflict,
            ErrorType.Unauthorized => StatusCodes.Status401Unauthorized,
            ErrorType.Forbidden => StatusCodes.Status403Forbidden,
            _ => StatusCodes.Status422UnprocessableEntity,
        };

        return Results.Problem(
            statusCode: status,
            title: error.Message,
            extensions: new Dictionary<string, object?> { ["code"] = error.Code });
    }

    public static IResult ToHttp(this Result result) =>
        result.IsSuccess ? Results.NoContent() : result.Error!.ToProblem();

    public static IResult ToHttp<T>(this Result<T> result) =>
        result.IsSuccess ? Results.Ok(result.Value) : result.Error!.ToProblem();

    public static IResult ToCreated<T>(this Result<T> result, Func<T, string> location) =>
        result.IsSuccess ? Results.Created(location(result.Value), result.Value) : result.Error!.ToProblem();
}

/// <summary>Runs the FluentValidation validator for <typeparamref name="T"/> before the handler.</summary>
public sealed class ValidationFilter<T> : IEndpointFilter
    where T : class
{
    public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        var validator = context.HttpContext.RequestServices.GetService<IValidator<T>>();
        var argument = context.Arguments.OfType<T>().FirstOrDefault();

        if (validator is null || argument is null)
        {
            return await next(context);
        }

        var result = await validator.ValidateAsync(argument, context.HttpContext.RequestAborted);
        if (result.IsValid)
        {
            return await next(context);
        }

        var errors = result.Errors
            .GroupBy(e => JsonPropertyName(e.PropertyName))
            .ToDictionary(g => g.Key, g => g.Select(e => e.ErrorMessage).Distinct().ToArray());
        return Results.ValidationProblem(errors, title: "Some details need fixing.");
    }

    private static string JsonPropertyName(string propertyPath) =>
        string.Join('.', propertyPath.Split('.').Select(part => part.Length == 0 ? part : char.ToLowerInvariant(part[0]) + part[1..]));
}

/// <summary>Response for commands that create or update something addressable.</summary>
public sealed record IdResponse(Guid Id);

public static class IdResultExtensions
{
    public static IResult ToIdResponse(this Result<Guid> result) =>
        result.IsSuccess ? Results.Ok(new IdResponse(result.Value)) : result.Error!.ToProblem();
}

public static class RateLimitPolicies
{
    /// <summary>Token-issuing endpoints (login, OTP): per-IP fixed window.</summary>
    public const string Auth = "auth";

    /// <summary>Public, unauthenticated endpoints (tracking page).</summary>
    public const string Public = "public";
}

public static class EndpointConventions
{
    /// <summary>Validate the request body with its registered validator.</summary>
    public static RouteHandlerBuilder Validate<T>(this RouteHandlerBuilder builder)
        where T : class =>
        builder.AddEndpointFilter<ValidationFilter<T>>().ProducesValidationProblem();

    /// <summary>Standard error responses every endpoint may return.</summary>
    public static RouteHandlerBuilder WithStandardErrors(this RouteHandlerBuilder builder) =>
        builder
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status409Conflict)
            .ProducesProblem(StatusCodes.Status422UnprocessableEntity);
}
