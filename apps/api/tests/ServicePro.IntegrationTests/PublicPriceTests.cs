using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using ServicePro.Api.Hosting;
using ServicePro.BuildingBlocks.Web;
using ServicePro.IntegrationTests.Infrastructure;
using ServicePro.Modules.Catalog.Application;

namespace ServicePro.IntegrationTests;

/// <summary>Typical prices reach customers only when the owner turns them on, and only active items.</summary>
[Collection(TimeTravelCollection.Name)]
public sealed class PublicPriceTests(ApiFactory factory)
{
    [Fact]
    public async Task Prices_are_hidden_until_the_owner_turns_them_on_and_inactive_items_never_show()
    {
        var owner = await new TestApi(factory).AsOwnerAsync();
        var tv = await owner.CategoryAsync("TV");
        var issue = tv.IssueTypes[0];
        await owner.PostAsync<IdResponse>("/api/v1/admin/catalog/price-list", new SavePriceListItemRequest(tv.Id, issue.Id, "Backlight strip replacement", 1800, 3500));
        await owner.PostAsync<IdResponse>("/api/v1/admin/catalog/price-list", new SavePriceListItemRequest(tv.Id, null, "Old item no longer offered", 100, 200, IsActive: false));

        var anonymous = new TestApi(factory);
        var path = $"/api/v1/catalog/public-prices?categoryId={tv.Id}";
        (await anonymous.GetAsync<List<PublicPriceResponse>>(path)).ShouldBeEmpty();

        await SetAsync(owner, true);
        try
        {
            var prices = await anonymous.GetAsync<List<PublicPriceResponse>>(path);
            prices.ShouldContain(p => p.ItemName == "Backlight strip replacement" && p.PriceMin == 1800 && p.IssueTypeId == issue.Id);
            prices.ShouldNotContain(p => p.ItemName == "Old item no longer offered");
        }
        finally
        {
            await SetAsync(owner, false);
        }
    }

    private static async Task SetAsync(TestApi owner, bool on) =>
        (await owner.Client.PutAsJsonAsync("/api/v1/admin/settings/catalog.show_prices_to_customers", new UpdateSettingRequest(JsonSerializer.SerializeToElement(on)), TestApi.Json))
            .StatusCode.ShouldBe(HttpStatusCode.NoContent);
}
