using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using ServicePro.BuildingBlocks;
using ServicePro.BuildingBlocks.Modules;
using ServicePro.BuildingBlocks.Security;
using ServicePro.BuildingBlocks.Web;
using ServicePro.Modules.Dispatch.Application;
using ServicePro.Modules.Dispatch.Domain;
using ServicePro.Modules.Dispatch.Matching;

namespace ServicePro.Modules.Dispatch;

public sealed class DispatchModule : IModule
{
    public string Name => "Dispatch";

    public void Register(IServiceCollection services, IConfiguration configuration)
    {
        services.AddScoped<MatchContextBuilder>();
        services.AddScoped<MatchingEngine>();
        services.AddScoped<JobOffers>();
        services.AddSetting(AutoDispatchSettings.AutoOffer);
        services.AddSetting(AutoDispatchSettings.MaxAutoOffers);

        // Add or remove a rule/factor here — the engine itself never changes (open/closed).
        services.AddSingleton<IEligibilityRule, HasRequiredSkillRule>();
        services.AddSingleton<IEligibilityRule, CoversServiceAreaRule>();
        services.AddSingleton<IEligibilityRule, AvailableAtJobTimeRule>();
        services.AddSingleton<IEligibilityRule, UnderDailyCapRule>();
        services.AddSingleton<IEligibilityRule, NotAlreadyTriedRule>();
        services.AddSingleton<IEligibilityRule, OnDutyForSoonJobsRule>();
        services.AddSingleton<IScoringFactor, DistanceFactor>();
        services.AddSingleton<IScoringFactor, SkillFactor>();
        services.AddSingleton<IScoringFactor, WorkloadFactor>();
        services.AddSingleton<IScoringFactor, PerformanceFactor>();
        services.AddSingleton<IScoringFactor, ContinuityFactor>();
        services.AddSingleton<IScoringFactor, FairnessFactor>();

        services.AddSetting(DispatchSettings.OfferTimeoutMinutes);
        services.AddSetting(DispatchSettings.MaxRadiusKm);
        services.AddSetting(DispatchSettings.Weights);

        services.AddSingleton<OfferExpiryWorker>();
        if (configuration.GetValue("Dispatch:OfferExpiryWorker", defaultValue: true))
        {
            services.AddHostedService(sp => sp.GetRequiredService<OfferExpiryWorker>());
        }
    }

    public void MapEndpoints(IEndpointRouteBuilder endpoints)
    {
        var staff = endpoints.MapGroup("/api/v1/admin/service-requests/{serviceRequestId:guid}").WithTags("Dispatch").RequireAuthorization(AuthPolicies.Staff);

        staff.MapGet("/candidates", async (Guid serviceRequestId, GetCandidates useCase, CancellationToken ct) =>
                (await useCase.HandleAsync(serviceRequestId, ct)).ToHttp())
            .Produces<IReadOnlyList<CandidateResponse>>()
            .WithStandardErrors()
            .WithName("GetDispatchCandidates");

        staff.MapPost("/assign", async (Guid serviceRequestId, AssignTechnicianRequest request, AssignTechnician useCase, CancellationToken ct) =>
                (await useCase.HandleAsync(serviceRequestId, request, ct)).ToHttp())
            .Validate<AssignTechnicianRequest>()
            .Produces<AssignmentResponse>()
            .WithStandardErrors()
            .WithName("AssignTechnician");

        staff.MapPost("/unassign", async (Guid serviceRequestId, UnassignRequest request, UnassignTechnician useCase, CancellationToken ct) =>
                (await useCase.HandleAsync(serviceRequestId, request, ct)).ToHttp())
            .Validate<UnassignRequest>()
            .Produces(StatusCodes.Status204NoContent)
            .WithStandardErrors()
            .WithName("UnassignTechnician");

        staff.MapGet("/assignments", async (Guid serviceRequestId, ListAssignmentHistory useCase, CancellationToken ct) =>
                Results.Ok(await useCase.HandleAsync(serviceRequestId, ct)))
            .Produces<IReadOnlyList<AssignmentResponse>>()
            .WithName("ListAssignmentHistory");

        var offers = endpoints.MapGroup("/api/v1/tech/offers").WithTags("Technician app").RequireAuthorization(AuthPolicies.Technician);

        offers.MapGet("/", async (ListMyOffers useCase, CancellationToken ct) => Results.Ok(await useCase.HandleAsync(ct)))
            .Produces<IReadOnlyList<OfferResponse>>()
            .WithName("ListMyOffers");

        offers.MapPost("/{assignmentId:guid}/accept", async (Guid assignmentId, RespondToOffer useCase, CancellationToken ct) =>
                (await useCase.AcceptAsync(assignmentId, ct)).ToHttp())
            .Produces(StatusCodes.Status204NoContent)
            .WithStandardErrors()
            .WithName("AcceptOffer");

        offers.MapPost("/{assignmentId:guid}/decline", async (Guid assignmentId, DeclineOfferRequest request, RespondToOffer useCase, CancellationToken ct) =>
                (await useCase.DeclineAsync(assignmentId, request, ct)).ToHttp())
            .Produces(StatusCodes.Status204NoContent)
            .WithStandardErrors()
            .WithName("DeclineOffer");
    }
}

internal sealed class TechnicianAssignmentConfiguration : IEntityTypeConfiguration<TechnicianAssignment>
{
    public void Configure(EntityTypeBuilder<TechnicianAssignment> builder)
    {
        builder.ToTable("technician_assignments", "dispatch");
        builder.Property(a => a.OverrideReason).HasMaxLength(200);
        builder.Property(a => a.DeclineReason).HasMaxLength(200);
        builder.Property(a => a.MatchScore).HasPrecision(6, 2);
        builder.Property(a => a.Version).IsRowVersion();
        builder.Property(a => a.ScoreBreakdown)
            .HasColumnType("jsonb")
            .HasConversion(
                v => JsonSerializer.Serialize(v, (JsonSerializerOptions?)null),
                v => JsonSerializer.Deserialize<Dictionary<string, decimal>>(v, (JsonSerializerOptions?)null) ?? new Dictionary<string, decimal>(),
                new ValueComparer<Dictionary<string, decimal>>(
                    (a, b) => a!.Count == b!.Count && !a.Except(b).Any(),
                    v => v.Aggregate(0, (hash, pair) => HashCode.Combine(hash, pair.Key, pair.Value)),
                    v => v.ToDictionary()));
        builder.Ignore(a => a.IsOpen);
        builder.HasIndex(a => new { a.ServiceRequestId, a.Status });
        builder.HasIndex(a => new { a.TechnicianId, a.Status });
        builder.HasIndex(a => a.OfferExpiresAt).HasFilter("status = 'OFFERED'");
    }
}
