using ServicePro.Modules.Technicians.Domain;
using ServicePro.SharedKernel.ValueObjects;

namespace ServicePro.UnitTests.Technicians;

public sealed class RatingTests
{
    [Fact]
    public void Ratings_keep_a_running_average_to_two_decimals()
    {
        var technician = Technician.Create(Guid.NewGuid(), "Priya Sharma", PhoneNumber.Create("9876500004").Value, "T-004", EmploymentType.Employee);
        technician.RatingAverage.ShouldBeNull();

        technician.AddRating(5);
        technician.AddRating(4);
        technician.AddRating(4);

        technician.RatingCount.ShouldBe(3);
        technician.RatingAverage.ShouldBe(4.33m);
    }
}
