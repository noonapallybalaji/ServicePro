using System.Globalization;
using System.Net.Http.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging;
using ServicePro.Modules.Catalog.Application;

namespace ServicePro.Modules.Catalog.Infrastructure;

public sealed class GeocodingOptions
{
    public const string Section = "Geocoding";

    /// <summary>"OpenStreetMap" (default) or "None" (the customer types the PIN code).</summary>
    public string Provider { get; set; } = "OpenStreetMap";

    public OpenStreetMapOptions OpenStreetMap { get; set; } = new();
}

public sealed class OpenStreetMapOptions
{
    /// <summary>Nominatim-compatible reverse geocoding service.</summary>
    public string BaseUrl { get; set; } = "https://nominatim.openstreetmap.org";

    /// <summary>
    /// Identifies us to the service, as its usage policy requires. Defaults to the product name plus
    /// the public site address (Notifications:PublicSiteUrl).
    /// </summary>
    public string? UserAgent { get; set; }
}

/// <summary>
/// Reverse geocoding through OpenStreetMap's Nominatim (no account needed). Its usage policy allows
/// light use only: at most one request a second, an identifying User-Agent, and caching. Results are
/// cached by position rounded to ~100 m, and requests are spaced at least a second apart.
/// </summary>
internal sealed partial class OpenStreetMapGeocoder(HttpClient http, IMemoryCache cache, ILogger<OpenStreetMapGeocoder> logger) : IReverseGeocoder
{
    private static readonly SemaphoreSlim Gate = new(1, 1);
    private static DateTimeOffset nextAllowed = DateTimeOffset.MinValue;

    public bool IsAvailable => true;

    public async Task<ReverseGeocodeResult?> ReverseAsync(double latitude, double longitude, CancellationToken ct)
    {
        var key = $"geocode:{Math.Round(latitude, 3).ToString(CultureInfo.InvariantCulture)},{Math.Round(longitude, 3).ToString(CultureInfo.InvariantCulture)}";
        if (cache.TryGetValue(key, out ReverseGeocodeResult? cached))
        {
            return cached;
        }

        var url = string.Create(CultureInfo.InvariantCulture,
            $"reverse?format=jsonv2&zoom=18&addressdetails=1&accept-language=en&lat={latitude:0.######}&lon={longitude:0.######}");
        try
        {
            await Gate.WaitAsync(ct);
            try
            {
                var wait = nextAllowed - DateTimeOffset.UtcNow;
                if (wait > TimeSpan.Zero)
                {
                    await Task.Delay(wait, ct);
                }

                nextAllowed = DateTimeOffset.UtcNow.AddSeconds(1);
                var place = await http.GetFromJsonAsync<NominatimPlace>(url, ct);
                var address = place?.Address;
                var result = new ReverseGeocodeResult(
                    address?.Postcode,
                    address?.Suburb ?? address?.Neighbourhood ?? address?.CityDistrict ?? address?.Village,
                    address?.City ?? address?.Town ?? address?.StateDistrict,
                    address?.State);
                cache.Set(key, result, TimeSpan.FromDays(1));
                return result;
            }
            finally
            {
                Gate.Release();
            }
        }
        catch (Exception e) when (e is HttpRequestException or TaskCanceledException or System.Text.Json.JsonException && !ct.IsCancellationRequested)
        {
            LogLookupFailed(logger, e.Message);
            return null;
        }
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Reverse geocoding failed: {Reason}")]
    private static partial void LogLookupFailed(ILogger logger, string reason);

    private sealed record NominatimPlace([property: JsonPropertyName("address")] NominatimAddress? Address);

    private sealed record NominatimAddress(
        [property: JsonPropertyName("postcode")] string? Postcode,
        [property: JsonPropertyName("suburb")] string? Suburb,
        [property: JsonPropertyName("neighbourhood")] string? Neighbourhood,
        [property: JsonPropertyName("city_district")] string? CityDistrict,
        [property: JsonPropertyName("village")] string? Village,
        [property: JsonPropertyName("city")] string? City,
        [property: JsonPropertyName("town")] string? Town,
        [property: JsonPropertyName("state_district")] string? StateDistrict,
        [property: JsonPropertyName("state")] string? State);
}
