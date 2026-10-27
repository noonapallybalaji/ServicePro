using ServicePro.IntegrationTests.Infrastructure;
using ServicePro.Modules.Catalog.Application;
using ServicePro.Modules.Technicians.Application;

namespace ServicePro.IntegrationTests;

/// <summary>Every Hyderabad pincode is served, each by one area, without disturbing areas that already existed.</summary>
public sealed class HyderabadPincodeTests(ApiFactory factory)
{
    private Task<ServiceabilityResponse> CheckAsync(string pincode) =>
        new TestApi(factory).GetAsync<ServiceabilityResponse>($"/api/v1/catalog/serviceability/{pincode}");

    [Theory]
    [InlineData("500001", "Abids, Himayatnagar & Musheerabad")] // Gandhi Bhawan
    [InlineData("500019", "Gachibowli, Kondapur & Madhapur")] // Lingampally
    [InlineData("500090", "Kukatpally, Miyapur & Balanagar")] // Nizampet, Bachupally
    [InlineData("500002", "Charminar, Attapur & Rajendranagar")]
    [InlineData("500074", "Dilsukhnagar, LB Nagar & Malakpet")]
    [InlineData("500062", "Uppal, Tarnaka & ECIL")]
    [InlineData("500101", "Secunderabad, Alwal & Kompally")] // Shameerpet side, the highest in use
    [InlineData("500081", "Madhapur & Hitech City")] // already in an area: stays there, not added twice
    public async Task A_hyderabad_pincode_is_served_by_one_area(string pincode, string area)
    {
        var check = await CheckAsync(pincode);

        check.IsServiceable.ShouldBeTrue();
        check.Areas.ShouldBe([area]);
    }

    [Theory]
    [InlineData("500021")] // not in use
    [InlineData("500102")]
    [InlineData("560001")] // Bengaluru
    public async Task Pincodes_outside_hyderabad_are_not_served(string pincode) =>
        (await CheckAsync(pincode)).IsServiceable.ShouldBeFalse();

    [Fact]
    public async Task Every_pincode_from_500001_to_500101_in_use_is_covered_once()
    {
        var owner = await new TestApi(factory).AsOwnerAsync();
        var areas = await owner.GetAsync<List<ServiceAreaResponse>>("/api/v1/catalog/service-areas");
        var pincodes = areas.Where(a => a.IsActive).SelectMany(a => a.Pincodes).Where(p => p.StartsWith("500", StringComparison.Ordinal)).ToList();

        pincodes.ShouldBeUnique();
        var expected = Enumerable.Range(1, 101).Select(n => $"500{n:000}").Except(["500021", "500071", "500099"]);
        pincodes.Order().ShouldBe(expected);
    }

    [Fact]
    public async Task Someone_covers_every_zone_so_bookings_get_a_technician()
    {
        var owner = await new TestApi(factory).AsOwnerAsync();
        var areas = await owner.GetAsync<List<ServiceAreaResponse>>("/api/v1/catalog/service-areas");
        var team = await owner.GetAsync<List<TechnicianListItem>>("/api/v1/admin/technicians");

        var covered = team.SelectMany(t => t.ServiceAreaIds).ToHashSet();
        areas.Where(a => !covered.Contains(a.Id)).Select(a => a.Name).ShouldBeEmpty();
    }
}
