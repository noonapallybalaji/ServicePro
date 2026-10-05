using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using ServicePro.BuildingBlocks.Security;
using ServicePro.BuildingBlocks.Settings;
using ServicePro.BuildingBlocks.Web;

namespace ServicePro.Api.Hosting;

/// <summary>
/// Owner-editable business rules (PLAN.md §2.5). Every module declares its own settings;
/// this endpoint only lists and updates them, so it never changes when a module adds one.
/// </summary>
internal static class SettingsEndpoints
{
    public static void MapSettingsEndpoints(this IEndpointRouteBuilder app)
    {
        var settings = app.MapGroup("/api/v1/admin/settings").WithTags("Settings").RequireAuthorization(AuthPolicies.Staff);

        settings.MapGet("/", async (ISettingsStore store, CancellationToken ct) => Results.Ok(await store.ListAsync(ct)))
            .Produces<IReadOnlyList<SettingView>>()
            .WithName("ListSettings");

        settings.MapPut("/{key}", async (string key, UpdateSettingRequest request, ISettingsStore store, DbContext db, CancellationToken ct) =>
            {
                var result = await store.SetAsync(key, request.Value, ct);
                if (result.IsFailure)
                {
                    return result.Error!.ToProblem();
                }

                await db.SaveChangesAsync(ct);
                return Results.NoContent();
            })
            .RequireAuthorization(AuthPolicies.Admin)
            .Produces(StatusCodes.Status204NoContent)
            .WithStandardErrors()
            .WithName("UpdateSetting");
    }
}

public sealed record UpdateSettingRequest(JsonElement Value);
