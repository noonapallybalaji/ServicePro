using FluentValidation;
using Microsoft.EntityFrameworkCore;
using ServicePro.BuildingBlocks.Application;
using ServicePro.Contracts;
using ServicePro.Contracts.Ports;
using ServicePro.Modules.Technicians.Domain;
using ServicePro.SharedKernel.Abstractions;
using ServicePro.SharedKernel.Results;
using ServicePro.SharedKernel.ValueObjects;

namespace ServicePro.Modules.Technicians.Application;

// ── DTOs ────────────────────────────────────────────────────────────────────

public sealed record SkillInput(Guid CategoryId, int Level);

public sealed record ShiftInput(DayOfWeek Day, TimeOnly Start, TimeOnly End);

public sealed record SkillResponse(Guid CategoryId, int Level);

public sealed record ShiftResponse(Guid Id, DayOfWeek Day, TimeOnly Start, TimeOnly End);

public sealed record TimeOffResponse(Guid Id, DateTimeOffset StartsAt, DateTimeOffset EndsAt, string? Reason);

public sealed record TechnicianListItem(
    Guid Id,
    string FullName,
    string Phone,
    string? EmployeeCode,
    TechnicianDutyStatus DutyStatus,
    bool IsActive,
    IReadOnlyList<SkillResponse> Skills,
    IReadOnlyList<Guid> ServiceAreaIds,
    int CompletedJobs,
    decimal? RatingAverage,
    DateTimeOffset? LastLocationAt,
    string? PhotoUrl);

public sealed record TechnicianResponse(
    Guid Id,
    Guid UserId,
    string FullName,
    string Phone,
    string? EmployeeCode,
    EmploymentType EmploymentType,
    TechnicianDutyStatus DutyStatus,
    bool IsActive,
    int MaxJobsPerDay,
    CommissionType CommissionType,
    decimal CommissionValue,
    double? HomeLatitude,
    double? HomeLongitude,
    double? LastLatitude,
    double? LastLongitude,
    DateTimeOffset? LastLocationAt,
    int CompletedJobs,
    decimal? RatingAverage,
    string? PhotoUrl,
    IReadOnlyList<SkillResponse> Skills,
    IReadOnlyList<Guid> ServiceAreaIds,
    IReadOnlyList<ShiftResponse> Shifts,
    IReadOnlyList<TimeOffResponse> TimeOff);

internal static class TechnicianMapping
{
    public static string? PhotoUrl(this Technician t) => t.PhotoKey is null ? null : $"/api/v1/technicians/{t.Id}/photo";

    public static TechnicianListItem ToListItem(this Technician t) => new(
        t.Id, t.FullName, t.Phone.Value, t.EmployeeCode, t.DutyStatus, t.IsActive,
        [.. t.Skills.Select(s => new SkillResponse(s.CategoryId, s.Level))],
        [.. t.ServiceAreas.Select(a => a.ServiceAreaId)],
        t.CompletedJobsCount, t.RatingAverage, t.LastLocationAt, t.PhotoUrl());

    public static TechnicianResponse ToResponse(this Technician t) => new(
        t.Id, t.UserId, t.FullName, t.Phone.Value, t.EmployeeCode, t.EmploymentType, t.DutyStatus, t.IsActive,
        t.MaxJobsPerDay, t.CommissionType, t.CommissionValue, t.HomeLatitude, t.HomeLongitude,
        t.LastLatitude, t.LastLongitude, t.LastLocationAt, t.CompletedJobsCount, t.RatingAverage, t.PhotoUrl(),
        [.. t.Skills.Select(s => new SkillResponse(s.CategoryId, s.Level))],
        [.. t.ServiceAreas.Select(a => a.ServiceAreaId)],
        [.. t.Shifts.OrderBy(s => s.Day).ThenBy(s => s.Start).Select(s => new ShiftResponse(s.Id, s.Day, s.Start, s.End))],
        [.. t.TimeOff.OrderBy(o => o.StartsAt).Select(o => new TimeOffResponse(o.Id, o.StartsAt, o.EndsAt, o.Reason))]);
}

