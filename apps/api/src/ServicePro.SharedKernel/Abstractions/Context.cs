namespace ServicePro.SharedKernel.Abstractions;

/// <summary>Time source. Inject it instead of calling DateTimeOffset.UtcNow so time is testable.</summary>
public interface IClock
{
    DateTimeOffset UtcNow { get; }
}

/// <summary>The tenant the current operation runs for (PLAN.md §7.1).</summary>
public interface ITenantContext
{
    Guid TenantId { get; }
}

public enum UserRole
{
    Owner,
    Admin,
    Dispatcher,
    Technician,
}

/// <summary>The authenticated caller, if any.</summary>
public interface ICurrentUser
{
    bool IsAuthenticated { get; }

    Guid? UserId { get; }

    UserRole? Role { get; }

    /// <summary>Present when the caller is a technician.</summary>
    Guid? TechnicianId { get; }

    /// <summary>Present when the caller is a signed-in customer (they have no user account).</summary>
    Guid? CustomerId { get; }
}

/// <summary>Who performed a change, recorded in history and audit (PLAN.md §7.7).</summary>
public enum ActorType
{
    User,
    Technician,
    Customer,
    System,
    AiAgent,
}

public sealed record Actor(ActorType Type, Guid? UserId)
{
    public static Actor System { get; } = new(ActorType.System, null);

    public static Actor Customer { get; } = new(ActorType.Customer, null);
}
