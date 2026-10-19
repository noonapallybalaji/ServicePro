using ServicePro.Modules.Catalog.Application;

namespace ServicePro.UnitTests.Catalog;

public sealed class GeocodingTests
{
    [Theory]
    [InlineData("500081", "Telangana", "500081")]
    [InlineData("500 081", "Telangana", "500081")]
    [InlineData("800081", "Telangana", null)] // a Bihar code in Hyderabad: map data error
    [InlineData("560001", "Karnataka", "560001")]
    [InlineData("800081", null, "800081")] // state unknown: nothing to check against
    [InlineData("50008", "Telangana", null)]
    [InlineData(null, "Telangana", null)]
    public void Only_postcodes_that_fit_the_state_are_trusted(string? postcode, string? state, string? expected) =>
        LocateServiceability.Plausible(new ReverseGeocodeResult(postcode, null, null, state)).ShouldBe(expected);
}
