using ServicePro.BuildingBlocks.Settings;

namespace ServicePro.Modules.Billing.Application;

public static class BillingSettings
{
    public static readonly SettingDefinition<decimal> GstRatePercent = new(
        "billing.gst_rate_percent",
        0m,
        "GST added to bills, in percent. Leave at 0 if the business isn't GST-registered.");

    public static readonly SettingDefinition<string> BusinessName = new(
        "business.name",
        "ServicePro Appliance Care",
        "Business name printed on bills.");

    public static readonly SettingDefinition<string> BusinessContact = new(
        "business.contact",
        string.Empty,
        "Phone / address line printed on bills.");

    public static readonly SettingDefinition<string> Gstin = new(
        "business.gstin",
        string.Empty,
        "GSTIN printed on bills when registered.");
}
