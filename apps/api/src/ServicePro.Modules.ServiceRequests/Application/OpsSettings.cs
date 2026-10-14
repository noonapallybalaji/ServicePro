using ServicePro.BuildingBlocks.Settings;

namespace ServicePro.Modules.ServiceRequests.Application;

/// <summary>Operational settings the owner can tune (PLAN.md §2.5).</summary>
public static class OpsSettings
{
    public static readonly SettingDefinition<int> StuckAfterMinutes = new(
        "ops.stuck_after_minutes",
        180,
        "Flag a job as stuck when its status hasn't changed for this many minutes.");

    public static readonly SettingDefinition<bool> AutoConfirmWebsiteBookings = new(
        "booking.auto_confirm_website",
        false,
        "Confirm website bookings straight away (the customer verified their phone) instead of waiting for staff review.");

    public static readonly SettingDefinition<bool> AutoConfirmWhatsAppBookings = new(
        "booking.auto_confirm_whatsapp",
        false,
        "Confirm bookings made through the WhatsApp assistant straight away instead of waiting for staff review.");

    public static readonly SettingDefinition<bool> EstimateRequiredBeforeRepair = new(
        "estimates.required_before_repair",
        false,
        "Technicians must send an estimate, and the customer approve it, before starting a repair.");
}
