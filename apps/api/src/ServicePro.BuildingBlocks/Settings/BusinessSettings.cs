namespace ServicePro.BuildingBlocks.Settings;

/// <summary>Business-wide settings shared by several modules.</summary>
public static class BusinessSettings
{
    public static readonly SettingDefinition<string> TimeZone = new(
        "business.time_zone",
        "Asia/Kolkata",
        "Time zone used for 'today' on dashboards, schedules and matching.");

    public static async Task<TimeZoneInfo> GetTimeZoneAsync(this ISettingsStore settings, CancellationToken ct) =>
        ResolveTimeZone(await settings.GetAsync(TimeZone, ct));

    public static TimeZoneInfo ResolveTimeZone(string id) =>
        TimeZoneInfo.TryFindSystemTimeZoneById(id, out var zone) ? zone : TimeZoneInfo.Utc;

    /// <summary>[start, end) in UTC of the local calendar day containing <paramref name="instant"/>.</summary>
    public static (DateTimeOffset Start, DateTimeOffset End) LocalDay(DateTimeOffset instant, TimeZoneInfo zone) =>
        LocalDay(DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(instant, zone).DateTime), zone);

    /// <summary>[start, end) in UTC of a local calendar day.</summary>
    public static (DateTimeOffset Start, DateTimeOffset End) LocalDay(DateOnly date, TimeZoneInfo zone)
    {
        var midnight = date.ToDateTime(TimeOnly.MinValue);
        var start = new DateTimeOffset(midnight, zone.GetUtcOffset(midnight));
        return (start.ToUniversalTime(), start.AddDays(1).ToUniversalTime());
    }

    public static DateOnly Today(DateTimeOffset now, TimeZoneInfo zone) =>
        DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(now, zone).DateTime);
}
