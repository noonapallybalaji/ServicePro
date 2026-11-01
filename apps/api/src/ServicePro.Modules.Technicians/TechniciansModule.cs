using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using ServicePro.BuildingBlocks.Modules;
using ServicePro.BuildingBlocks.Persistence;
using ServicePro.BuildingBlocks.Security;
using ServicePro.BuildingBlocks.Storage;
using ServicePro.BuildingBlocks.Web;
using ServicePro.Contracts.Ports;
using ServicePro.Modules.Technicians.Application;
using ServicePro.Modules.Technicians.Domain;
using ServicePro.Modules.Technicians.Infrastructure;
using ServicePro.SharedKernel.Results;

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
        services.AddDataProtection();
        services.AddScoped<PartnerPhoneProof>();
        services.AddScoped<ApplicantDocumentPass>();
        services.AddScoped<IPartnerApplicants, PartnerApplicants>();
    }

    public void MapEndpoints(IEndpointRouteBuilder endpoints)
    {
        MapStaffEndpoints(endpoints);
        MapSelfServiceEndpoints(endpoints);
        MapApplicationEndpoints(endpoints);

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

    /// <summary>"Join as a partner": anyone may apply; the office reviews.</summary>
    private static void MapApplicationEndpoints(IEndpointRouteBuilder endpoints)
    {
        endpoints.MapPost("/api/v1/public/technician-applications/code", async (PartnerCodeRequest request, RequestPartnerCode useCase, CancellationToken ct) =>
                (await useCase.HandleAsync(request, ct)).ToHttp())
            .AllowAnonymous()
            .RequireRateLimiting(RateLimitPolicies.Auth)
            .WithTags("Partner applications")
            .Produces<PartnerCodeResponse>()
            .WithStandardErrors()
            .WithName("RequestPartnerCode");

        endpoints.MapPost("/api/v1/public/technician-applications/verify", async (PartnerVerifyRequest request, VerifyPartnerPhone useCase, CancellationToken ct) =>
                (await useCase.HandleAsync(request, ct)).ToHttp())
            .AllowAnonymous()
            .RequireRateLimiting(RateLimitPolicies.Auth)
            .WithTags("Partner applications")
            .Produces<PartnerVerifiedResponse>()
            .WithStandardErrors()
            .WithName("VerifyPartnerPhone");

        endpoints.MapPost("/api/v1/public/technician-applications/documents", async Task<IResult> (
                [FromForm] string phone, [FromForm] string verificationToken, [FromForm] string kind, IFormFile file,
                UploadApplicantDocument useCase, CancellationToken ct) =>
            {
                if (!EnumText.TryParse<ApplicantDocumentKind>(kind, out var parsed))
                {
                    return Error.Validation("application.document_kind", $"Unknown document '{kind}'.").ToProblem();
                }

                await using var stream = file.OpenReadStream();
                return (await useCase.HandleAsync(phone, verificationToken, parsed, stream, file.ContentType, file.Length, ct)).ToHttp();
            })
            .AllowAnonymous()
            .DisableAntiforgery()
            .RequireRateLimiting(RateLimitPolicies.Public)
            .WithTags("Partner applications")
            .Produces<ApplicantDocumentUploaded>()
            .WithStandardErrors()
            .WithName("UploadApplicantDocument");

        // The applicant's own status page (after signing in with a code, or verifying on the form).
        endpoints.MapPost("/api/v1/public/technician-applications/status", async (PartnerApplicationStatusRequest request, GetPartnerApplicationStatus useCase, CancellationToken ct) =>
                (await useCase.HandleAsync(request, ct)).ToHttp())
            .AllowAnonymous()
            .RequireRateLimiting(RateLimitPolicies.Auth)
            .WithTags("Partner applications")
            .Produces<PartnerApplicationStatusResponse>()
            .WithStandardErrors()
            .WithName("GetPartnerApplicationStatus");

        endpoints.MapPost("/api/v1/public/technician-applications", async (SubmitTechnicianApplicationRequest request, SubmitTechnicianApplication useCase, CancellationToken ct) =>
                (await useCase.HandleAsync(request, ct)).ToHttp())
            .AllowAnonymous()
            .Validate<SubmitTechnicianApplicationRequest>()
            .RequireRateLimiting(RateLimitPolicies.Auth)
            .WithTags("Partner applications")
            .Produces<TechnicianApplicationReceived>()
            .WithStandardErrors()
            .WithName("SubmitTechnicianApplication");

        var review = endpoints.MapGroup("/api/v1/admin/technician-applications").WithTags("Partner applications").RequireAuthorization(AuthPolicies.Admin);

        // Status arrives as API text (PENDING); default enum binding only accepts "Pending".
        review.MapGet("/", async Task<IResult> (string? status, ListTechnicianApplications useCase, CancellationToken ct) =>
            {
                TechnicianApplicationStatus? wanted = null;
                if (!string.IsNullOrEmpty(status))
                {
                    if (!EnumText.TryParse<TechnicianApplicationStatus>(status, out var parsed))
                    {
                        return Results.Problem(statusCode: StatusCodes.Status400BadRequest, title: $"Unknown status '{status}'.");
                    }

                    wanted = parsed;
                }

                return Results.Ok(await useCase.HandleAsync(wanted, ct));
            })
            .Produces<IReadOnlyList<TechnicianApplicationResponse>>()
            .WithName("ListTechnicianApplications");

        review.MapGet("/{applicationId:guid}/documents/{kind}", async Task<IResult> (Guid applicationId, string kind, OpenApplicantDocument useCase, CancellationToken ct) =>
            {
                if (!EnumText.TryParse<ApplicantDocumentKind>(kind, out var parsed))
                {
                    return Results.NotFound();
                }

                var result = await useCase.HandleAsync(applicationId, parsed, ct);
                return result.IsSuccess ? Results.Stream(result.Value.Content, result.Value.ContentType) : result.Error!.ToProblem();
            })
            .WithStandardErrors()
            .WithName("OpenApplicantDocument");

        review.MapPost("/{applicationId:guid}/approve", async (Guid applicationId, ApproveTechnicianApplication useCase, CancellationToken ct) =>
                (await useCase.HandleAsync(applicationId, ct)).ToHttp())
            .Produces<TechnicianApplicationResponse>()
            .WithStandardErrors()
            .WithName("ApproveTechnicianApplication");

        review.MapPost("/{applicationId:guid}/reject", async (Guid applicationId, RejectTechnicianApplicationRequest request, RejectTechnicianApplication useCase, CancellationToken ct) =>
                (await useCase.HandleAsync(applicationId, request, ct)).ToHttp())
            .Validate<RejectTechnicianApplicationRequest>()
            .Produces<TechnicianApplicationResponse>()
            .WithStandardErrors()
            .WithName("RejectTechnicianApplication");
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
