using Microsoft.EntityFrameworkCore;
using ServicePro.BuildingBlocks.Persistence;
using ServicePro.Contracts;
using ServicePro.Modules.Catalog.Domain;

namespace ServicePro.Modules.Catalog.Infrastructure;

/// <summary>
/// Starter catalog (PLAN.md §7.5). Categories, issues and brands are sensible defaults the owner
/// edits. Every Hyderabad pincode is served through <see cref="HyderabadPincodes"/>; the smaller demo
/// areas and prices are seeded only with demo data.
/// </summary>
internal sealed class CatalogSeeder(DbContext db) : IDataSeeder
{
    private static readonly (string Code, string Name, decimal Visit, bool Photos, (string Code, string Name, int Minutes, int Skill)[] Issues)[] Categories =
    [
        ("AC", "AC", 349, true,
        [
            ("NOT_COOLING", "Not cooling", 60, 2), ("WATER_LEAK", "Water leaking", 45, 2), ("NOISE", "Strange noise", 45, 2),
            ("GAS_REFILL", "Gas refill", 75, 3), ("INSTALLATION", "Installation / uninstallation", 120, 3),
            ("GENERAL_SERVICE", "General service", 60, 1), ("NOT_STARTING", "Not turning on", 60, 3),
        ]),
        ("TV", "Television", 349, false,
        [
            ("NO_DISPLAY", "No picture", 60, 3), ("NO_SOUND", "No sound", 45, 2), ("LINES_ON_SCREEN", "Lines on screen", 60, 4),
            ("NOT_STARTING", "Not turning on", 60, 3), ("WALL_MOUNT", "Wall mounting", 45, 1),
        ]),
        ("FRIDGE", "Refrigerator", 299, true,
        [
            ("NOT_COOLING", "Not cooling", 60, 2), ("ICE_BUILDUP", "Ice build-up", 45, 2), ("NOISE", "Strange noise", 45, 2),
            ("GAS_REFILL", "Gas refill", 90, 3), ("NOT_STARTING", "Not turning on", 60, 3),
        ]),
        ("WASHER", "Washing machine", 299, false,
        [
            ("NOT_SPINNING", "Not spinning", 60, 2), ("WATER_LEAK", "Water leaking", 45, 2), ("ERROR_CODE", "Showing an error code", 60, 3),
            ("NOISE", "Strange noise", 45, 2), ("NOT_DRAINING", "Not draining", 45, 2),
        ]),
        ("MICROWAVE", "Microwave", 249, false,
        [
            ("NOT_HEATING", "Not heating", 45, 2), ("SPARKING", "Sparking inside", 45, 3), ("BUTTONS", "Buttons not working", 45, 2),
        ]),
    ];

    private static readonly string[] Brands = ["LG", "Samsung", "Voltas", "Daikin", "Whirlpool", "Godrej", "Haier", "Sony", "Panasonic", "IFB", "Blue Star", "Lloyd"];

    private static readonly (string Name, string[] Pincodes)[] DemoAreas =
    [
        ("Kondapur & Gachibowli", ["500084", "500032"]),
        ("Madhapur & Hitech City", ["500081"]),
        ("Kukatpally & Miyapur", ["500072", "500049"]),
        ("Banjara & Jubilee Hills", ["500034", "500033"]),
    ];

    public int Order => 10;

    public async Task SeedAsync(SeedContext context, CancellationToken ct)
    {
        if (!await db.Set<ServiceCategory>().AnyAsync(ct))
        {
            var sort = 0;
            foreach (var (code, name, visit, photos, issues) in Categories)
            {
                var category = new ServiceCategory(code, name, visit, photos, sort++);
                db.Set<ServiceCategory>().Add(category);
                foreach (var issue in issues)
                {
                    db.Set<IssueType>().Add(new IssueType(category.Id, issue.Code, issue.Name, issue.Minutes, issue.Skill,
                        issue.Code == "SPARKING" ? Priority.High : Priority.Normal));
                }
            }

            db.Set<Brand>().AddRange(Brands.Select(b => new Brand(b)));
            await db.SaveChangesAsync(ct);
        }

        if (context.IncludeDemoData && !await db.Set<ServiceArea>().AnyAsync(ct))
        {
            db.Set<ServiceArea>().AddRange(DemoAreas.Select(a => new ServiceArea(a.Name, a.Pincodes)));

            var ac = await db.Set<ServiceCategory>().FirstAsync(c => c.Code == "AC", ct);
            var fridge = await db.Set<ServiceCategory>().FirstAsync(c => c.Code == "FRIDGE", ct);
            db.Set<PriceListItem>().AddRange(
                new PriceListItem(ac.Id, null, "Gas top-up (R32)", 1500, 2200),
                new PriceListItem(ac.Id, null, "Jet service (split AC)", 499, 699),
                new PriceListItem(ac.Id, null, "Capacitor replacement", 450, 750),
                new PriceListItem(fridge.Id, null, "Thermostat replacement", 650, 1100),
                new PriceListItem(fridge.Id, null, "Gas charging", 1800, 2600));
            await db.SaveChangesAsync(ct);
        }

        await SeedHyderabadZonesAsync(ct);
    }

    /// <summary>
    /// Serve all of Hyderabad, also on databases seeded before the zones existed. A zone is added once
    /// (by name) with only the pincodes no other area already has, so the owner's own areas and edits
    /// stand; a zone switched off stays off.
    /// </summary>
    private async Task SeedHyderabadZonesAsync(CancellationToken ct)
    {
        var areas = await db.Set<ServiceArea>().ToListAsync(ct);
        var names = areas.Select(a => a.Name).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var covered = areas.SelectMany(a => a.Pincodes).ToHashSet();

        foreach (var (name, pincodes) in HyderabadPincodes.Zones)
        {
            var uncovered = pincodes.Where(p => !covered.Contains(p)).ToArray();
            if (names.Contains(name) || uncovered.Length == 0)
            {
                continue;
            }

            db.Set<ServiceArea>().Add(new ServiceArea(name, uncovered));
            covered.UnionWith(uncovered);
        }

        await db.SaveChangesAsync(ct);
    }
}
