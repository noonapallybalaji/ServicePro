using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using ServicePro.BuildingBlocks;
using ServicePro.BuildingBlocks.Modules;
using ServicePro.BuildingBlocks.Persistence;
using ServicePro.BuildingBlocks.Security;
using ServicePro.BuildingBlocks.Web;
using ServicePro.Contracts;
using ServicePro.Contracts.Ports;
using ServicePro.Modules.ServiceRequests.Application;
using ServicePro.Modules.ServiceRequests.Domain;
using ServicePro.SharedKernel;

namespace ServicePro.Modules.ServiceRequests;

public sealed class ServiceRequestsModule : IModule
{
    public string Name => "ServiceRequests";

    public void Register(IServiceCollection services, IConfiguration configuration)
    {
        services.AddScoped<IServiceRequestWorkflow, ServiceRequestWorkflowPort>();
        services.AddScoped<ServiceRequestViewBuilder>();
        services.AddScoped<SrNumberGenerator>();
        services.Configure<PublicSiteOptions>(configuration.GetSection("Notifications"));
        services.AddSetting(OpsSettings.StuckAfterMinutes);
        services.AddSetting(OpsSettings.EstimateRequiredBeforeRepair);
        services.AddSetting(OpsSettings.AutoConfirmWebsiteBookings);
        services.AddSetting(OpsSettings.AutoConfirmWhatsAppBookings);
        services.AddSetting(CustomerChangeSettings.CanCancel);
        services.AddSetting(CustomerChangeSettings.CanReschedule);
        services.AddSetting(CustomerChangeSettings.MaxReschedules);
        services.AddSetting(CustomerChangeSettings.CutoffMinutes);
        services.AddScoped<CustomerChangePolicy>();
        services.AddScoped<SlotAvailability>();
        services.AddSetting(AvailabilitySettings.Windows);
        services.AddSetting(AvailabilitySettings.DaysAhead);
        services.AddSetting(AvailabilitySettings.LeadTimeMinutes);
        services.AddSetting(AvailabilitySettings.JobsPerTechnicianPerWindow);
        services.AddSetting(AvailabilitySettings.CapacityCheck);
        services.AddSetting(FeedbackSettings.RequestsEnabled);
        services.AddSetting(FeedbackSettings.RequestDelayMinutes);
        services.AddSingleton<FeedbackRequestWorker>();
        if (configuration.GetValue("Feedback:RequestWorker", defaultValue: true))
        {
            services.AddHostedService(sp => sp.GetRequiredService<FeedbackRequestWorker>());
        }
    }

    public void MapEndpoints(IEndpointRouteBuilder endpoints)
    {
        MapStaffEndpoints(endpoints);
        MapTechnicianEndpoints(endpoints);
        MapSharedEndpoints(endpoints);
        MapPublicEndpoints(endpoints);
    }

