using ServicePro.BuildingBlocks.Settings;

namespace ServicePro.Modules.Dispatch.Application;

/// <summary>Owner-tunable dispatch rules (PLAN.md §10, §16 Phase 1 "suggest mode").</summary>
public static class DispatchSettings
{
    public static readonly SettingDefinition<int> OfferTimeoutMinutes = new(
        "dispatch.offer_timeout_minutes",
        10,
        "How long a technician has to accept a job offer before it returns to the queue.");

    public static readonly SettingDefinition<double> MaxRadiusKm = new(
        "dispatch.max_radius_km",
        15,
        "Distance at which the distance score reaches zero.");

    public static readonly SettingDefinition<Dictionary<string, double>> Weights = new(
        "dispatch.weights",
        new Dictionary<string, double>
        {
            ["distance"] = 30,
            ["skill"] = 20,
            ["workload"] = 15,
            ["performance"] = 15,
            ["continuity"] = 10,
            ["fairness"] = 10,
        },
        "Points each factor contributes to a technician's match score (PLAN.md §10.2).");
}
