using ServicePro.Contracts;
using ServicePro.SharedKernel.Domain;

namespace ServicePro.Modules.Technicians.Domain;

/*
 * Where a technician was and what they did, for the office (live map, day history). Positions are
 * kept 30 days; the activity log (duty changes, app connections) is kept with the technician.
 */

/// <summary>One position reported by the technician app while on duty.</summary>
public sealed class TechnicianLocationPoint : TenantOwnedEntity
{
    private TechnicianLocationPoint()
    {
    }

    public TechnicianLocationPoint(Guid technicianId, double latitude, double longitude, DateTimeOffset recordedAt)
    {
        TechnicianId = technicianId;
        Latitude = latitude;
        Longitude = longitude;
        RecordedAt = recordedAt;
    }

    /// <summary>How long positions are kept.</summary>
    public static readonly TimeSpan KeepFor = TimeSpan.FromDays(30);

    public Guid TechnicianId { get; private set; }

    public double Latitude { get; private set; }

    public double Longitude { get; private set; }

    public DateTimeOffset RecordedAt { get; private set; }
}

public enum TechnicianActivityKind
{
    /// <summary>Duty status changed (on duty, on a job, available, off duty).</summary>
    DutyChanged,

    /// <summary>The technician app connected to the office (opened, or back online).</summary>
    AppConnected,

    /// <summary>The technician app disconnected (closed, no signal, phone asleep).</summary>
    AppDisconnected,
}

/// <summary>One entry in a technician's activity log.</summary>
public sealed class TechnicianActivity : TenantOwnedEntity
{
    private TechnicianActivity()
    {
    }

    public TechnicianActivity(Guid technicianId, TechnicianActivityKind kind, TechnicianDutyStatus? dutyStatus, DateTimeOffset at)
    {
        TechnicianId = technicianId;
        Kind = kind;
        DutyStatus = dutyStatus;
        At = at;
    }

    public Guid TechnicianId { get; private set; }

    public TechnicianActivityKind Kind { get; private set; }

    /// <summary>The new status, for <see cref="TechnicianActivityKind.DutyChanged"/>.</summary>
    public TechnicianDutyStatus? DutyStatus { get; private set; }

    public DateTimeOffset At { get; private set; }
}
