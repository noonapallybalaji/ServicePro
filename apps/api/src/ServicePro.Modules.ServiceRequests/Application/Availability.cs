using System.Globalization;
using Microsoft.EntityFrameworkCore;
using ServicePro.BuildingBlocks.Application;
using ServicePro.BuildingBlocks.Settings;
using ServicePro.Contracts.Ports;
using ServicePro.Modules.ServiceRequests.Domain;
using ServicePro.SharedKernel.Abstractions;
using ServicePro.SharedKernel.Results;

namespace ServicePro.Modules.ServiceRequests.Application;

/*
 * Real slot availability (gap analysis 3.2): customers only see visit windows we can serve.
 * A window has room when the technicians who could take the job (right skill, cover the
 * pincode, on shift, not on leave) have fewer jobs in it than they can handle. Counts are an
 * estimate the office can still override; they are never shown to customers. There is no
 * hold while the customer books: the booking itself re-checks, and a window that filled up
 * in the meantime is refused politely.
 */

/// <summary>One bookable visit window, in the business's local time ("09:00" to "12:00").</summary>
public sealed record BookingWindow(string Id, string Label, string Start, string End);

public static class AvailabilitySettings
{
    public static readonly SettingDefinition<List<BookingWindow>> Windows = new(
        "booking.windows",
        [
            new("morning", "Morning", "09:00", "12:00"),
            new("afternoon", "Afternoon", "12:00", "15:00"),
            new("evening", "Evening", "15:00", "18:00"),
        ],
        "Visit windows customers can choose from, in local time.");

    public static readonly SettingDefinition<int> DaysAhead = new(
        "booking.days_ahead",
        7,
        "How many days ahead customers can book (today included).");

    public static readonly SettingDefinition<int> LeadTimeMinutes = new(
        "booking.lead_time_minutes",
        120,
        "A window must start at least this many minutes from now to be bookable.");

    public static readonly SettingDefinition<int> JobsPerTechnicianPerWindow = new(
        "booking.jobs_per_technician_per_window",
        2,
        "How many visits one technician can do in one window. Capacity = available technicians × this.");

    public static readonly SettingDefinition<bool> CapacityCheck = new(
        "booking.capacity_check",
        true,
        "Only offer and accept windows where enough technicians are free. Off: every window is offered and bookings can be for any time.");
}

public sealed record AvailabilitySlot(string Id, string Label, DateTimeOffset Start, DateTimeOffset End, bool Available);

public sealed record AvailabilityDay(DateOnly Date, IReadOnlyList<AvailabilitySlot> Slots);

public sealed record AvailabilityResponse(IReadOnlyList<AvailabilityDay> Days);

internal static class AvailabilityErrors
{
    public static readonly Error Full = Error.Conflict("booking.slot_full", "That time just filled up. Please choose another time.");
    public static readonly Error OutsideWindows = Error.Validation("booking.slot_invalid", "Choose one of the visit times we offer.");
}

