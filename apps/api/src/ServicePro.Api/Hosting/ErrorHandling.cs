using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ServicePro.Api.Hosting;

/// <summary>
/// Unexpected failures become RFC 7807 responses without internals. Concurrency conflicts
/// (two people changing the same job) are expected and get a clear 409.
/// </summary>
public sealed partial class GlobalExceptionHandler(IProblemDetailsService problemDetails, ILogger<GlobalExceptionHandler> logger) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext httpContext, Exception exception, CancellationToken cancellationToken)
    {
        var (status, title, code) = exception switch
        {
            DbUpdateConcurrencyException => (StatusCodes.Status409Conflict, "Someone else changed this at the same time. Refresh and try again.", "concurrency_conflict"),
            BadHttpRequestException bad => (bad.StatusCode, "The request couldn't be read.", "bad_request"),
            _ => (StatusCodes.Status500InternalServerError, "Something went wrong on our side. Your data is safe; please try again.", "server_error"),
        };

        if (status >= 500)
        {
            LogUnhandled(exception, httpContext.Request.Path);
        }

        httpContext.Response.StatusCode = status;
        return await problemDetails.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = httpContext,
            Exception = exception,
            ProblemDetails = new ProblemDetails
            {
                Status = status,
                Title = title,
                Extensions = { ["code"] = code, ["traceId"] = httpContext.TraceIdentifier },
            },
        });
    }

    [LoggerMessage(Level = LogLevel.Error, Message = "Unhandled exception on {Path}")]
    private partial void LogUnhandled(Exception exception, string path);
}
