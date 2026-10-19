using ServicePro.IntegrationTests.Infrastructure;
using ServicePro.Modules.Customers.Application;
using ServicePro.Modules.ServiceRequests.Application;

namespace ServicePro.IntegrationTests;

/// <summary>Booking one of your saved addresses: used as stored, never copied, never someone else's.</summary>
public sealed class SavedAddressBookingTests(ApiFactory factory)
{
    [Fact]
    public async Task A_saved_address_is_booked_as_it_is_without_making_a_copy()
    {
        var (owner, customer, _) = await CustomerChangesTests.JobWithSignedInCustomerAsync(factory, accepted: false);
        var account = await customer.GetAsync<AccountResponse>("/api/v1/account");
        var home = account.Addresses[0];
        var category = await customer.CategoryAsync("AC");

        // The address fields sent differ (as an old screen might send): the saved one wins.
        var booking = await customer.PostAsync<OnlineBookingResponse>("/api/v1/public/bookings", new OnlineBookingRequest(category.Id, null, null, account.FullName, account.Phone, null,
            new BookingAddressRequest(null, "Something else", null, null, home.Locality, home.City, null, home.Pincode, null, null), AcceptedPolicies: true, AddressId: home.Id));

        var job = await owner.GetAsync<ServiceRequestDetail>($"/api/v1/admin/service-requests/{booking.ServiceRequestId}");
        job.AddressId.ShouldBe(home.Id);
        (await customer.GetAsync<AccountResponse>("/api/v1/account")).Addresses.Count.ShouldBe(account.Addresses.Count);
    }

    [Fact]
    public async Task Someone_elses_address_cant_be_booked()
    {
        var (_, someone, _) = await CustomerChangesTests.JobWithSignedInCustomerAsync(factory, accepted: false);
        var theirs = (await someone.GetAsync<AccountResponse>("/api/v1/account")).Addresses[0];
        var (_, customer, _) = await CustomerChangesTests.JobWithSignedInCustomerAsync(factory, accepted: false);
        var me = await customer.GetAsync<AccountResponse>("/api/v1/account");
        var category = await customer.CategoryAsync("AC");

        var refused = await customer.PostRawAsync("/api/v1/public/bookings", new OnlineBookingRequest(category.Id, null, null, me.FullName, me.Phone, null,
            new BookingAddressRequest(null, null, null, null, theirs.Locality, theirs.City, null, theirs.Pincode, null, null), AcceptedPolicies: true, AddressId: theirs.Id));

        (await TestApi.ProblemAsync(refused)).Code.ShouldBe("booking.address_invalid");
    }

    [Fact]
    public async Task An_address_can_be_saved_without_a_house_number()
    {
        var (_, customer, _) = await CustomerChangesTests.JobWithSignedInCustomerAsync(factory, accepted: false);

        var added = await customer.PostRawAsync("/api/v1/account/addresses", new AddAccountAddressRequest("Office", "", null, null, "Kondapur", "Hyderabad", "500084", false));

        ((int)added.StatusCode).ShouldBeLessThan(300);
    }

    [Fact]
    public async Task A_new_address_keeps_its_map_pin()
    {
        var (_, customer, _) = await CustomerChangesTests.JobWithSignedInCustomerAsync(factory, accepted: false);

        var account = await customer.PostAsync<AccountResponse>("/api/v1/account/addresses",
            new AddAccountAddressRequest("Work", "", null, null, "HITEC City", "Hyderabad", "500081", false, 17.4483, 78.3915));

        account.Addresses.ShouldContain(a => a.Label == "Work" && a.HasLocation);
    }
}
