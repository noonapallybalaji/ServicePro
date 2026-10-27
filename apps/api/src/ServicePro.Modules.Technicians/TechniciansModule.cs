using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using ServicePro.BuildingBlocks.Modules;
using ServicePro.BuildingBlocks.Security;
using ServicePro.BuildingBlocks.Storage;
using ServicePro.BuildingBlocks.Web;
using ServicePro.Contracts.Ports;
using ServicePro.Modules.Technicians.Application;
using ServicePro.Modules.Technicians.Domain;
using ServicePro.Modules.Technicians.Infrastructure;

namespace ServicePro.Modules.Technicians;

public sealed class TechniciansModule : IModule
{
    private static readonly HashSet<string> PhotoTypes = ["image/jpeg", "image/png", "image/webp"];
    private const long MaxPhotoBytes = 5 * 1024 * 1024;

    public string Name => "Technicians";

    public void Register(IServiceCollection services, IConfiguration configuration)
    {
        services.AddScoped<ITechnicianDirectory, TechnicianDirectory>();
        services.AddScoped<ITechnicianPresence, TechnicianPresence>();
    }

    public void MapEndpoints(IEndpointRouteBuilder endpoints)
    {
        MapStaffEndpoints(endpoints);
        MapSelfServiceEndpoints(endpoints);

        // Shown to customers on the tracking page, so it is public.
        endpoints.MapGet("/api/v1/technicians/{technicianId:guid}/photo", async (Guid technicianId, DbContext db, IFileStorage storage, CancellationToken ct) =>
            {
                var key = await db.Set<Technician>().IgnoreQueryFilters()
                    .Where(t => t.Id == technicianId).Select(t => t.PhotoKey).FirstOrDefaultAsync(ct);
                var stream = key is null ? null : await storage.OpenReadAsync(key, ct);
                return stream is null ? Results.NotFound() : Results.File(stream, ContentTypeFor(key!));
            })
            .AllowAnonymous()
            .WithTags("Technicians")
            .Produces(StatusCodes.Status200OK, contentType: "image/jpeg")
            .WithName("GetTechnicianPhoto");
    }

