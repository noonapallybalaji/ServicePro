using ServicePro.IntegrationTests.Infrastructure;
using ServicePro.Modules.Customers.Application;
using ServicePro.Modules.Identity.Application;

namespace ServicePro.IntegrationTests;

/// <summary>Customers changing their own sign-in number, proven by a code sent to the new number.</summary>
public sealed class ChangePhoneTests(ApiFactory factory)
{
    [Fact]
    public async Task A_verified_new_number_becomes_the_sign_in_number()
    {
        var (_, customer, _) = await CustomerChangesTests.JobWithSignedInCustomerAsync(factory, accepted: false);
        var oldPhone = (await customer.GetAsync<AccountResponse>("/api/v1/account")).Phone;
        var newPhone = TestApi.RandomPhone();

        var code = await customer.PostAsync<PhoneChangeCodeResponse>("/api/v1/account/phone/code", new PhoneChangeCodeRequest(newPhone));
        var account = await customer.PostAsync<AccountResponse>("/api/v1/account/phone", new ChangePhoneRequest(newPhone, code.DevelopmentCode!));

        account.Phone.ShouldEndWith(newPhone[^10..]);
        // The new number signs in to the same bookings; the old one no longer does.
        var api = new TestApi(factory);
        var c1 = await api.PostAsync<OtpRequestedResponse>("/api/v1/customer-auth/code", new CustomerCodeRequest(newPhone));
        ((int)(await api.PostRawAsync("/api/v1/customer-auth/verify", new CustomerVerifyRequest(newPhone, c1.DevelopmentCode!, true))).StatusCode).ShouldBe(200);
        var c2 = await api.PostAsync<OtpRequestedResponse>("/api/v1/customer-auth/code", new CustomerCodeRequest(oldPhone));
        ((int)(await api.PostRawAsync("/api/v1/customer-auth/verify", new CustomerVerifyRequest(oldPhone, c2.DevelopmentCode!, true))).StatusCode).ShouldBe(404);
    }

    [Fact]
    public async Task Another_accounts_number_or_a_wrong_code_changes_nothing()
    {
        var (_, someone, _) = await CustomerChangesTests.JobWithSignedInCustomerAsync(factory, accepted: false);
        var theirPhone = (await someone.GetAsync<AccountResponse>("/api/v1/account")).Phone;
        var (_, customer, _) = await CustomerChangesTests.JobWithSignedInCustomerAsync(factory, accepted: false);
        var before = (await customer.GetAsync<AccountResponse>("/api/v1/account")).Phone;

        (await TestApi.ProblemAsync(await customer.PostRawAsync("/api/v1/account/phone/code", new PhoneChangeCodeRequest(theirPhone)))).Code.ShouldBe("account.phone_in_use");
        (await TestApi.ProblemAsync(await customer.PostRawAsync("/api/v1/account/phone/code", new PhoneChangeCodeRequest(before)))).Code.ShouldBe("account.phone_unchanged");

        var newPhone = TestApi.RandomPhone();
        await customer.PostAsync<PhoneChangeCodeResponse>("/api/v1/account/phone/code", new PhoneChangeCodeRequest(newPhone));
        ((int)(await customer.PostRawAsync("/api/v1/account/phone", new ChangePhoneRequest(newPhone, "000000"))).StatusCode).ShouldBe(400);
        (await customer.GetAsync<AccountResponse>("/api/v1/account")).Phone.ShouldBe(before);
    }
}
