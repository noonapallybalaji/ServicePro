using ServicePro.Contracts;
using ServicePro.SharedKernel.Abstractions;

namespace ServicePro.Modules.ServiceRequests.Domain;

/// <summary>Who may perform a transition. Flags, so one rule can allow several roles.</summary>
[Flags]
public enum TransitionActors
{
    None = 0,
    Staff = 1,
    Technician = 2,
    System = 4,
    Customer = 8,
}

/// <summary>What must accompany a transition.</summary>
[Flags]
public enum TransitionRequirements
{
    None = 0,

    /// <summary>A reason code (and optional note) explains the change.</summary>
    Reason = 1,

    /// <summary>The customer's completion code, unless staff override with a reason.</summary>
    CompletionCode = 2,

    /// <summary>An after-photo, when the appliance category requires photos.</summary>
    AfterPhoto = 4,
}

public sealed record TransitionRule(
    ServiceRequestStatus From,
    ServiceRequestStatus To,
    TransitionActors Actors,
    TransitionRequirements Requirements = TransitionRequirements.None,
    bool DispatchOnly = false);

/// <summary>
/// The service-request lifecycle as one table (ADR 0003, PLAN.md §8).
/// The aggregate enforces it; the meta endpoint publishes it so clients render only legal actions.
/// Transitions into AWAITING_ESTIMATE_APPROVAL arrive with estimates in Phase 3.
/// </summary>
public static class ServiceRequestWorkflow
{
    private const TransitionActors Field = TransitionActors.Staff | TransitionActors.Technician;
    private const TransitionActors Office = TransitionActors.Staff | TransitionActors.System;

    public static readonly IReadOnlySet<ServiceRequestStatus> Terminal = new HashSet<ServiceRequestStatus>
    {
        ServiceRequestStatus.Closed,
        ServiceRequestStatus.ClosedNoRepair,
        ServiceRequestStatus.Cancelled,
    };

    /// <summary>
    /// Before the technician sets out, customers can cancel or move their own booking.
    /// After that, plans are already in motion: they call us.
    /// </summary>
    public static readonly IReadOnlySet<ServiceRequestStatus> CustomerChangeable = new HashSet<ServiceRequestStatus>
    {
        ServiceRequestStatus.New,
        ServiceRequestStatus.ReadyForAssignment,
        ServiceRequestStatus.Offered,
        ServiceRequestStatus.Accepted,
        ServiceRequestStatus.Rescheduled,
    };

    /// <summary>Statuses where a technician is physically working on the job.</summary>
    public static readonly IReadOnlySet<ServiceRequestStatus> OnSite = new HashSet<ServiceRequestStatus>
    {
        ServiceRequestStatus.Arrived,
        ServiceRequestStatus.Diagnosing,
        ServiceRequestStatus.InProgress,
    };

    public static IReadOnlyList<TransitionRule> Rules { get; } = BuildRules();

    public static TransitionRule? Find(ServiceRequestStatus from, ServiceRequestStatus to) =>
        Rules.FirstOrDefault(r => r.From == from && r.To == to);

    public static IEnumerable<TransitionRule> From(ServiceRequestStatus from) => Rules.Where(r => r.From == from);

    public static TransitionActors ToTransitionActor(ActorType actorType) => actorType switch
    {
        ActorType.User => TransitionActors.Staff,
        ActorType.Technician => TransitionActors.Technician,
        ActorType.Customer => TransitionActors.Customer,
        _ => TransitionActors.System,
    };

    private static List<TransitionRule> BuildRules()
    {
        var rules = new List<TransitionRule>
        {
            new(ServiceRequestStatus.New, ServiceRequestStatus.ReadyForAssignment, Office),

            // Dispatch module only: offers, acceptance, returning to the queue.
            new(ServiceRequestStatus.ReadyForAssignment, ServiceRequestStatus.Offered, Office, DispatchOnly: true),
            new(ServiceRequestStatus.Offered, ServiceRequestStatus.Accepted, Office | TransitionActors.Technician, DispatchOnly: true),
            new(ServiceRequestStatus.Offered, ServiceRequestStatus.ReadyForAssignment, Office | TransitionActors.Technician, DispatchOnly: true),
            new(ServiceRequestStatus.Accepted, ServiceRequestStatus.ReadyForAssignment, Office, TransitionRequirements.Reason, DispatchOnly: true),

            new(ServiceRequestStatus.Accepted, ServiceRequestStatus.EnRoute, Field),
            new(ServiceRequestStatus.Accepted, ServiceRequestStatus.Rescheduled, Field | TransitionActors.Customer, TransitionRequirements.Reason),
            new(ServiceRequestStatus.EnRoute, ServiceRequestStatus.Arrived, Field),
            new(ServiceRequestStatus.Arrived, ServiceRequestStatus.Diagnosing, Field),
            new(ServiceRequestStatus.Arrived, ServiceRequestStatus.CustomerUnavailable, Field, TransitionRequirements.Reason),
            new(ServiceRequestStatus.Diagnosing, ServiceRequestStatus.InProgress, Field),
            new(ServiceRequestStatus.Diagnosing, ServiceRequestStatus.WaitingForParts, Field, TransitionRequirements.Reason),
            new(ServiceRequestStatus.Diagnosing, ServiceRequestStatus.UnableToRepair, Field, TransitionRequirements.Reason),
            new(ServiceRequestStatus.InProgress, ServiceRequestStatus.WaitingForParts, Field, TransitionRequirements.Reason),
            new(ServiceRequestStatus.InProgress, ServiceRequestStatus.Completed, Field,
                TransitionRequirements.CompletionCode | TransitionRequirements.AfterPhoto),
            new(ServiceRequestStatus.WaitingForParts, ServiceRequestStatus.Rescheduled, Field, TransitionRequirements.Reason),
            new(ServiceRequestStatus.CustomerUnavailable, ServiceRequestStatus.Rescheduled, Field, TransitionRequirements.Reason),
            new(ServiceRequestStatus.Rescheduled, ServiceRequestStatus.Accepted, TransitionActors.Staff),
            new(ServiceRequestStatus.Rescheduled, ServiceRequestStatus.ReadyForAssignment, TransitionActors.Staff, DispatchOnly: true),
            new(ServiceRequestStatus.Completed, ServiceRequestStatus.Closed, Office, TransitionRequirements.Reason),
            new(ServiceRequestStatus.UnableToRepair, ServiceRequestStatus.ClosedNoRepair, Office),
        };

        // Staff can cancel anything that isn't finished (PLAN.md §8); customers, until the technician sets out.
        var cancellable = Enum.GetValues<ServiceRequestStatus>()
            .Where(s => !Terminal.Contains(s) && s != ServiceRequestStatus.Completed);
        rules.AddRange(cancellable.Select(s => new TransitionRule(
            s,
            ServiceRequestStatus.Cancelled,
            CustomerChangeable.Contains(s) ? TransitionActors.Staff | TransitionActors.Customer : TransitionActors.Staff,
            TransitionRequirements.Reason)));

        return rules;
    }
}