    private static void MapStaffEndpoints(IEndpointRouteBuilder endpoints)
    {
        var staff = endpoints.MapGroup("/api/v1/admin/technicians").WithTags("Technicians").RequireAuthorization(AuthPolicies.Staff);

        staff.MapGet("/", async (bool? includeInactive, ListTechnicians useCase, CancellationToken ct) =>
                Results.Ok(await useCase.HandleAsync(includeInactive ?? false, ct)))
            .Produces<IReadOnlyList<TechnicianListItem>>()
            .WithName("ListTechnicians");

        // Live map: every active technician's status, presence and latest position.
        staff.MapGet("/live", async (ListLiveTechnicians useCase, CancellationToken ct) => Results.Ok(await useCase.HandleAsync(ct)))
            .Produces<IReadOnlyList<TechnicianLiveResponse>>()
            .WithName("ListLiveTechnicians");

        // One day of a technician's activity: duty timeline, hours on duty and the route (date in India time; today by default).
        staff.MapGet("/{technicianId:guid}/activity", async (Guid technicianId, DateOnly? date, GetTechnicianActivityDay useCase, CancellationToken ct) =>
                (await useCase.HandleAsync(technicianId, date, ct)).ToHttp())
            .Produces<TechnicianActivityDayResponse>()
            .WithStandardErrors()
            .WithName("GetTechnicianActivity");

        staff.MapGet("/{technicianId:guid}", async (Guid technicianId, GetTechnician useCase, CancellationToken ct) =>
                (await useCase.HandleAsync(technicianId, ct)).ToHttp())
            .Produces<TechnicianResponse>()
            .WithStandardErrors()
            .WithName("GetTechnician");

        var admin = staff.MapGroup("/").RequireAuthorization(AuthPolicies.Admin);

        admin.MapPost("/", async (CreateTechnicianRequest request, CreateTechnician useCase, CancellationToken ct) =>
                (await useCase.HandleAsync(request, ct)).ToCreated(t => $"/api/v1/admin/technicians/{t.Id}"))
            .Validate<CreateTechnicianRequest>()
            .Produces<TechnicianResponse>(StatusCodes.Status201Created)
            .WithStandardErrors()
            .WithName("CreateTechnician");

        admin.MapPut("/{technicianId:guid}", async (Guid technicianId, UpdateTechnicianRequest request, UpdateTechnician useCase, CancellationToken ct) =>
                (await useCase.HandleAsync(technicianId, request, ct)).ToHttp())
            .Validate<UpdateTechnicianRequest>()
            .Produces<TechnicianResponse>()
            .WithStandardErrors()
            .WithName("UpdateTechnician");

        admin.MapPut("/{technicianId:guid}/skills", async (Guid technicianId, SetSkillsRequest request, ManageTechnicianCapabilities useCase, CancellationToken ct) =>
                (await useCase.SetSkillsAsync(technicianId, request, ct)).ToHttp())
            .Validate<SetSkillsRequest>()
            .Produces<TechnicianResponse>()
            .WithStandardErrors()
            .WithName("SetTechnicianSkills");

        admin.MapPut("/{technicianId:guid}/service-areas", async (Guid technicianId, SetServiceAreasRequest request, ManageTechnicianCapabilities useCase, CancellationToken ct) =>
                (await useCase.SetServiceAreasAsync(technicianId, request, ct)).ToHttp())
            .Produces<TechnicianResponse>()
            .WithStandardErrors()
            .WithName("SetTechnicianServiceAreas");

        admin.MapPut("/{technicianId:guid}/shifts", async (Guid technicianId, SetShiftsRequest request, ManageTechnicianCapabilities useCase, CancellationToken ct) =>
                (await useCase.SetShiftsAsync(technicianId, request, ct)).ToHttp())
            .Produces<TechnicianResponse>()
            .WithStandardErrors()
            .WithName("SetTechnicianShifts");

        staff.MapPut("/{technicianId:guid}/duty-status", async (Guid technicianId, SetDutyStatusRequest request, ManageTechnicianCapabilities useCase, CancellationToken ct) =>
                (await useCase.SetDutyStatusAsync(technicianId, request, ct)).ToHttp())
            .Produces<TechnicianResponse>()
            .WithStandardErrors()
            .WithName("SetTechnicianDutyStatus");

        staff.MapPost("/{technicianId:guid}/time-off", async (Guid technicianId, AddTimeOffRequest request, ManageTechnicianCapabilities useCase, CancellationToken ct) =>
                (await useCase.AddTimeOffAsync(technicianId, request, ct)).ToHttp())
            .Produces<TechnicianResponse>()
            .WithStandardErrors()
            .WithName("AddTechnicianTimeOff");

        staff.MapDelete("/{technicianId:guid}/time-off/{timeOffId:guid}", async (Guid technicianId, Guid timeOffId, ManageTechnicianCapabilities useCase, CancellationToken ct) =>
                (await useCase.RemoveTimeOffAsync(technicianId, timeOffId, ct)).ToHttp())
            .Produces<TechnicianResponse>()
            .WithStandardErrors()
            .WithName("RemoveTechnicianTimeOff");

        admin.MapPost("/{technicianId:guid}/photo", async (Guid technicianId, IFormFile file, DbContext db, IFileStorage storage, CancellationToken ct) =>
            {
                if (!PhotoTypes.Contains(file.ContentType) || file.Length is 0 or > MaxPhotoBytes)
                {
                    return Results.Problem(statusCode: StatusCodes.Status400BadRequest, title: "Upload a JPEG, PNG or WebP photo under 5 MB.");
                }

                var technician = await db.Set<Technician>().FirstOrDefaultAsync(t => t.Id == technicianId, ct);
                if (technician is null)
                {
                    return Results.NotFound();
                }

                await using var stream = file.OpenReadStream();
                technician.SetPhoto(await storage.SaveAsync(stream, "technicians", ExtensionFor(file.ContentType), ct));
                await db.SaveChangesAsync(ct);
                return Results.NoContent();
            })
            .DisableAntiforgery()
            .Produces(StatusCodes.Status204NoContent)
            .ProducesProblem(StatusCodes.Status400BadRequest)
            .WithName("UploadTechnicianPhoto");
    }

    private static void MapSelfServiceEndpoints(IEndpointRouteBuilder endpoints)
    {
        var me = endpoints.MapGroup("/api/v1/tech/me").WithTags("Technician app").RequireAuthorization(AuthPolicies.Technician);

        me.MapGet("/", async (TechnicianSelfService useCase, CancellationToken ct) => (await useCase.GetProfileAsync(ct)).ToHttp())
            .Produces<TechnicianResponse>()
            .WithStandardErrors()
            .WithName("GetMyTechnicianProfile");

        me.MapPut("/duty-status", async (SetDutyStatusRequest request, TechnicianSelfService useCase, CancellationToken ct) =>
                (await useCase.SetDutyStatusAsync(request, ct)).ToHttp())
            .Produces<TechnicianResponse>()
            .WithStandardErrors()
            .WithName("SetMyDutyStatus");

        me.MapPost("/location", async (ReportLocationRequest request, TechnicianSelfService useCase, CancellationToken ct) =>
                (await useCase.ReportLocationAsync(request, ct)).ToHttp())
            .Produces(StatusCodes.Status204NoContent)
            .WithStandardErrors()
            .WithName("ReportMyLocation");
    }

    private static string ExtensionFor(string contentType) => contentType switch
    {
        "image/png" => "png",
        "image/webp" => "webp",
        _ => "jpg",
    };

    private static string ContentTypeFor(string key) => Path.GetExtension(key) switch
    {
        ".png" => "image/png",
        ".webp" => "image/webp",
        _ => "image/jpeg",
    };
}
