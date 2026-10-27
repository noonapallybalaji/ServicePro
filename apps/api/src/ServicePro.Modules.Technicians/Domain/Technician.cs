using ServicePro.BuildingBlocks.Persistence;
using ServicePro.Contracts;
using ServicePro.Contracts.Events;
using ServicePro.SharedKernel.Domain;
using ServicePro.SharedKernel.Results;
using ServicePro.SharedKernel.ValueObjects;

namespace ServicePro.Modules.Technicians.Domain;

public enum EmploymentType
{
    Employee,
    Contractor,
}

public enum CommissionType
{
    Percent,
    Fixed,
}

/// <summary>A field technician (PLAN.md §7.8). Linked 1:1 to a login user.</summary>
public sealed class Technician : TenantOwnedAggregateRoot, IAudited
{
    private readonly List<TechnicianSkill> _skills = [];
    private readonly List<TechnicianServiceArea> _serviceAreas = [];
    private readonly List<TechnicianShift> _shifts = [];
    private readonly List<TechnicianTimeOff> _timeOff = [];

    private Technician()
    {
    }

    private Technician(Guid userId, string fullName, PhoneNumber phone, string? employeeCode, EmploymentType employmentType)
    {
        UserId = userId;
        FullName = fullName.Trim();
        Phone = phone;
        EmployeeCode = employeeCode;
        EmploymentType = employmentType;
        DutyStatus = TechnicianDutyStatus.OffDuty;
        MaxJobsPerDay = 6;
        CommissionType = CommissionType.Percent;
        IsActive = true;
    }

    public Guid UserId { get; private set; }

    public string FullName { get; private set; } = string.Empty;

    public PhoneNumber Phone { get; private set; } = null!;

    public string? EmployeeCode { get; private set; }

    public EmploymentType EmploymentType { get; private set; }

    public string? PhotoKey { get; private set; }

    public double? HomeLatitude { get; private set; }

    public double? HomeLongitude { get; private set; }

    public double? LastLatitude { get; private set; }

    public double? LastLongitude { get; private set; }

    public DateTimeOffset? LastLocationAt { get; private set; }

    /// <summary>Last sign of life from the technician app (a position or a connection): "online" for the office.</summary>
    public DateTimeOffset? LastSeenAt { get; private set; }

    public TechnicianDutyStatus DutyStatus { get; private set; }

    public int MaxJobsPerDay { get; private set; }

    public CommissionType CommissionType { get; private set; }

    public decimal CommissionValue { get; private set; }

    public decimal? RatingAverage { get; private set; }

    public int RatingCount { get; private set; }

    public int CompletedJobsCount { get; private set; }

    public bool IsActive { get; private set; }

    public IReadOnlyCollection<TechnicianSkill> Skills => _skills;

    public IReadOnlyCollection<TechnicianServiceArea> ServiceAreas => _serviceAreas;

    public IReadOnlyCollection<TechnicianShift> Shifts => _shifts;

    public IReadOnlyCollection<TechnicianTimeOff> TimeOff => _timeOff;

    public GeoLocation? HomeLocation => GeoColumns.ToLocation(HomeLatitude, HomeLongitude);

    public GeoLocation? LastLocation => GeoColumns.ToLocation(LastLatitude, LastLongitude);

    public static Technician Create(Guid userId, string fullName, PhoneNumber phone, string? employeeCode, EmploymentType employmentType) =>
        new(userId, fullName, phone, employeeCode, employmentType);

    public void UpdateProfile(
        string fullName,
        PhoneNumber phone,
        string? employeeCode,
        EmploymentType employmentType,
        int maxJobsPerDay,
        CommissionType commissionType,
        decimal commissionValue,
        GeoLocation? homeLocation)
    {
        FullName = fullName.Trim();
        Phone = phone;
        EmployeeCode = string.IsNullOrWhiteSpace(employeeCode) ? null : employeeCode.Trim();
        EmploymentType = employmentType;
        MaxJobsPerDay = maxJobsPerDay;
        CommissionType = commissionType;
        CommissionValue = commissionValue;
        HomeLatitude = homeLocation?.Latitude;
        HomeLongitude = homeLocation?.Longitude;
    }

    public void SetPhoto(string photoKey) => PhotoKey = photoKey;

    public void SetActive(bool isActive)
    {
        IsActive = isActive;
        if (!isActive)
        {
            ChangeDutyStatus(TechnicianDutyStatus.OffDuty);
        }
    }

    public Result ChangeDutyStatus(TechnicianDutyStatus status)
    {
        if (!IsActive && status != TechnicianDutyStatus.OffDuty)
        {
            return Error.Conflict("technician.inactive", "Inactive technicians can't go on duty.");
        }

        if (DutyStatus == status)
        {
            return Result.Success();
        }

        DutyStatus = status;
        Raise(new TechnicianDutyChanged(Id, status));
        return Result.Success();
    }

    public void ReportLocation(GeoLocation location, DateTimeOffset at)
    {
        LastLatitude = location.Latitude;
        LastLongitude = location.Longitude;
        LastLocationAt = at;
        MarkSeen(at);
        Raise(new TechnicianLocationReported(Id, at));
    }

