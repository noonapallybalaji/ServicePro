using System.Text.RegularExpressions;
using ServicePro.BuildingBlocks.Application;

namespace ServicePro.Modules.Catalog.Application;

/*
 * "Detect my location" on the customer site: the device's position is turned into a PIN code
 * (reverse geocoding), and the PIN code into serviceability. Service areas are lists of PIN codes,
 * so the PIN code stays the single source of truth; the geocoder only spares the customer typing.
 * Providers sit behind IReverseGeocoder (ADR 0009); without one the customer types the PIN code.
 *
 * Map postcodes are volunteer data and sometimes wrong (a whole Madhapur neighbourhood is tagged
 * 800081, a Bihar code, instead of 500081). So a postcode is only used when its first digit matches
 * the state's postal zone; otherwise nearby points are tried, and failing that the customer types it.
 */

/// <summary>What a reverse geocoder found at a point. Pincode is null when it couldn't tell.</summary>
public sealed record ReverseGeocodeResult(string? Pincode, string? Locality, string? City, string? State = null);

public interface IReverseGeocoder
{
    /// <summary>True when a provider is configured; false means the customer must type the PIN code.</summary>
    bool IsAvailable { get; }

    /// <summary>Null when the provider couldn't be reached; a result with no pincode when it found none.</summary>
    Task<ReverseGeocodeResult?> ReverseAsync(double latitude, double longitude, CancellationToken ct);
}

/// <summary>No provider configured: the site asks for the PIN code instead.</summary>
internal sealed class NullReverseGeocoder : IReverseGeocoder
{
    public bool IsAvailable => false;

    public Task<ReverseGeocodeResult?> ReverseAsync(double latitude, double longitude, CancellationToken ct) =>
        Task.FromResult<ReverseGeocodeResult?>(null);
}

public sealed record LocateRequest(double Latitude, double Longitude);

/// <summary>
/// Located: a provider answered. Pincode is what it found (null if nothing trustworthy); serviceability
/// is then checked exactly as for a typed PIN code.
/// </summary>
public sealed record LocatedServiceabilityResponse(bool Located, string? Pincode, string? Locality, bool IsServiceable, IReadOnlyList<string> Areas);

public sealed partial class LocateServiceability(IReverseGeocoder geocoder, CheckServiceability serviceability) : IUseCase
{
    /// <summary>
    /// Where to look when the postcode at the point is missing or implausible: about 250 m, then about
    /// 600 m away, in the four directions. Each look is one provider call (they are rate limited).
    /// </summary>
    private static readonly (double Lat, double Lng)[] Nearby =
    [
        (0.0025, 0), (-0.0025, 0), (0, 0.0025), (0, -0.0025),
        (0.0055, 0), (-0.0055, 0), (0, 0.0055), (0, -0.0055),
    ];

    public async Task<LocatedServiceabilityResponse> HandleAsync(LocateRequest request, CancellationToken ct)
    {
        var found = geocoder.IsAvailable ? await geocoder.ReverseAsync(request.Latitude, request.Longitude, ct) : null;
        if (found is null)
        {
            return new LocatedServiceabilityResponse(false, null, null, false, []);
        }

        var pincode = Plausible(found);
        foreach (var (dLat, dLng) in Nearby)
        {
            if (pincode is not null)
            {
                break;
            }

            var near = await geocoder.ReverseAsync(request.Latitude + dLat, request.Longitude + dLng, ct);
            pincode = near is null ? null : Plausible(near with { State = near.State ?? found.State });
        }

        if (pincode is null)
        {
            return new LocatedServiceabilityResponse(true, null, found.Locality, false, []);
        }

        var check = await serviceability.HandleAsync(pincode, ct);
        return new LocatedServiceabilityResponse(true, pincode, found.Locality, check.IsServiceable, check.Areas);
    }

    /// <summary>A well-formed Indian PIN code whose postal zone matches the state, else null.</summary>
    internal static string? Plausible(ReverseGeocodeResult result)
    {
        var pincode = result.Pincode?.Replace(" ", string.Empty, StringComparison.Ordinal);
        if (pincode is null || !IndianPincode().IsMatch(pincode))
        {
            return null;
        }

        return PostalZones.FirstDigitFor(result.State) is { } zone && pincode[0] != zone ? null : pincode;
    }

    [GeneratedRegex("^[1-9][0-9]{5}$")]
    private static partial Regex IndianPincode();
}

/// <summary>
/// India Post's postal zones: the first digit of every PIN code in a state. Used only to reject
/// map postcodes that can't belong to the state they're in.
/// </summary>
internal static class PostalZones
{
    private static readonly Dictionary<string, char> ByState = new(StringComparer.OrdinalIgnoreCase)
    {
        ["Delhi"] = '1', ["Haryana"] = '1', ["Punjab"] = '1', ["Himachal Pradesh"] = '1', ["Jammu and Kashmir"] = '1', ["Ladakh"] = '1', ["Chandigarh"] = '1',
        ["Uttar Pradesh"] = '2', ["Uttarakhand"] = '2',
        ["Rajasthan"] = '3', ["Gujarat"] = '3', ["Dadra and Nagar Haveli and Daman and Diu"] = '3',
        ["Maharashtra"] = '4', ["Goa"] = '4', ["Madhya Pradesh"] = '4', ["Chhattisgarh"] = '4',
        ["Telangana"] = '5', ["Andhra Pradesh"] = '5', ["Karnataka"] = '5',
        ["Tamil Nadu"] = '6', ["Kerala"] = '6', ["Puducherry"] = '6', ["Lakshadweep"] = '6',
        ["West Bengal"] = '7', ["Odisha"] = '7', ["Assam"] = '7', ["Arunachal Pradesh"] = '7', ["Manipur"] = '7', ["Meghalaya"] = '7',
        ["Mizoram"] = '7', ["Nagaland"] = '7', ["Tripura"] = '7', ["Sikkim"] = '7', ["Andaman and Nicobar Islands"] = '7',
        ["Bihar"] = '8', ["Jharkhand"] = '8',
    };

    /// <summary>The state's first PIN digit, or null when the state is unknown (then nothing is rejected).</summary>
    public static char? FirstDigitFor(string? state) =>
        state is not null && ByState.TryGetValue(state.Trim(), out var digit) ? digit : null;
}
