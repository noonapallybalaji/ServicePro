using ServicePro.SharedKernel.ValueObjects;

namespace ServicePro.UnitTests.SharedKernel;

public sealed class PhoneNumberTests
{
    [Theory]
    [InlineData("9876543210")]
    [InlineData("98765 43210")]
    [InlineData("+91 98765-43210")]
    [InlineData("919876543210")]
    [InlineData("09876543210")]
    [InlineData("0919876543210")]
    public void Normalises_common_indian_formats_to_e164(string raw) =>
        PhoneNumber.Create(raw).Value.Value.ShouldBe("+919876543210");

    [Theory]
    [InlineData("")]
    [InlineData("12345")]
    [InlineData("5876543210")] // Indian mobiles start with 6-9
    [InlineData("98765432100")]
    public void Rejects_invalid_numbers(string raw) =>
        PhoneNumber.Create(raw).IsFailure.ShouldBeTrue();

    [Fact]
    public void Masks_all_but_a_recognisable_part() =>
        PhoneNumber.Create("9876543210").Value.Masked().ShouldBe("+91 98••• ••210");
}

public sealed class GeoLocationTests
{
    [Fact]
    public void Haversine_distance_matches_known_city_distance()
    {
        var kondapur = GeoLocation.Create(17.4600, 78.3650).Value;
        var madhapur = GeoLocation.Create(17.4486, 78.3908).Value;

        kondapur.DistanceKmTo(madhapur).ShouldBe(3.0, tolerance: 0.3);
        kondapur.DistanceKmTo(kondapur).ShouldBe(0);
    }

    [Theory]
    [InlineData(91, 0)]
    [InlineData(0, 181)]
    [InlineData(double.NaN, 0)]
    public void Rejects_out_of_range_coordinates(double lat, double lon) =>
        GeoLocation.Create(lat, lon).IsFailure.ShouldBeTrue();
}