public sealed class SlotAvailability(
    DbContext db,
    ISettingsStore settings,
    ITechnicianDirectory technicians,
    ICatalogDirectory catalog,
    ICustomerDirectory customers,
    IClock clock)
{
    public async Task<AvailabilityResponse> GetAsync(Guid categoryId, string pincode, Guid? excludeServiceRequestId, CancellationToken ct)
    {
        var zone = await settings.GetTimeZoneAsync(ct);
        var now = clock.UtcNow;
        var windows = await settings.GetAsync(AvailabilitySettings.Windows, ct);
        var daysAhead = Math.Clamp(await settings.GetAsync(AvailabilitySettings.DaysAhead, ct), 1, 30);
        var lead = TimeSpan.FromMinutes(await settings.GetAsync(AvailabilitySettings.LeadTimeMinutes, ct));
        var today = BusinessSettings.Today(now, zone);

        var slots = Enumerable.Range(0, daysAhead)
            .Select(offset => today.AddDays(offset))
            .Select(date => (Date: date, Slots: windows.Select(w => Slot(date, w, zone)).ToList()))
            .ToList();

        var capacity = await CapacityAsync(categoryId, pincode, slots.SelectMany(d => d.Slots).ToList(), excludeServiceRequestId, ct);
        return new AvailabilityResponse([.. slots.Select(day => new AvailabilityDay(
            day.Date,
            [.. day.Slots.Select(s => s with { Available = s.Start - now >= lead && capacity(s) })]))]);
    }

    /// <summary>
    /// Is there room for a visit in [start, end)? Website bookings send one of our windows; the
    /// WhatsApp assistant may send any range, which is fine if a window overlapping it has room.
    /// </summary>
    public async Task<Error?> CheckAsync(Guid categoryId, string pincode, DateTimeOffset start, DateTimeOffset end, Guid? excludeServiceRequestId, CancellationToken ct)
    {
        // Off: bookings keep the basic rules only (any time in the next 30 days), as before availability existed.
        if (!await settings.GetAsync(AvailabilitySettings.CapacityCheck, ct))
        {
            return null;
        }

        var offered = await GetAsync(categoryId, pincode, excludeServiceRequestId, ct);
        var overlapping = offered.Days.SelectMany(d => d.Slots).Where(s => s.Start < end && start < s.End).ToList();
        if (overlapping.Count == 0)
        {
            return AvailabilityErrors.OutsideWindows;
        }

        return overlapping.Any(s => s.Available) ? null : AvailabilityErrors.Full;
    }

    private static AvailabilitySlot Slot(DateOnly date, BookingWindow window, TimeZoneInfo zone)
    {
        DateTimeOffset At(string time)
        {
            var local = date.ToDateTime(TimeOnly.Parse(time, CultureInfo.InvariantCulture));
            return new DateTimeOffset(local, zone.GetUtcOffset(local)).ToUniversalTime();
        }

        return new AvailabilitySlot(window.Id, window.Label, At(window.Start), At(window.End), false);
    }

    /// <summary>Builds "does this slot have room?" for the given slots in one pass.</summary>
    private async Task<Func<AvailabilitySlot, bool>> CapacityAsync(
        Guid categoryId, string pincode, IReadOnlyList<AvailabilitySlot> slots, Guid? exclude, CancellationToken ct)
    {
        if (!await settings.GetAsync(AvailabilitySettings.CapacityCheck, ct) || slots.Count == 0)
        {
            return _ => true;
        }

        var zone = await settings.GetTimeZoneAsync(ct);
        var perTechnician = Math.Max(1, await settings.GetAsync(AvailabilitySettings.JobsPerTechnicianPerWindow, ct));
        var areaIds = (await catalog.FindServiceAreaIdsByPincodeAsync(pincode.Trim(), ct)).ToHashSet();
        var eligible = (await technicians.GetDispatchProfilesAsync(categoryId, ct))
            .Where(t => t.SkillLevel is not null && t.ServiceAreaIds.Any(areaIds.Contains))
            .ToList();
        var eligibleIds = eligible.Select(t => t.Id).ToHashSet();

        // Jobs already in these windows: same appliance in this area, or anything the same technicians hold.
        var from = slots.Min(s => s.Start);
        var to = slots.Max(s => s.End);
        var finished = ServiceRequestWorkflow.Terminal.ToArray();
        var jobs = await db.Set<ServiceRequest>().AsNoTracking()
            .Where(s => !finished.Contains(s.Status) && s.Id != exclude &&
                        (s.ScheduledStart ?? s.PreferredSlotStart) >= from && (s.ScheduledStart ?? s.PreferredSlotStart) < to)
            .Select(s => new { s.CategoryId, s.AddressId, s.CurrentTechnicianId, Start = (s.ScheduledStart ?? s.PreferredSlotStart)!.Value })
            .ToListAsync(ct);
        var addresses = await customers.GetAddressesAsync(jobs.Select(j => j.AddressId).Distinct(), ct);
        var areaOfPincode = new Dictionary<string, bool>();
        async Task<bool> InAreaAsync(string jobPincode)
        {
            if (!areaOfPincode.TryGetValue(jobPincode, out var inArea))
            {
                inArea = (await catalog.FindServiceAreaIdsByPincodeAsync(jobPincode, ct)).Any(areaIds.Contains);
                areaOfPincode[jobPincode] = inArea;
            }

            return inArea;
        }

        var competing = new List<DateTimeOffset>();
        foreach (var job in jobs)
        {
            var heldByOurTechnicians = job.CurrentTechnicianId is { } techId && eligibleIds.Contains(techId);
            var sameWorkHere = job.CategoryId == categoryId && addresses.GetValueOrDefault(job.AddressId) is { } address && await InAreaAsync(address.Pincode);
            if (heldByOurTechnicians || sameWorkHere)
            {
                competing.Add(job.Start);
            }
        }

        return slot =>
        {
            var available = eligible.Count(t => IsWorking(t, slot, zone));
            var booked = competing.Count(start => start >= slot.Start && start < slot.End);
            return booked < available * perTechnician;
        };
    }

    /// <summary>Same rules as dispatch: on leave never; no shifts set means always available.</summary>
    private static bool IsWorking(TechnicianDispatchProfile technician, AvailabilitySlot slot, TimeZoneInfo zone)
    {
        if (technician.TimeOff.Any(o => o.StartsAt < slot.End && slot.Start < o.EndsAt))
        {
            return false;
        }

        if (technician.Shifts.Count == 0)
        {
            return true;
        }

        var start = TimeZoneInfo.ConvertTime(slot.Start, zone);
        var end = TimeZoneInfo.ConvertTime(slot.End, zone);
        var from = TimeOnly.FromDateTime(start.DateTime);
        var until = TimeOnly.FromDateTime(end.DateTime);
        return technician.Shifts.Any(s => s.Day == start.DayOfWeek && s.Start < until && from < s.End);
    }
}

/// <summary>Visit windows with room, for the booking form (by appliance and pincode).</summary>
public sealed class GetAvailability(SlotAvailability availability, ICatalogDirectory catalog) : IUseCase
{
    public async Task<Result<AvailabilityResponse>> HandleAsync(Guid categoryId, string pincode, CancellationToken ct)
    {
        if (await catalog.GetCategoryAsync(categoryId, ct) is null)
        {
            return Error.Validation("booking.category_invalid", "Choose what needs repairing.");
        }

        if (string.IsNullOrWhiteSpace(pincode) || (await catalog.FindServiceAreaIdsByPincodeAsync(pincode.Trim(), ct)).Count == 0)
        {
            return Error.Validation("booking.not_serviceable", "We don't cover this pincode yet. Call us and we'll try to help.");
        }

        return await availability.GetAsync(categoryId, pincode, null, ct);
    }
}

/// <summary>Windows with room for moving one of the signed-in customer's bookings (it doesn't compete with itself).</summary>
public sealed class GetMyBookingAvailability(DbContext db, ICurrentUser currentUser, ICustomerDirectory customers, SlotAvailability availability) : IUseCase
{
    public async Task<Result<AvailabilityResponse>> HandleAsync(Guid id, CancellationToken ct)
    {
        var booking = await MyBookingLookup.FindAsync(db, currentUser, id, ct);
        if (booking.IsFailure)
        {
            return booking.Error!;
        }

        var address = await customers.GetAddressAsync(booking.Value.AddressId, ct);
        return await availability.GetAsync(booking.Value.CategoryId, address?.Pincode ?? string.Empty, booking.Value.Id, ct);
    }
}
