using ServicePro.SharedKernel.Abstractions;
using ServicePro.SharedKernel.Results;
using ServicePro.SharedKernel.ValueObjects;

namespace ServicePro.Contracts.Ports;

/*
 * Ports are implemented by the module that owns the data and consumed by others.
 * Write operations participate in the CALLER's unit of work: they change tracked entities
 * and never call SaveChanges themselves, so a cross-module change commits atomically.
 */

// ── Identity ────────────────────────────────────────────────────────────────

public sealed record NewUser(string FullName, PhoneNumber Phone, string? Email, UserRole Role);

public interface IUserProvisioning
{
    Task<Result<Guid>> CreateAsync(NewUser user, CancellationToken ct);

    Task<Result> UpdateProfileAsync(Guid userId, string fullName, PhoneNumber phone, CancellationToken ct);

    Task<Result> SetActiveAsync(Guid userId, bool isActive, CancellationToken ct);
}

// ── Notifications ───────────────────────────────────────────────────────────

public interface IOtpSender
{
    Task SendAsync(PhoneNumber phone, string code, OtpPurpose purpose, CancellationToken ct);
}

// ── Catalog ─────────────────────────────────────────────────────────────────

public sealed record CategoryInfo(Guid Id, string Code, string Name, decimal BaseVisitCharge, bool RequiresPhotos);

public sealed record IssueTypeInfo(Guid Id, Guid CategoryId, string Code, string Name, int MinSkillLevel, int TypicalDurationMinutes);

public interface ICatalogDirectory
{
    Task<CategoryInfo?> GetCategoryAsync(Guid categoryId, CancellationToken ct);

    Task<IReadOnlyDictionary<Guid, CategoryInfo>> GetCategoriesAsync(IEnumerable<Guid> categoryIds, CancellationToken ct);

    Task<IssueTypeInfo?> GetIssueTypeAsync(Guid issueTypeId, CancellationToken ct);

    Task<IReadOnlyList<Guid>> FindServiceAreaIdsByPincodeAsync(string pincode, CancellationToken ct);
}

// ── Customers ───────────────────────────────────────────────────────────────

public sealed record CustomerInfo(Guid Id, string FullName, PhoneNumber Phone, string PreferredLanguage);

public sealed record AddressInfo(
    Guid Id,
    Guid CustomerId,
    string Line1,
    string? Line2,
    string? Landmark,
    string Locality,
    string City,
    string Pincode,
    GeoLocation? Location)
{
    public string OneLine => string.Join(", ", new[] { Line1, Line2, Landmark, Locality, City, Pincode }
        .Where(part => !string.IsNullOrWhiteSpace(part)));
}

public sealed record ApplianceInfo(Guid Id, Guid CustomerId, Guid CategoryId, string? Brand, string? ModelNumber);

public interface ICustomerDirectory
{
    Task<CustomerInfo?> GetAsync(Guid customerId, CancellationToken ct);

    Task<IReadOnlyDictionary<Guid, CustomerInfo>> GetManyAsync(IEnumerable<Guid> customerIds, CancellationToken ct);

    Task<AddressInfo?> GetAddressAsync(Guid addressId, CancellationToken ct);

    Task<IReadOnlyDictionary<Guid, AddressInfo>> GetAddressesAsync(IEnumerable<Guid> addressIds, CancellationToken ct);

    Task<ApplianceInfo?> GetApplianceAsync(Guid applianceId, CancellationToken ct);
}

// ── Technicians ─────────────────────────────────────────────────────────────

public sealed record TechnicianInfo(
    Guid Id,
    Guid UserId,
    string FullName,
    PhoneNumber Phone,
    string? PhotoUrl,
    string Specialty,
    decimal? RatingAverage,
    int CompletedJobs,
    TechnicianDutyStatus DutyStatus);

public sealed record WeeklyShift(DayOfWeek Day, TimeOnly Start, TimeOnly End);

public sealed record TimeOffWindow(DateTimeOffset StartsAt, DateTimeOffset EndsAt);