    private static void MapStaffEndpoints(IEndpointRouteBuilder endpoints)
    {
        var staff = endpoints.MapGroup("/api/v1/admin/service-requests").WithTags("Service requests").RequireAuthorization(AuthPolicies.Staff);

        // Statuses arrive as API text (READY_FOR_ASSIGNMENT); default enum binding only accepts "ReadyForAssignment".
        staff.MapGet("/", async Task<IResult> (
                [FromQuery] string[]? status,
                Guid? technicianId,
                Guid? customerId,
                string? srNumber,
                DateOnly? createdFrom,
                DateOnly? createdTo,
                bool? onlyStuck,
                int? page,
                int? pageSize,
                ListServiceRequests useCase,
                CancellationToken ct) =>
            {
                var statuses = new List<ServiceRequestStatus>();
                foreach (var text in status ?? [])
                {
                    if (!EnumText.TryParse<ServiceRequestStatus>(text, out var parsed))
                    {
                        return Results.Problem(statusCode: StatusCodes.Status400BadRequest, title: $"Unknown status '{text}'.");
                    }

                    statuses.Add(parsed);
                }

                return Results.Ok(await useCase.HandleAsync(
                    new ServiceRequestFilter(statuses.Count > 0 ? [.. statuses] : null, technicianId, customerId, srNumber, createdFrom, createdTo, onlyStuck),
                    new PageRequest(page ?? 1, pageSize ?? 25),
                    ct));
            })
            .Produces<PagedResult<ServiceRequestCard>>()
            .ProducesProblem(StatusCodes.Status400BadRequest)
            .WithName("ListServiceRequests");

        staff.MapGet("/{serviceRequestId:guid}", async (Guid serviceRequestId, GetServiceRequestDetail useCase, CancellationToken ct) =>
                (await useCase.HandleAsync(serviceRequestId, ct)).ToHttp())
            .Produces<ServiceRequestDetail>()
            .WithStandardErrors()
            .WithName("GetServiceRequest");

        staff.MapPost("/", async (CreateServiceRequestRequest request, CreateServiceRequest useCase, CancellationToken ct) =>
                (await useCase.HandleAsync(request, ct)).ToIdResponse())
            .Validate<CreateServiceRequestRequest>()
            .Produces<IdResponse>()
            .WithStandardErrors()
            .WithName("CreateServiceRequest");

        staff.MapPut("/{serviceRequestId:guid}", async (Guid serviceRequestId, UpdateServiceRequestRequest request, UpdateServiceRequest useCase, CancellationToken ct) =>
                (await useCase.HandleAsync(serviceRequestId, request, ct)).ToHttp())
            .Validate<UpdateServiceRequestRequest>()
            .Produces(StatusCodes.Status204NoContent)
            .WithStandardErrors()
            .WithName("UpdateServiceRequest");

        staff.MapPost("/{serviceRequestId:guid}/transitions", async (Guid serviceRequestId, TransitionRequest request, TransitionServiceRequest useCase, CancellationToken ct) =>
                (await useCase.HandleAsync(serviceRequestId, request, ct)).ToHttp())
            .Validate<TransitionRequest>()
            .Produces(StatusCodes.Status204NoContent)
            .WithStandardErrors()
            .WithName("TransitionServiceRequest");

        var dashboard = endpoints.MapGroup("/api/v1/admin/dashboard").WithTags("Dashboard").RequireAuthorization(AuthPolicies.Staff);

        dashboard.MapGet("/summary", async (GetDashboardSummary useCase, CancellationToken ct) => Results.Ok(await useCase.HandleAsync(ct)))
            .Produces<DashboardSummaryResponse>()
            .WithName("GetDashboardSummary");

        dashboard.MapGet("/board", async (DateOnly? date, GetLiveBoard useCase, CancellationToken ct) => Results.Ok(await useCase.HandleAsync(date, ct)))
            .Produces<BoardResponse>()
            .WithName("GetLiveBoard");
    }

    private static void MapTechnicianEndpoints(IEndpointRouteBuilder endpoints)
    {
        var jobs = endpoints.MapGroup("/api/v1/tech/jobs").WithTags("Technician app").RequireAuthorization(AuthPolicies.Technician);

        jobs.MapGet("/", async (ListMyJobs useCase, CancellationToken ct) => Results.Ok(await useCase.HandleAsync(ct)))
            .Produces<MyJobsResponse>()
            .WithName("ListMyJobs");

        jobs.MapGet("/{serviceRequestId:guid}", async (Guid serviceRequestId, GetServiceRequestDetail useCase, CancellationToken ct) =>
                (await useCase.HandleAsync(serviceRequestId, ct)).ToHttp())
            .Produces<ServiceRequestDetail>()
            .WithStandardErrors()
            .WithName("GetMyJob");

        jobs.MapPost("/{serviceRequestId:guid}/transitions", async (Guid serviceRequestId, TransitionRequest request, TransitionServiceRequest useCase, CancellationToken ct) =>
                (await useCase.HandleAsync(serviceRequestId, request, ct)).ToHttp())
            .Validate<TransitionRequest>()
            .Produces(StatusCodes.Status204NoContent)
            .WithStandardErrors()
            .WithName("TransitionMyJob");
    }

