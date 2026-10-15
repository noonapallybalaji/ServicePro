using ServicePro.Contracts;
using ServicePro.Contracts.Ports;
using ServicePro.Modules.ServiceRequests.Application;
using ServicePro.SharedKernel.ValueObjects;

namespace ServicePro.UnitTests.ServiceRequests;

public sealed class LiveLocationTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 15, 6, 0, 0, TimeSpan.Zero);

    private static TechnicianInfo At(DateTimeOffset? reportedAt) => new(
        Guid.NewGuid(), Guid.NewGuid(), "Priya Sharma", PhoneNumber.FromTrusted("+919800000001"), null, "AC", null, 0,
        TechnicianDutyStatus.OnJob, GeoLocation.Create(17.4435, 78.3772).Value, reportedAt);

    [Theory]
    [InlineData(0.1, 5)]
    [InlineData(2.5, 15)]
    [InlineData(10, 45)]
    public void The_estimate_is_rounded_up_to_five_minutes(double km, int minutes) =>
        LiveLocation.EtaMinutes(km).ShouldBe(minutes);

    [Fact]
    public void An_old_report_is_not_shown()
    {
        LiveLocation.For(At(Now.AddMinutes(-2)), null, Now).ShouldNotBeNull();
        LiveLocation.For(At(Now.AddMinutes(-11)), null, Now).ShouldBeNull();
        LiveLocation.For(At(null), null, Now).ShouldBeNull();
    }
}
