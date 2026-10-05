using ServicePro.SharedKernel.Results;

namespace ServicePro.SharedKernel.ValueObjects;

/// <summary>A WGS84 point. Distance uses Haversine (ADR 0008).</summary>
public sealed record GeoLocation
{
    private const double EarthRadiusKm = 6371.0088;

    private GeoLocation(double latitude, double longitude)
    {
        Latitude = latitude;
        Longitude = longitude;
    }

    public double Latitude { get; }

    public double Longitude { get; }

    public static Result<GeoLocation> Create(double latitude, double longitude)
    {
        if (latitude is < -90 or > 90 || longitude is < -180 or > 180 || double.IsNaN(latitude) || double.IsNaN(longitude))
        {
            return Error.Validation("location.invalid", "Latitude must be within ±90 and longitude within ±180.");
        }

        return new GeoLocation(latitude, longitude);
    }

    public double DistanceKmTo(GeoLocation other)
    {
        var dLat = ToRadians(other.Latitude - Latitude);
        var dLon = ToRadians(other.Longitude - Longitude);
        var a = Math.Pow(Math.Sin(dLat / 2), 2) +
                Math.Cos(ToRadians(Latitude)) * Math.Cos(ToRadians(other.Latitude)) * Math.Pow(Math.Sin(dLon / 2), 2);
        return 2 * EarthRadiusKm * Math.Asin(Math.Min(1, Math.Sqrt(a)));
    }

    private static double ToRadians(double degrees) => degrees * Math.PI / 180;
}