    /// <summary>Used by both staff and the assigned technician (authorisation is checked per job).</summary>
    private static void MapSharedEndpoints(IEndpointRouteBuilder endpoints)
    {
        var shared = endpoints.MapGroup("/api/v1/service-requests/{serviceRequestId:guid}").WithTags("Service requests").RequireAuthorization();

        shared.MapPost("/notes", async (Guid serviceRequestId, AddNoteRequest request, AddServiceRequestNote useCase, CancellationToken ct) =>
                (await useCase.HandleAsync(serviceRequestId, request, ct)).ToHttp())
            .Validate<AddNoteRequest>()
            .Produces<NoteResponse>()
            .WithStandardErrors()
            .WithName("AddServiceRequestNote");

        // Multipart: `kind` is PHOTO_BEFORE | PHOTO_AFTER | PHOTO_ISSUE | VOICE_NOTE | DOCUMENT.
        shared.MapPost("/attachments", async (Guid serviceRequestId, [FromForm] string kind, IFormFile file, UploadServiceRequestAttachment useCase, CancellationToken ct) =>
            {
                if (!EnumText.TryParse<AttachmentKind>(kind, out var attachmentKind))
                {
                    return Results.Problem(statusCode: StatusCodes.Status400BadRequest, title: "Unknown attachment kind.");
                }

                await using var stream = file.OpenReadStream();
                return (await useCase.HandleAsync(serviceRequestId, attachmentKind, stream, file.ContentType, file.Length, ct)).ToHttp();
            })
            .DisableAntiforgery()
            .Produces<AttachmentResponse>()
            .WithStandardErrors()
            .WithName("UploadServiceRequestAttachment");

        shared.MapGet("/attachments/{attachmentId:guid}", async (Guid serviceRequestId, Guid attachmentId, OpenServiceRequestAttachment useCase, CancellationToken ct) =>
            {
                var result = await useCase.HandleAsync(serviceRequestId, attachmentId, ct);
                return result.IsSuccess ? Results.File(result.Value.Content, result.Value.ContentType) : result.Error!.ToProblem();
            })
            .Produces(StatusCodes.Status200OK, contentType: "application/octet-stream")
            .WithStandardErrors()
            .WithName("GetServiceRequestAttachment");

        shared.MapPost("/completion-code", async (Guid serviceRequestId, ReissueCompletionCode useCase, CancellationToken ct) =>
                (await useCase.HandleAsync(serviceRequestId, ct)).ToHttp())
            .RequireRateLimiting(RateLimitPolicies.Auth)
            .Produces(StatusCodes.Status204NoContent)
            .WithStandardErrors()
            .WithName("ReissueCompletionCode");

        endpoints.MapGet("/api/v1/meta/transitions", (GetWorkflowMetadata useCase) => Results.Ok(useCase.Handle()))
            .WithTags("Meta")
            .RequireAuthorization()
            .Produces<IReadOnlyList<TransitionRuleResponse>>()
            .WithName("GetWorkflowTransitions");
    }

