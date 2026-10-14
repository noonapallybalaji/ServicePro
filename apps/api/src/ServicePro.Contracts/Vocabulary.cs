namespace ServicePro.Contracts;

/// <summary>Service-request lifecycle (PLAN.md §8). Serialised as SNAKE_UPPER ("EN_ROUTE").</summary>
public enum ServiceRequestStatus
{
    New,
    ReadyForAssignment,
    Offered,
    Accepted,
    EnRoute,
    Arrived,
    Diagnosing,
    AwaitingEstimateApproval,
    InProgress,
    WaitingForParts,
    Rescheduled,
    CustomerUnavailable,
    UnableToRepair,
    Completed,
    Closed,
    ClosedNoRepair,
    Cancelled,
}

/// <summary>Where a request came from (PLAN.md §7.6 `leads.source`, Phase 1 subset).</summary>
public enum RequestChannel
{
    Phone,
    WalkIn,
    WhatsApp,
    Website,
    Referral,
    Manual,
}

public enum Priority
{
    Low,
    Normal,
    High,
    Emergency,
}

public enum TechnicianDutyStatus
{
    OffDuty,
    Available,
    OnJob,
    OnBreak,
}

public enum PaymentStatus
{
    NotDue,
    Pending,
    Partial,
    Paid,
    Waived,
}

public enum OtpPurpose
{
    Login,
    Completion,

    /// <summary>A customer proving they own the phone number on an online booking.</summary>
    Booking,

    /// <summary>A customer signing in to see their bookings.</summary>
    CustomerLogin,

    /// <summary>A customer approving a repair estimate from their tracking link.</summary>
    EstimateApproval,
}
