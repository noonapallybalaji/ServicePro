using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using ServicePro.BuildingBlocks.Persistence;
using ServicePro.Contracts.Ports;
using ServicePro.Modules.Technicians.Domain;

namespace ServicePro.Modules.Technicians.Infrastructure;

internal static class TechniciansSchema
{
    public const string Name = "workforce";
}

internal sealed class TechnicianConfiguration : IEntityTypeConfiguration<Technician>
{
    public void Configure(EntityTypeBuilder<Technician> builder)
    {
        builder.ToTable("technicians", TechniciansSchema.Name);
        builder.Property(t => t.FullName).HasMaxLength(200);
        builder.Property(t => t.Phone).HasPhoneConversion();
        builder.Property(t => t.EmployeeCode).HasMaxLength(40);
        builder.Property(t => t.PhotoKey).HasMaxLength(300);
        builder.Property(t => t.CommissionValue).HasPrecision(12, 2);
        builder.Property(t => t.RatingAverage).HasPrecision(3, 2);
        builder.HasIndex(t => t.UserId).IsUnique();
        builder.HasIndex(t => new { t.TenantId, t.Phone }).IsUnique();
        builder.Ignore(t => t.HomeLocation);
        builder.Ignore(t => t.LastLocation);

        builder.HasMany(t => t.Skills).WithOne().HasForeignKey(s => s.TechnicianId).OnDelete(DeleteBehavior.Cascade);
        builder.HasMany(t => t.ServiceAreas).WithOne().HasForeignKey(a => a.TechnicianId).OnDelete(DeleteBehavior.Cascade);
        builder.HasMany(t => t.Shifts).WithOne().HasForeignKey(s => s.TechnicianId).OnDelete(DeleteBehavior.Cascade);
        builder.HasMany(t => t.TimeOff).WithOne().HasForeignKey(o => o.TechnicianId).OnDelete(DeleteBehavior.Cascade);
        foreach (var navigation in new[] { nameof(Technician.Skills), nameof(Technician.ServiceAreas), nameof(Technician.Shifts), nameof(Technician.TimeOff) })
        {
            builder.Navigation(navigation).UsePropertyAccessMode(PropertyAccessMode.Field);
        }
    }
}

internal sealed class TechnicianSkillConfiguration : IEntityTypeConfiguration<TechnicianSkill>
{
    public void Configure(EntityTypeBuilder<TechnicianSkill> builder)
    {
        builder.ToTable("technician_skills", TechniciansSchema.Name);
        builder.HasKey(s => new { s.TechnicianId, s.CategoryId });
    }
}

internal sealed class TechnicianServiceAreaConfiguration : IEntityTypeConfiguration<TechnicianServiceArea>
{
    public void Configure(EntityTypeBuilder<TechnicianServiceArea> builder)
    {
        builder.ToTable("technician_service_areas", TechniciansSchema.Name);
        builder.HasKey(a => new { a.TechnicianId, a.ServiceAreaId });
    }
}

internal sealed class TechnicianShiftConfiguration : IEntityTypeConfiguration<TechnicianShift>
{
    public void Configure(EntityTypeBuilder<TechnicianShift> builder) =>
        builder.ToTable("technician_shifts", TechniciansSchema.Name);
}

internal sealed class TechnicianTimeOffConfiguration : IEntityTypeConfiguration<TechnicianTimeOff>
{
    public void Configure(EntityTypeBuilder<TechnicianTimeOff> builder)
    {
        builder.ToTable("technician_time_off", TechniciansSchema.Name);
        builder.Property(o => o.Reason).HasMaxLength(200);
    }
}

internal sealed class TechnicianDirectory(DbContext db, ICatalogDirectory catalog) : ITechnicianDirectory
{
    public async Task<TechnicianInfo?> GetAsync(Guid technicianId, CancellationToken ct) =>
        (await GetManyAsync([technicianId], ct)).GetValueOrDefault(technicianId);

    public async Task<IReadOnlyDictionary<Guid, TechnicianInfo>> GetManyAsync(IEnumerable<Guid> technicianIds, CancellationToken ct)
    {
        var ids = technicianIds.Distinct().ToList();
        var technicians = await db.Set<Technician>().AsNoTracking()
            .Include(t => t.Skills)
            .Where(t => ids.Contains(t.Id))
            .ToListAsync(ct);
        var categories = await catalog.GetCategoriesAsync(technicians.SelectMany(t => t.Skills.Select(s => s.CategoryId)), ct);

        return technicians.ToDictionary(t => t.Id, t => new TechnicianInfo(
            t.Id, t.UserId, t.FullName, t.Phone, PhotoUrl(t), Specialty.Describe(t, categories),
            t.RatingAverage, t.CompletedJobsCount, t.DutyStatus));
    }

    public async Task<Guid?> FindIdByUserIdAsync(Guid userId, CancellationToken ct) =>
        await db.Set<Technician>().AsNoTracking()
            .Where(t => t.UserId == userId && t.IsActive)
            .Select(t => (Guid?)t.Id)
            .FirstOrDefaultAsync(ct);

    public async Task<IReadOnlyList<TechnicianDispatchProfile>> GetDispatchProfilesAsync(Guid categoryId, CancellationToken ct)
    {
        var technicians = await db.Set<Technician>().AsNoTracking()
            .Include(t => t.Skills).Include(t => t.ServiceAreas).Include(t => t.Shifts).Include(t => t.TimeOff)
            .AsSplitQuery()
            .Where(t => t.IsActive && t.Skills.Any(s => s.CategoryId == categoryId))
            .ToListAsync(ct);
        var categories = await catalog.GetCategoriesAsync(technicians.SelectMany(t => t.Skills.Select(s => s.CategoryId)), ct);

        return technicians.Select(t => new TechnicianDispatchProfile(
                t.Id,
                t.FullName,
                Specialty.Describe(t, categories),
                t.DutyStatus,
                t.Skills.FirstOrDefault(s => s.CategoryId == categoryId)?.Level,
                [.. t.ServiceAreas.Select(a => a.ServiceAreaId)],
                [.. t.Shifts.Select(s => new WeeklyShift(s.Day, s.Start, s.End))],
                [.. t.TimeOff.Select(o => new TimeOffWindow(o.StartsAt, o.EndsAt))],
                t.LastLocation,
                t.HomeLocation,
                t.MaxJobsPerDay,
                t.RatingAverage,
                t.CompletedJobsCount))
            .ToList();
    }

    public async Task<CommissionTerms?> GetCommissionTermsAsync(Guid technicianId, CancellationToken ct) =>
        await db.Set<Technician>().AsNoTracking()
            .Where(t => t.Id == technicianId)
            .Select(t => new CommissionTerms(t.CommissionType.ToString(), t.CommissionValue))
            .FirstOrDefaultAsync(ct);

    private static string? PhotoUrl(Technician t) => t.PhotoKey is null ? null : $"/api/v1/technicians/{t.Id}/photo";
}

/// <summary>"AC &amp; Refrigerator specialist" from a technician's strongest skills.</summary>
internal static class Specialty
{
    public static string Describe(Technician technician, IReadOnlyDictionary<Guid, CategoryInfo> categories)
    {
        var names = technician.Skills
            .OrderByDescending(s => s.Level)
            .Select(s => categories.TryGetValue(s.CategoryId, out var c) ? c.Name : null)
            .OfType<string>()
            .Take(2)
            .ToList();
        return names.Count == 0 ? "Technician" : $"{string.Join(" & ", names)} specialist";
    }
}