    private static void MapPublicEndpoints(IEndpointRouteBuilder endpoints)
    {
        // Server-to-server bookings (n8n WhatsApp assistant): integration key, idempotent, no session.
        endpoints.MapPost("/api/v1/integrations/bookings", async (IntegrationBookingRequest request, BookViaIntegration useCase, CancellationToken ct) =>
                (await useCase.HandleAsync(request, ct)).ToHttp())
            .WithTags("Integrations")
            .RequireAuthorization(AuthPolicies.Integration)
            .RequireRateLimiting(RateLimitPolicies.Integration)
            .Validate<IntegrationBookingRequest>()
            .Produces<IntegrationBookingResponse>()
            .ProducesProblem(StatusCodes.Status401Unauthorized)
            .WithStandardErrors()
            .WithName("BookViaIntegration");

        // The signed-in customer's bookings (customer site "My bookings").
        endpoints.MapGet("/api/v1/account/bookings", async (ListMyBookings useCase, CancellationToken ct) => (await useCase.HandleAsync(ct)).ToHttp())
            .WithTags("Customer account")
            .RequireAuthorization(AuthPolicies.Customer)
            .Produces<IReadOnlyList<MyBookingResponse>>()
            .WithStandardErrors()
            .WithName("ListMyBookings");

        endpoints.MapPost("/api/v1/public/track/{token}/review", async (string token, SubmitReviewRequest request, SubmitReview useCase, CancellationToken ct) =>
                (await useCase.HandleAsync(token, request, ct)).ToHttp())
            .WithTags("Tracking")
            .AllowAnonymous()
            .RequireRateLimiting(RateLimitPolicies.Public)
            .Validate<SubmitReviewRequest>()
            .Produces<ReviewResponse>()
            .WithStandardErrors()
            .WithName("SubmitReview");

        endpoints.MapGet("/api/v1/admin/reviews", async (int? maxRating, int? take, ListReviews useCase, CancellationToken ct) =>
                Results.Ok(await useCase.HandleAsync(maxRating, take ?? 50, ct)))
            .WithTags("Service requests")
            .RequireAuthorization(AuthPolicies.Staff)
            .Produces<IReadOnlyList<ReviewListItem>>()
            .WithName("ListReviews");

        endpoints.MapGet("/api/v1/public/availability", async (Guid categoryId, string pincode, GetAvailability useCase, CancellationToken ct) =>
                (await useCase.HandleAsync(categoryId, pincode, ct)).ToHttp())
            .WithTags("Online booking")
            .AllowAnonymous()
            .RequireRateLimiting(RateLimitPolicies.Public)
            .Produces<AvailabilityResponse>()
            .WithStandardErrors()
            .WithName("GetAvailability");

        endpoints.MapGet("/api/v1/account/bookings/{id:guid}/availability", async (Guid id, GetMyBookingAvailability useCase, CancellationToken ct) =>
                (await useCase.HandleAsync(id, ct)).ToHttp())
            .WithTags("Customer account")
            .RequireAuthorization(AuthPolicies.Customer)
            .Produces<AvailabilityResponse>()
            .WithStandardErrors()
            .WithName("GetMyBookingAvailability");

        endpoints.MapPost("/api/v1/account/bookings/{id:guid}/cancel", async (Guid id, CancelBookingRequest request, CancelMyBooking useCase, CancellationToken ct) =>
                (await useCase.HandleAsync(id, request, ct)).ToHttp())
            .WithTags("Customer account")
            .RequireAuthorization(AuthPolicies.Customer)
            .Validate<CancelBookingRequest>()
            .Produces(StatusCodes.Status204NoContent)
            .WithStandardErrors()
            .WithName("CancelMyBooking");

        endpoints.MapPost("/api/v1/account/bookings/{id:guid}/reschedule", async (Guid id, RescheduleBookingRequest request, RescheduleMyBooking useCase, CancellationToken ct) =>
                (await useCase.HandleAsync(id, request, ct)).ToHttp())
            .WithTags("Customer account")
            .RequireAuthorization(AuthPolicies.Customer)
            .Produces(StatusCodes.Status204NoContent)
            .WithStandardErrors()
            .WithName("RescheduleMyBooking");

        // Online booking: both steps send SMS or check codes, so they get the strict auth limit.
        var bookings = endpoints.MapGroup("/api/v1/public/bookings").WithTags("Online booking").AllowAnonymous().RequireRateLimiting(RateLimitPolicies.Auth);

        bookings.MapPost("/code", async (BookingCodeRequest request, RequestBookingCode useCase, CancellationToken ct) =>
                (await useCase.HandleAsync(request, ct)).ToHttp())
            .Validate<BookingCodeRequest>()
            .Produces<BookingCodeResponse>()
            .WithStandardErrors()
            .WithName("RequestBookingCode");

        bookings.MapPost("/", async (OnlineBookingRequest request, BookServiceOnline useCase, HttpContext http, CancellationToken ct) =>
            {
                var result = await useCase.HandleAsync(request, ct);
                if (result.IsFailure)
                {
                    return result.Error!.ToProblem();
                }

                if (result.Value.Session is { } session)
                {
                    CustomerSessionCookie.Append(http.Response, session.RefreshToken, session.RefreshExpiresAt);
                }

                return Results.Ok(result.Value.Response);
            })
            .Validate<OnlineBookingRequest>()
            .Produces<OnlineBookingResponse>()
            .WithStandardErrors()
            .WithName("BookServiceOnline");

        var track = endpoints.MapGroup("/api/v1/public/track/{token}").WithTags("Tracking").AllowAnonymous().RequireRateLimiting(RateLimitPolicies.Public);

        track.MapGet("/", async (string token, GetTracking useCase, CancellationToken ct) => (await useCase.HandleAsync(token, ct)).ToHttp())
            .Produces<TrackingResponse>()
            .WithStandardErrors()
            .WithName("GetTracking");

        track.MapGet("/photos/{attachmentId:guid}", async (string token, Guid attachmentId, OpenTrackingPhoto useCase, CancellationToken ct) =>
            {
                var result = await useCase.HandleAsync(token, attachmentId, ct);
                return result.IsSuccess ? Results.File(result.Value.Content, result.Value.ContentType) : result.Error!.ToProblem();
            })
            .Produces(StatusCodes.Status200OK, contentType: "image/jpeg")
            .WithStandardErrors()
            .WithName("GetTrackingPhoto");
    }
}
