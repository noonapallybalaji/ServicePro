using ServicePro.Modules.Catalog.Application;

namespace ServicePro.IntegrationTests.Infrastructure;

/// <summary>Answers reverse geocoding from a fixed table; unknown points find no PIN code, Offline simulates an outage.</summary>
public sealed class FakeGeocoder : IReverseGeocoder
{
    public bool IsAvailable => true;

    public bool Offline { get; set; }

    public Task<ReverseGeocodeResult?> ReverseAsync(double latitude, double longitude, CancellationToken ct) =>
        Task.FromResult(Offline ? null : (Math.Round(latitude, 4), Math.Round(longitude, 4)) switch
        {
            (17.4483, 78.3915) => new ReverseGeocodeResult("500 081", "Madhapur", "Hyderabad", "Telangana"),
            (12.9716, 77.5946) => new ReverseGeocodeResult("560001", "Shivaji Nagar", "Bengaluru", "Karnataka"),
            // Kavuri Hills: the map data says 800081 (a Bihar code) here and just north, south and east;
            // the point ~250 m west has the right code.
            (17.44, 78.3875) => new ReverseGeocodeResult("500081", "Madhapur", "Hyderabad", "Telangana"),
            (17.44 or 17.4425 or 17.4375, 78.39 or 78.3925) => new ReverseGeocodeResult("800081", "Kavuri Hills", "Hyderabad", "Telangana"),
            _ => new ReverseGeocodeResult(null, "Somewhere", null),
        });
}