internal static class TechnicianErrors
{
    public static readonly Error NotFound = Error.NotFound("technician.not_found", "That technician doesn't exist.");
    public static readonly Error NotATechnician = Error.Forbidden("technician.required", "Only technicians can do this.");
}

/// <summary>Loads a technician with all child collections (aggregate boundary).</summary>
internal static class TechnicianQueries
{
    public static IQueryable<Technician> WithDetails(this DbSet<Technician> set) =>
        set.Include(t => t.Skills).Include(t => t.ServiceAreas).Include(t => t.Shifts).Include(t => t.TimeOff).AsSplitQuery();
}

// ── Queries ─────────────────────────────────────────────────────────────────

public sealed class ListTechnicians(DbContext db) : IUseCase
{
    public async Task<IReadOnlyList<TechnicianListItem>> HandleAsync(bool includeInactive, CancellationToken ct)
    {
        var technicians = await db.Set<Technician>().AsNoTracking()
            .Include(t => t.Skills).Include(t => t.ServiceAreas).AsSplitQuery()
            .Where(t => includeInactive || t.IsActive)
            .OrderBy(t => t.FullName)
            .ToListAsync(ct);
        return [.. technicians.Select(t => t.ToListItem())];
    }
}

public sealed class GetTechnician(DbContext db) : IUseCase
{
    public async Task<Result<TechnicianResponse>> HandleAsync(Guid technicianId, CancellationToken ct)
    {
        var technician = await db.Set<Technician>().WithDetails().AsNoTracking().FirstOrDefaultAsync(t => t.Id == technicianId, ct);
        return technician is null ? TechnicianErrors.NotFound : technician.ToResponse();
    }
}

// ── Commands (staff) ────────────────────────────────────────────────────────

public sealed record TechnicianProfileInput(
    string FullName,
    string Phone,
    string? EmployeeCode,
    EmploymentType EmploymentType,
    int MaxJobsPerDay,
    CommissionType CommissionType,
    decimal CommissionValue,
    double? HomeLatitude,
    double? HomeLongitude);

internal sealed class TechnicianProfileInputValidator : AbstractValidator<TechnicianProfileInput>
{
    public TechnicianProfileInputValidator()
    {
        RuleFor(r => r.FullName).NotEmpty().MaximumLength(200);
        RuleFor(r => r.Phone).NotEmpty();
        RuleFor(r => r.MaxJobsPerDay).InclusiveBetween(1, 20);
        RuleFor(r => r.CommissionValue).GreaterThanOrEqualTo(0);
        RuleFor(r => r.CommissionValue).LessThanOrEqualTo(100)
            .When(r => r.CommissionType == CommissionType.Percent)
            .WithMessage("A percentage commission can't exceed 100.");
        RuleFor(r => r.HomeLatitude).InclusiveBetween(-90, 90).When(r => r.HomeLatitude.HasValue);
        RuleFor(r => r.HomeLongitude).InclusiveBetween(-180, 180).When(r => r.HomeLongitude.HasValue);
    }
}

public sealed record CreateTechnicianRequest(
    TechnicianProfileInput Profile,
    IReadOnlyList<SkillInput> Skills,
    IReadOnlyList<Guid> ServiceAreaIds);

internal sealed class CreateTechnicianRequestValidator : AbstractValidator<CreateTechnicianRequest>
{
    public CreateTechnicianRequestValidator()
    {
        RuleFor(r => r.Profile).NotNull().SetValidator(new TechnicianProfileInputValidator());
        RuleFor(r => r.Skills).NotEmpty().WithMessage("Add at least one skill.");
        RuleForEach(r => r.Skills).ChildRules(s => s.RuleFor(x => x.Level).InclusiveBetween(1, 5));
    }
}

