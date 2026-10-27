using ServicePro.BuildingBlocks.Persistence;
using ServicePro.Contracts;
using ServicePro.Modules.Catalog.Application;
using ServicePro.Modules.Customers.Application;
using ServicePro.Modules.ServiceRequests.Application;
using ServicePro.Modules.Technicians.Application;
using ServicePro.Modules.Technicians.Domain;
using ServicePro.SharedKernel.Abstractions;

namespace ServicePro.Infrastructure.Seeding;

/// <summary>
/// Development demo data (Hyderabad localities), created through the real use cases so the
/// demo exercises the same rules, events and notifications as production.
/// </summary>
internal sealed class DemoDataSeeder(
    GetCatalog catalog,
    ListServiceAreas serviceAreas,
    ListTechnicians technicians,
    CreateTechnician createTechnician,
    ManageTechnicianCapabilities capabilities,
    CreateCustomer createCustomer,
    CreateServiceRequest createServiceRequest,
    IClock clock) : IDataSeeder
{
    public int Order => 100;

    public async Task SeedAsync(SeedContext context, CancellationToken ct)
    {
        if (!context.IncludeDemoData)
        {
            return;
        }

        var areas = (await serviceAreas.HandleAsync(ct)).ToDictionary(a => a.Name);
        var existing = await technicians.HandleAsync(includeInactive: true, ct);
        if (existing.Count > 0)
        {
            // Demo databases from before the city-wide zones: Anil (who covers everywhere) picks up new areas.
            if (existing.FirstOrDefault(t => t.Phone.EndsWith("9876500003", StringComparison.Ordinal)) is { } anil
                && areas.Values.Any(a => !anil.ServiceAreaIds.Contains(a.Id)))
            {
                await capabilities.SetServiceAreasAsync(anil.Id, new SetServiceAreasRequest([.. areas.Values.Select(a => a.Id)]), ct);
            }

            return;
        }

        var categories = (await catalog.HandleAsync(activeOnly: true, ct)).ToDictionary(c => c.Code);
        Guid Area(string name) => areas[name].Id;
        Guid Category(string code) => categories[code].Id;

        var team = new[]
        {
            ("Ravi Kumar", "9876500001", "T-001", 17.4600, 78.3650, new[] { ("AC", 5), ("FRIDGE", 4) }, new[] { "Kondapur & Gachibowli", "Madhapur & Hitech City", "Gachibowli, Kondapur & Madhapur" }),
            ("Suresh Reddy", "9876500002", "T-002", 17.4930, 78.3990, new[] { ("AC", 4), ("WASHER", 4) }, new[] { "Kukatpally & Miyapur", "Kondapur & Gachibowli", "Kukatpally, Miyapur & Balanagar" }),
            ("Anil Varma", "9876500003", "T-003", 17.4486, 78.3908, new[] { ("TV", 5), ("MICROWAVE", 4) }, areas.Keys.ToArray()),
            ("Priya Sharma", "9876500004", "T-004", 17.4320, 78.4070, new[] { ("FRIDGE", 4), ("WASHER", 5), ("AC", 3) }, new[] { "Banjara & Jubilee Hills", "Madhapur & Hitech City", "Banjara Hills, Jubilee Hills & Ameerpet" }),
        };

        var weekdays = new[] { DayOfWeek.Monday, DayOfWeek.Tuesday, DayOfWeek.Wednesday, DayOfWeek.Thursday, DayOfWeek.Friday, DayOfWeek.Saturday };
        foreach (var (name, phone, code, lat, lon, skills, coverage) in team)
        {
            var created = await createTechnician.HandleAsync(new CreateTechnicianRequest(
                new TechnicianProfileInput(name, phone, code, EmploymentType.Employee, 6, CommissionType.Percent, 20, lat, lon),
                [.. skills.Select(s => new SkillInput(Category(s.Item1), s.Item2))],
                [.. coverage.Select(Area)]), ct);
            if (created.IsFailure)
            {
                continue;
            }

            await capabilities.SetShiftsAsync(created.Value.Id,
                new SetShiftsRequest([.. weekdays.Select(d => new ShiftInput(d, new TimeOnly(9, 0), new TimeOnly(19, 0)))]), ct);
            if (name != "Priya Sharma")
            {
                await capabilities.SetDutyStatusAsync(created.Value.Id, new SetDutyStatusRequest(TechnicianDutyStatus.Available), ct);
            }
        }

        var customers = new[]
        {
            ("Rahul Kumar", "9123400001", "Flat 302, Sai Residency", "Near Kondapur RTO", "Kondapur", "500084", 17.4615, 78.3634, "AC", "LG", "Split AC 1.5 ton", "NOT_COOLING", "AC runs but doesn't cool for two days."),
            ("Lakshmi Devi", "9123400002", "Plot 18, Vasavi Nagar", "Behind KPHB bus stop", "Kukatpally", "500072", 17.4849, 78.4138, "FRIDGE", "Samsung", "Double door 253 L", "ICE_BUILDUP", "Thick ice in the freezer, fridge section warm."),
            ("Imran Khan", "9123400003", "H.No 8-2-293, Road 12", "Opposite Banjara Park", "Banjara Hills", "500034", 17.4156, 78.4347, "TV", "Sony", "55\" LED", "LINES_ON_SCREEN", "Vertical lines on the left side of the screen."),
            ("Sneha Reddy", "9123400004", "Tower B 1104, My Home Avatar", "Near ISB Road", "Gachibowli", "500032", 17.4239, 78.3407, "WASHER", "IFB", "Front load 7 kg", "NOT_DRAINING", "Water stays in the drum after the wash."),
            ("Venkat Rao", "9123400005", "3-45, Ayyappa Society", "Near Madhapur Metro", "Madhapur", "500081", 17.4483, 78.3915, "AC", "Voltas", "Window AC 1 ton", "WATER_LEAK", "Water dripping indoors since yesterday."),
        };

        foreach (var (name, phone, line1, landmark, locality, pincode, lat, lon, categoryCode, brand, model, issueCode, problem) in customers)
        {
            var customer = await createCustomer.HandleAsync(new CreateCustomerRequest(
                name, phone, null, null, "en", RequestChannel.Phone, null,
                new AddressInput("Home", line1, null, landmark, locality, "Hyderabad", "Telangana", pincode, lat, lon)), ct);
            if (customer.IsFailure)
            {
                continue;
            }

            var category = categories[categoryCode];
            var issue = category.IssueTypes.FirstOrDefault(i => i.Code == issueCode);
            await createServiceRequest.HandleAsync(new CreateServiceRequestRequest(
                customer.Value.Id, customer.Value.Addresses[0].Id, null, category.Id, issue?.Id,
                $"{brand} {model}: {problem}", RequestChannel.Phone, Priority.Normal,
                null, null, clock.UtcNow.AddHours(3), clock.UtcNow.AddHours(5), null, false, null), ct);
        }
    }
}
