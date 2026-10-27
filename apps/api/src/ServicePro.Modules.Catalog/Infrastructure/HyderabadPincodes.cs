namespace ServicePro.Modules.Catalog.Infrastructure;

/// <summary>
/// Every delivery pincode in Hyderabad (India Post: Hyderabad City, Hyderabad South East, Secunderabad and
/// GPO divisions; 500001 to 500101), grouped into zones of neighbouring localities. 500021, 500071 and
/// 500099 aren't in use. The owner renames, splits or switches off zones in the dashboard.
/// </summary>
internal static class HyderabadPincodes
{
    public static readonly (string Name, string[] Pincodes)[] Zones =
    [
        ("Gachibowli, Kondapur & Madhapur",
        [
            "500008", "500019", "500031", "500032", "500046", "500050", "500075", "500081", "500084", "500089", "500091",
        ]),
        ("Kukatpally, Miyapur & Balanagar",
        [
            "500018", "500037", "500042", "500043", "500049", "500054", "500055", "500067", "500072", "500085", "500090",
        ]),
        ("Banjara Hills, Jubilee Hills & Ameerpet",
        [
            "500016", "500028", "500033", "500034", "500038", "500041", "500045", "500057", "500063", "500073", "500082", "500096",
        ]),
        ("Abids, Himayatnagar & Musheerabad",
        [
            "500001", "500004", "500006", "500012", "500013", "500020", "500022", "500027", "500029", "500044", "500080", "500095",
        ]),
        ("Charminar, Attapur & Rajendranagar",
        [
            "500002", "500005", "500023", "500024", "500030", "500048", "500052", "500053", "500064", "500065", "500066", "500077",
        ]),
        ("Dilsukhnagar, LB Nagar & Malakpet",
        [
            "500035", "500036", "500058", "500059", "500060", "500068", "500069", "500070", "500074", "500079", "500086", "500097",
        ]),
        ("Uppal, Tarnaka & ECIL",
        [
            "500007", "500017", "500039", "500040", "500051", "500062", "500076", "500083", "500087", "500088", "500092", "500093", "500098",
        ]),
        ("Secunderabad, Alwal & Kompally",
        [
            "500003", "500009", "500010", "500011", "500014", "500015", "500025", "500026", "500047", "500056", "500061", "500078", "500094", "500100", "500101",
        ]),
    ];
}