public sealed class CreateTechnician(DbContext db, IUserProvisioning users) : IUseCase
{
    /// <summary>Creates the technician AND their login in one transaction.</summary>
    public async Task<Result<TechnicianResponse>> HandleAsync(CreateTechnicianRequest request, CancellationToken ct)
    {
        var profile = ProfileParser.Parse(request.Profile);
        if (profile.IsFailure)
        {
            return profile.Error!;
        }

        var (phone, home) = profile.Value;
        var userId = await users.CreateAsync(new NewUser(request.Profile.FullName, phone, null, UserRole.Technician), ct);
        if (userId.IsFailure)
        {
            return userId.Error!;
        }

        var p = request.Profile;
        var technician = Technician.Create(userId.Value, p.FullName, phone, p.EmployeeCode, p.EmploymentType);
        technician.UpdateProfile(p.FullName, phone, p.EmployeeCode, p.EmploymentType, p.MaxJobsPerDay, p.CommissionType, p.CommissionValue, home);
        technician.ReplaceSkills(request.Skills.Select(s => (s.CategoryId, s.Level)));
        technician.ReplaceServiceAreas(request.ServiceAreaIds);

        db.Set<Technician>().Add(technician);
        await db.SaveChangesAsync(ct);
        return technician.ToResponse();
    }
}

public sealed record UpdateTechnicianRequest(TechnicianProfileInput Profile, bool IsActive);

internal sealed class UpdateTechnicianRequestValidator : AbstractValidator<UpdateTechnicianRequest>
{
    public UpdateTechnicianRequestValidator() =>
        RuleFor(r => r.Profile).NotNull().SetValidator(new TechnicianProfileInputValidator());
}

public sealed class UpdateTechnician(DbContext db, IUserProvisioning users) : IUseCase
{
    public async Task<Result<TechnicianResponse>> HandleAsync(Guid technicianId, UpdateTechnicianRequest request, CancellationToken ct)
    {
        var technician = await db.Set<Technician>().WithDetails().FirstOrDefaultAsync(t => t.Id == technicianId, ct);
        if (technician is null)
        {
            return TechnicianErrors.NotFound;
        }

        var profile = ProfileParser.Parse(request.Profile);
        if (profile.IsFailure)
        {
            return profile.Error!;
        }

        var (phone, home) = profile.Value;
        var p = request.Profile;

        // Keep the login in step with the profile: same name, same phone, same active state.
        var userSync = await users.UpdateProfileAsync(technician.UserId, p.FullName, phone, ct);
        if (userSync.IsFailure)
        {
            return userSync.Error!;
        }

        await users.SetActiveAsync(technician.UserId, request.IsActive, ct);
        technician.UpdateProfile(p.FullName, phone, p.EmployeeCode, p.EmploymentType, p.MaxJobsPerDay, p.CommissionType, p.CommissionValue, home);
        technician.SetActive(request.IsActive);

        await db.SaveChangesAsync(ct);
        return technician.ToResponse();
    }
}

public sealed record SetSkillsRequest(IReadOnlyList<SkillInput> Skills);

public sealed record SetServiceAreasRequest(IReadOnlyList<Guid> ServiceAreaIds);

public sealed record SetShiftsRequest(IReadOnlyList<ShiftInput> Shifts);

public sealed record AddTimeOffRequest(DateTimeOffset StartsAt, DateTimeOffset EndsAt, string? Reason);

internal sealed class SetSkillsRequestValidator : AbstractValidator<SetSkillsRequest>
{
    public SetSkillsRequestValidator()
    {
        RuleFor(r => r.Skills).NotEmpty().WithMessage("A technician needs at least one skill.");
        RuleForEach(r => r.Skills).ChildRules(s => s.RuleFor(x => x.Level).InclusiveBetween(1, 5));
    }
}

/// <summary>Edits one capability set of a technician (skills, areas, shifts, time off).</summary>
public sealed class ManageTechnicianCapabilities(DbContext db) : IUseCase
{
    public Task<Result<TechnicianResponse>> SetSkillsAsync(Guid technicianId, SetSkillsRequest request, CancellationToken ct) =>
        MutateAsync(technicianId, t =>
        {
            t.ReplaceSkills(request.Skills.Select(s => (s.CategoryId, s.Level)));
            return Result.Success();
        }, ct);

    public Task<Result<TechnicianResponse>> SetServiceAreasAsync(Guid technicianId, SetServiceAreasRequest request, CancellationToken ct) =>
        MutateAsync(technicianId, t =>
        {
            t.ReplaceServiceAreas(request.ServiceAreaIds);
            return Result.Success();
        }, ct);

    public Task<Result<TechnicianResponse>> SetShiftsAsync(Guid technicianId, SetShiftsRequest request, CancellationToken ct) =>
        MutateAsync(technicianId, t => t.ReplaceShifts(request.Shifts.Select(s => (s.Day, s.Start, s.End))), ct);

