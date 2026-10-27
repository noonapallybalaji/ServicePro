using Microsoft.EntityFrameworkCore;
using ServicePro.BuildingBlocks.Application;
using ServicePro.BuildingBlocks.Messaging;
using ServicePro.Contracts;
using ServicePro.Contracts.Events;
using ServicePro.Contracts.Ports;
using ServicePro.Modules.Technicians.Domain;
using ServicePro.SharedKernel.Abstractions;
using ServicePro.SharedKernel.Results;

namespace ServicePro.Modules.Technicians.Application;

/*
 * The office's view of its technicians in the field: where each one is right now (live map), who is
 * online, and what happened on a given day (duty timeline, hours on duty, route). The technician app
 * reports positions only while on duty, so the office never tracks anyone off duty.
 */

internal static class Presence
{
    /// <summary>The app reports every 2 minutes on duty (30 s on the way to a job): silent longer than this is offline.</summary>
    public static readonly TimeSpan OnlineWindow = TimeSpan.FromMinutes(5);

    public static readonly TimeZoneInfo India = TimeZoneInfo.FindSystemTimeZoneById("Asia/Kolkata");
}

/// <summary>Records the technician app connecting and disconnecting (called by the live channel).</summary>
public sealed class TechnicianPresence(DbContext db, IClock clock) : ITechnicianPresence
{
    public Task AppConnectedAsync(Guid technicianId, CancellationToken ct) => RecordAsync(technicianId, TechnicianActivityKind.AppConnected, ct);

    public Task AppDisconnectedAsync(Guid technicianId, CancellationToken ct) => RecordAsync(technicianId, TechnicianActivityKind.AppDisconnected, ct);

    private async Task RecordAsync(Guid technicianId, TechnicianActivityKind kind, CancellationToken ct)
    {
        var technician = await db.Set<Technician>().FirstOrDefaultAsync(t => t.Id == technicianId, ct);
        if (technician is null)
        {
            return;
        }

        var now = clock.UtcNow;
        if (kind == TechnicianActivityKind.AppConnected)
        {
            technician.MarkSeen(now);
        }

        db.Set<TechnicianActivity>().Add(new TechnicianActivity(technicianId, kind, null, now));
        await db.SaveChangesAsync(ct);
    }
}

/// <summary>Every duty change (by the technician, the office or automatically on a job) goes into the activity log.</summary>
public sealed class RecordDutyChange(DbContext db, IClock clock) : IEventHandler<TechnicianDutyChanged>
{
    public Task HandleAsync(TechnicianDutyChanged e, CancellationToken ct)
    {
        db.Set<TechnicianActivity>().Add(new TechnicianActivity(e.TechnicianId, TechnicianActivityKind.DutyChanged, e.DutyStatus, clock.UtcNow));
        return Task.CompletedTask;
    }
}

// ── Live map ────────────────────────────────────────────────────────────────

public sealed record TechnicianLiveResponse(
    Guid Id,
    string FullName,
    string Phone,
    TechnicianDutyStatus DutyStatus,
    bool Online,
    DateTimeOffset? LastSeenAt,
    double? Latitude,
    double? Longitude,
    DateTimeOffset? LocationAt);

public sealed class ListLiveTechnicians(DbContext db, IClock clock) : IUseCase
{
    public async Task<IReadOnlyList<TechnicianLiveResponse>> HandleAsync(CancellationToken ct)
    {
        var now = clock.UtcNow;
        var technicians = await db.Set<Technician>().AsNoTracking().Where(t => t.IsActive).OrderBy(t => t.FullName).ToListAsync(ct);
        return technicians.Select(t => new TechnicianLiveResponse(
            t.Id, t.FullName, t.Phone.Value, t.DutyStatus,
            t.LastSeenAt is { } seen && now - seen <= Presence.OnlineWindow,
            t.LastSeenAt, t.LastLatitude, t.LastLongitude, t.LastLocationAt)).ToList();
    }
}

// ── One day of activity ─────────────────────────────────────────────────────

public sealed record TechnicianActivityEntry(TechnicianActivityKind Kind, TechnicianDutyStatus? DutyStatus, DateTimeOffset At);

public sealed record TechnicianTrailPoint(double Latitude, double Longitude, DateTimeOffset At);

public sealed record TechnicianActivityDayResponse(
    DateOnly Date,
    int OnDutyMinutes,
    DateTimeOffset? FirstSeenAt,
    DateTimeOffset? LastSeenAt,
    TechnicianDutyStatus StatusAtStart,
    IReadOnlyList<TechnicianActivityEntry> Events,
    IReadOnlyList<TechnicianTrailPoint> Trail);

public sealed class GetTechnicianActivityDay(DbContext db, IClock clock) : IUseCase
{
    public async Task<Result<TechnicianActivityDayResponse>> HandleAsync(Guid technicianId, DateOnly? date, CancellationToken ct)
    {
        if (!await db.Set<Technician>().AnyAsync(t => t.Id == technicianId, ct))
        {
            return Error.NotFound("technician.not_found", "Technician not found.");
        }

        var now = clock.UtcNow;
        var day = date ?? DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(now, Presence.India).DateTime);
        var start = new DateTimeOffset(day.ToDateTime(TimeOnly.MinValue), Presence.India.GetUtcOffset(day.ToDateTime(TimeOnly.MinValue))).ToUniversalTime();
        var end = start.AddDays(1);

        var events = await db.Set<TechnicianActivity>().AsNoTracking()
            .Where(a => a.TechnicianId == technicianId && a.At >= start && a.At < end)
            .OrderBy(a => a.At).ThenBy(a => a.Id)
            .Select(a => new TechnicianActivityEntry(a.Kind, a.DutyStatus, a.At))
            .ToListAsync(ct);
        var trail = await db.Set<TechnicianLocationPoint>().AsNoTracking()
            .Where(p => p.TechnicianId == technicianId && p.RecordedAt >= start && p.RecordedAt < end)
            .OrderBy(p => p.RecordedAt)
            .Select(p => new TechnicianTrailPoint(p.Latitude, p.Longitude, p.RecordedAt))
            .ToListAsync(ct);

        // Status when the day began: the last duty change before it (off duty if none).
        var before = await db.Set<TechnicianActivity>().AsNoTracking()
            .Where(a => a.TechnicianId == technicianId && a.Kind == TechnicianActivityKind.DutyChanged && a.At < start)
            .OrderByDescending(a => a.At).Select(a => a.DutyStatus).FirstOrDefaultAsync(ct);
        var statusAtStart = before ?? TechnicianDutyStatus.OffDuty;

        // Minutes on duty (available or on a job) between the start of the day and its end (or now).
        var until = now < end ? now : end;
        var minutes = 0.0;
        var status = statusAtStart;
        var since = start;
        foreach (var change in events.Where(e => e.Kind == TechnicianActivityKind.DutyChanged && e.DutyStatus is not null))
        {
            if (status != TechnicianDutyStatus.OffDuty)
            {
                minutes += (change.At - since).TotalMinutes;
            }

            status = change.DutyStatus!.Value;
            since = change.At;
        }

        if (status != TechnicianDutyStatus.OffDuty && until > since)
        {
            minutes += (until - since).TotalMinutes;
        }

        var seen = events.Where(e => e.Kind == TechnicianActivityKind.AppConnected).Select(e => e.At).Concat(trail.Select(p => p.At)).ToList();
        return new TechnicianActivityDayResponse(
            day, (int)Math.Round(Math.Max(0, minutes)),
            seen.Count > 0 ? seen.Min() : null, seen.Count > 0 ? seen.Max() : null,
            statusAtStart, events, trail);
    }
}