/// <summary>Everything the matching engine needs about one technician (PLAN.md §10).</summary>
public sealed record TechnicianDispatchProfile(
    Guid Id,
    string FullName,
    string Specialty,
    TechnicianDutyStatus DutyStatus,
    int? SkillLevel,
    IReadOnlyCollection<Guid> ServiceAreaIds,
    IReadOnlyList<WeeklyShift> Shifts,
    IReadOnlyList<TimeOffWindow> TimeOff,
    GeoLocation? CurrentLocation,
    GeoLocation? HomeLocation,
    int MaxJobsPerDay,
    decimal? RatingAverage,
    int CompletedJobs);

public sealed record CommissionTerms(string Type, decimal Value);

public interface ITechnicianDirectory
{
    Task<TechnicianInfo?> GetAsync(Guid technicianId, CancellationToken ct);

    Task<IReadOnlyDictionary<Guid, TechnicianInfo>> GetManyAsync(IEnumerable<Guid> technicianIds, CancellationToken ct);

    Task<Guid?> FindIdByUserIdAsync(Guid userId, CancellationToken ct);

    /// <summary>Active technicians who have a skill in the category.</summary>
    Task<IReadOnlyList<TechnicianDispatchProfile>> GetDispatchProfilesAsync(Guid categoryId, CancellationToken ct);

    Task<CommissionTerms?> GetCommissionTermsAsync(Guid technicianId, CancellationToken ct);
}

// ── Service requests ────────────────────────────────────────────────────────

public sealed record DispatchContext(
    Guid ServiceRequestId,
    string SrNumber,
    ServiceRequestStatus Status,
    Guid CustomerId,
    Guid CategoryId,
    int MinSkillLevel,
    string Locality,
    string Pincode,
    GeoLocation? Location,
    DateTimeOffset? ScheduledStart,
    Priority Priority);

public sealed record BillingContext(
    Guid ServiceRequestId,
    string SrNumber,
    ServiceRequestStatus Status,
    Guid CustomerId,
    Guid? TechnicianId,
    decimal VisitCharge,
    PaymentStatus PaymentStatus);

public interface IServiceRequestWorkflow
{
    Task<Result<DispatchContext>> GetDispatchContextAsync(Guid serviceRequestId, CancellationToken ct);

    Task<Result> OfferAsync(Guid serviceRequestId, Guid technicianId, Guid assignmentId, Actor actor, CancellationToken ct);

    Task<Result> AcceptOfferAsync(Guid serviceRequestId, Guid technicianId, Actor actor, CancellationToken ct);

    /// <summary>Offer declined/expired or technician unassigned: back to the assignment queue.</summary>
    Task<Result> ReturnToQueueAsync(Guid serviceRequestId, string reasonCode, Actor actor, CancellationToken ct);

    Task<Result<BillingContext>> GetBillingContextAsync(Guid serviceRequestId, CancellationToken ct);

    /// <summary>Records the payment outcome; a fully paid, completed job is closed.</summary>
    Task<Result> ApplyPaymentAsync(Guid serviceRequestId, PaymentStatus paymentStatus, decimal finalAmount, Actor actor, CancellationToken ct);

    /// <summary>Resolves a customer's tracking link to its job (for public invoice downloads).</summary>
    Task<Guid?> FindIdByTrackingTokenAsync(string trackingToken, CancellationToken ct);

    /// <summary>The token for the customer's tracking link, used in messages.</summary>
    Task<string?> GetTrackingTokenAsync(Guid serviceRequestId, CancellationToken ct);
}

// ── Billing ─────────────────────────────────────────────────────────────────

public sealed record InvoiceSummary(Guid InvoiceId, string InvoiceNumber, decimal Total, decimal AmountPaid, IReadOnlyList<InvoiceLineSummary> Lines);

public sealed record InvoiceLineSummary(string Description, decimal Quantity, decimal UnitPrice, decimal Amount);

public interface IBillingDirectory
{
    Task<InvoiceSummary?> GetInvoiceForServiceRequestAsync(Guid serviceRequestId, CancellationToken ct);
}
