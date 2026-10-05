using ServicePro.BuildingBlocks.Settings;

namespace ServicePro.Modules.ServiceRequests.Application;

/// <summary>Operational settings the owner can tune (PLAN.md §2.5).</summary>
public static class OpsSettings
{
    public static readonly SettingDefinition<int> StuckAfterMinutes = new(
        "ops.stuck_after_minutes",
        180,
        "Flag a job as stuck when its status hasn't changed for this many minutes.");
}
