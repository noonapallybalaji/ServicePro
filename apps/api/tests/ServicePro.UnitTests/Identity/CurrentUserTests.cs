using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using ServicePro.BuildingBlocks.Security;
using ServicePro.SharedKernel.Abstractions;

namespace ServicePro.UnitTests.Identity;

public sealed class CurrentUserTests
{
    private static HttpCurrentUser For(params Claim[] claims)
    {
        var context = new DefaultHttpContext { User = new ClaimsPrincipal(new ClaimsIdentity(claims, authenticationType: "test")) };
        return new HttpCurrentUser(new HttpContextAccessor { HttpContext = context });
    }

    [Fact]
    public void A_customer_token_is_never_mistaken_for_a_staff_user()
    {
        var customerId = Guid.NewGuid();
        var user = For(
            new Claim(ServiceProClaims.Subject, customerId.ToString()),
            new Claim(ServiceProClaims.Role, CustomerRole.Name),
            new Claim(ServiceProClaims.CustomerId, customerId.ToString()));

        user.CustomerId.ShouldBe(customerId);
        user.UserId.ShouldBeNull(); // audit and history must not record a customer id as a user id
        user.Role.ShouldBeNull();
        user.ToActor().ShouldBe(Actor.Customer);
    }

    [Fact]
    public void Staff_tokens_carry_no_customer_id_even_if_the_claim_is_present()
    {
        var userId = Guid.NewGuid();
        var user = For(
            new Claim(ServiceProClaims.Subject, userId.ToString()),
            new Claim(ServiceProClaims.Role, nameof(UserRole.Dispatcher)),
            new Claim(ServiceProClaims.CustomerId, Guid.NewGuid().ToString()));

        user.UserId.ShouldBe(userId);
        user.CustomerId.ShouldBeNull();
        user.ToActor().Type.ShouldBe(ActorType.User);
    }
}