    public Task<Result<TechnicianResponse>> AddTimeOffAsync(Guid technicianId, AddTimeOffRequest request, CancellationToken ct) =>
        MutateAsync(technicianId, t => t.AddTimeOff(request.StartsAt, request.EndsAt, request.Reason), ct);

    public Task<Result<TechnicianResponse>> RemoveTimeOffAsync(Guid technicianId, Guid timeOffId, CancellationToken ct) =>
        MutateAsync(technicianId, t => t.RemoveTimeOff(timeOffId), ct);

    /// <summary>The office sets duty status on a technician's behalf (e.g. confirmed by phone).</summary>
    public Task<Result<TechnicianResponse>> SetDutyStatusAsync(Guid technicianId, SetDutyStatusRequest request, CancellationToken ct) =>
        MutateAsync(technicianId, t => t.ChangeDutyStatus(request.Status), ct);

    private async Task<Result<TechnicianResponse>> MutateAsync(Guid technicianId, Func<Technician, Result> change, CancellationToken ct)
    {
        var technician = await db.Set<Technician>().WithDetails().FirstOrDefaultAsync(t => t.Id == technicianId, ct);
        if (technician is null)
        {
            return TechnicianErrors.NotFound;
        }

        var result = change(technician);
        if (result.IsFailure)
        {
            return result.Error!;
        }

        await db.SaveChangesAsync(ct);
        return technician.ToResponse();
    }
}

// ── Commands (technician self-service) ──────────────────────────────────────

public sealed record SetDutyStatusRequest(TechnicianDutyStatus Status);

public sealed record ReportLocationRequest(double Latitude, double Longitude);

public sealed class TechnicianSelfService(DbContext db, ICurrentUser currentUser, IClock clock) : IUseCase
{
    public async Task<Result<TechnicianResponse>> GetProfileAsync(CancellationToken ct)
    {
        var technician = await LoadAsync(ct);
        return technician is null ? TechnicianErrors.NotATechnician : technician.ToResponse();
    }

    public async Task<Result<TechnicianResponse>> SetDutyStatusAsync(SetDutyStatusRequest request, CancellationToken ct)
    {
        var technician = await LoadAsync(ct);
        if (technician is null)
        {
            return TechnicianErrors.NotATechnician;
        }

        var result = technician.ChangeDutyStatus(request.Status);
        if (result.IsFailure)
        {
            return result.Error!;
        }

        await db.SaveChangesAsync(ct);
        return technician.ToResponse();
    }

    public async Task<Result> ReportLocationAsync(ReportLocationRequest request, CancellationToken ct)
    {
        var location = GeoLocation.Create(request.Latitude, request.Longitude);
        if (location.IsFailure)
        {
            return location.Error!;
        }

        var technician = await db.Set<Technician>().FirstOrDefaultAsync(t => t.Id == currentUser.TechnicianId, ct);
        if (technician is null)
        {
            return TechnicianErrors.NotATechnician;
        }

        technician.ReportLocation(location.Value, clock.UtcNow);
        await db.SaveChangesAsync(ct);
        return Result.Success();
    }

    private Task<Technician?> LoadAsync(CancellationToken ct) =>
        currentUser.TechnicianId is { } id
            ? db.Set<Technician>().WithDetails().FirstOrDefaultAsync(t => t.Id == id, ct)
            : Task.FromResult<Technician?>(null);
}

/// <summary>Validates the shared parts of a profile and converts primitives to value objects.</summary>
internal static class ProfileParser
{
    public static Result<(PhoneNumber Phone, GeoLocation? Home)> Parse(TechnicianProfileInput input)
    {
        var phone = PhoneNumber.Create(input.Phone);
        if (phone.IsFailure)
        {
            return phone.Error!;
        }

        GeoLocation? home = null;
        if (input is { HomeLatitude: { } lat, HomeLongitude: { } lon })
        {
            var geo = GeoLocation.Create(lat, lon);
            if (geo.IsFailure)
            {
                return geo.Error!;
            }

            home = geo.Value;
        }

        return (phone.Value, home);
    }
}