    public void MarkSeen(DateTimeOffset at)
    {
        if (LastSeenAt is null || at > LastSeenAt)
        {
            LastSeenAt = at;
        }
    }

    /// <summary>Applies the desired skill set as a diff, so unchanged rows are kept (no key churn).</summary>
    public void ReplaceSkills(IEnumerable<(Guid CategoryId, int Level)> skills)
    {
        var desired = skills
            .GroupBy(s => s.CategoryId)
            .ToDictionary(g => g.Key, g => Math.Clamp(g.Max(s => s.Level), 1, 5));

        _skills.RemoveAll(s => !desired.ContainsKey(s.CategoryId));
        foreach (var (categoryId, level) in desired)
        {
            var existing = _skills.FirstOrDefault(s => s.CategoryId == categoryId);
            if (existing is null)
            {
                _skills.Add(new TechnicianSkill(Id, categoryId, level));
            }
            else
            {
                existing.ChangeLevel(level);
            }
        }
    }

    public void ReplaceServiceAreas(IEnumerable<Guid> serviceAreaIds)
    {
        var desired = serviceAreaIds.ToHashSet();
        _serviceAreas.RemoveAll(a => !desired.Contains(a.ServiceAreaId));
        foreach (var areaId in desired.Where(id => _serviceAreas.All(a => a.ServiceAreaId != id)))
        {
            _serviceAreas.Add(new TechnicianServiceArea(Id, areaId));
        }
    }

    public Result ReplaceShifts(IEnumerable<(DayOfWeek Day, TimeOnly Start, TimeOnly End)> shifts)
    {
        var list = shifts.ToList();
        if (list.Any(s => s.End <= s.Start))
        {
            return Error.Validation("shift.invalid", "A shift must end after it starts.");
        }

        _shifts.Clear();
        _shifts.AddRange(list.Select(s => new TechnicianShift(Id, s.Day, s.Start, s.End)));
        return Result.Success();
    }

    public Result<TechnicianTimeOff> AddTimeOff(DateTimeOffset startsAt, DateTimeOffset endsAt, string? reason)
    {
        if (endsAt <= startsAt)
        {
            return Error.Validation("time_off.invalid", "Time off must end after it starts.");
        }

        var entry = new TechnicianTimeOff(Id, startsAt, endsAt, reason);
        _timeOff.Add(entry);
        return entry;
    }

    public Result RemoveTimeOff(Guid timeOffId) =>
        _timeOff.RemoveAll(t => t.Id == timeOffId) > 0
            ? Result.Success()
            : Error.NotFound("time_off.not_found", "That time-off entry doesn't exist.");

    /// <summary>Cached KPI, maintained from service-request events.</summary>
    public void RecordJobClosed() => CompletedJobsCount++;

    /// <summary>Folds one customer rating (1–5) into the running average.</summary>
    public void AddRating(int rating)
    {
        var total = (RatingAverage ?? 0) * RatingCount + rating;
        RatingCount++;
        RatingAverage = Math.Round(total / RatingCount, 2, MidpointRounding.AwayFromZero);
    }
}

public sealed class TechnicianSkill
{
    private TechnicianSkill()
    {
    }

    internal TechnicianSkill(Guid technicianId, Guid categoryId, int level)
    {
        TechnicianId = technicianId;
        CategoryId = categoryId;
        Level = level;
    }

    public Guid TechnicianId { get; private set; }

    public Guid CategoryId { get; private set; }

    /// <summary>1 (trainee) to 5 (expert). Compared with issue_types.min_skill_level.</summary>
    public int Level { get; private set; }

    internal void ChangeLevel(int level) => Level = level;
}

public sealed class TechnicianServiceArea
{
    private TechnicianServiceArea()
    {
    }

    internal TechnicianServiceArea(Guid technicianId, Guid serviceAreaId)
    {
        TechnicianId = technicianId;
        ServiceAreaId = serviceAreaId;
    }

    public Guid TechnicianId { get; private set; }

    public Guid ServiceAreaId { get; private set; }
}

public sealed class TechnicianShift : Entity
{
    private TechnicianShift()
    {
    }

    internal TechnicianShift(Guid technicianId, DayOfWeek day, TimeOnly start, TimeOnly end)
    {
        TechnicianId = technicianId;
        Day = day;
        Start = start;
        End = end;
    }

    public Guid TechnicianId { get; private set; }

    public DayOfWeek Day { get; private set; }

    public TimeOnly Start { get; private set; }

    public TimeOnly End { get; private set; }
}

public sealed class TechnicianTimeOff : Entity
{
    private TechnicianTimeOff()
    {
    }

    internal TechnicianTimeOff(Guid technicianId, DateTimeOffset startsAt, DateTimeOffset endsAt, string? reason)
    {
        TechnicianId = technicianId;
        StartsAt = startsAt;
        EndsAt = endsAt;
        Reason = reason;
    }

    public Guid TechnicianId { get; private set; }

    public DateTimeOffset StartsAt { get; private set; }

    public DateTimeOffset EndsAt { get; private set; }

    public string? Reason { get; private set; }
}
