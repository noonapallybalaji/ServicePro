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

public sealed record IssuedOtp(DateTimeOffset ExpiresAt, int CodeLength, string? DevelopmentCode);

/// <summary>One-time codes that prove someone holds a phone number (Identity owns the challenges).</summary>
public interface IPhoneVerification
{
    /// <summary>Creates and sends a code. Refuses while the previous code is still cooling down.</summary>
    Task<Result<IssuedOtp>> IssueAsync(PhoneNumber phone, OtpPurpose purpose, CancellationToken ct);

    /// <summary>Checks the latest unused code and consumes it on success. Wrong attempts are counted, so save either way.</summary>
    Task<Result> VerifyAsync(PhoneNumber phone, OtpPurpose purpose, string code, CancellationToken ct);
}

/// <summary>Who is signed in on the customer site. Role is always "CUSTOMER".</summary>
public sealed record CustomerSessionUser(Guid Id, string FullName, string Role, string Phone, string PreferredLanguage);

public sealed record CustomerSessionResponse(string AccessToken, DateTimeOffset ExpiresAt, CustomerSessionUser User);

/// <summary>A new customer session: the response body plus the refresh token for the cookie.</summary>
public sealed record IssuedCustomerSession(CustomerSessionResponse Response, string RefreshToken, DateTimeOffset RefreshExpiresAt);

/// <summary>
/// Signs a customer in once their phone is verified (booking, or "My bookings" sign-in).
/// Participates in the caller's unit of work: it never saves.
/// </summary>
public interface ICustomerSessions
{
    Task<IssuedCustomerSession> IssueAsync(CustomerInfo customer, CancellationToken ct);

    /// <summary>Account deletion: ends every session and drops pending sign-in codes for the phone.</summary>
    Task ForgetCustomerAsync(Guid customerId, PhoneNumber phone, CancellationToken ct);
}

// ── Notifications ───────────────────────────────────────────────────────────

/// <summary>Account deletion: removes the number and text from every message sent to this customer phone.</summary>
public interface IMessageHistory
{
    /// <summary>Participates in the caller's unit of work: it never saves.</summary>
    Task ForgetRecipientAsync(PhoneNumber phone, CancellationToken ct);
}

public interface IOtpSender
{
    /// <summary>Sends the code; false when no channel could deliver it (the caller tells the user to retry).</summary>
    Task<bool> SendAsync(PhoneNumber phone, string code, OtpPurpose purpose, CancellationToken ct);
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

/// <summary>AcceptedPolicies: the customer agreed to the current terms and privacy policy (recorded as consent).</summary>
public sealed record SelfServiceContact(string FullName, PhoneNumber Phone, RequestChannel Source, bool AcceptedPolicies = false);

/// <summary>An address typed by the customer, optionally with the pin their device reported.</summary>
public sealed record SelfServiceAddress(
    string? Label,
    string Line1,
    string? Line2,
    string? Landmark,
    string Locality,
    string City,
    string State,
    string Pincode,
    GeoLocation? Location);

public sealed record CustomerAddressRef(CustomerInfo Customer, Guid AddressId);

/// <summary>Customer records created by customers themselves (online booking).</summary>
public interface ICustomerRegistry
{
    /// <summary>
    /// Finds the customer by phone (creating them if new) and reuses a matching address or adds it.
    /// Existing names and details are never overwritten by self-service input; a matching address
    /// without a pin gains the one the customer just shared.
    /// </summary>
    Task<Result<CustomerAddressRef>> FindOrCreateAsync(SelfServiceContact contact, SelfServiceAddress address, CancellationToken ct);

    /// <summary>Records that the customer accepted the current terms and privacy policy (once per version).</summary>
    Task RecordConsentAsync(Guid customerId, RequestChannel source, CancellationToken ct);

    /// <summary>Saves the appliance a customer described when booking (brand, model, year); returns its id.</summary>
    Task<Guid> AddApplianceAsync(Guid customerId, SelfServiceAppliance appliance, CancellationToken ct);
}

public sealed record SelfServiceAppliance(Guid CategoryId, string? Brand, string? ModelNumber, int? PurchaseYear);

public interface ICustomerDirectory
{
    Task<CustomerInfo?> GetAsync(Guid customerId, CancellationToken ct);

    /// <summary>The customer whose primary phone this is (phone is the de-duplication key).</summary>
    Task<CustomerInfo?> FindByPhoneAsync(PhoneNumber phone, CancellationToken ct);

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

    /// <summary>An estimate was sent: the job waits for the customer's answer.</summary>
    Task<Result> AwaitEstimateApprovalAsync(Guid serviceRequestId, Actor actor, Guid? technicianId, CancellationToken ct);

    /// <summary>The customer's answer to an estimate: approved starts the repair, declined means visit charge only.</summary>
    Task<Result> ResolveEstimateAsync(Guid serviceRequestId, bool approved, Actor actor, CancellationToken ct);

    /// <summary>Whether the customer has a job that isn't closed or cancelled yet (blocks account deletion).</summary>
    Task<bool> HasOpenRequestsAsync(Guid customerId, CancellationToken ct);
}

// ── Billing ─────────────────────────────────────────────────────────────────

/// <summary>CanPayOnline: a payment gateway is set up and something is still due.</summary>
public sealed record InvoiceSummary(Guid InvoiceId, string InvoiceNumber, decimal Total, decimal AmountPaid, IReadOnlyList<InvoiceLineSummary> Lines, bool CanPayOnline = false);

/// <summary>Type is VISIT | LABOUR | PART | OTHER.</summary>
public sealed record InvoiceLineSummary(string Type, string Description, decimal Quantity, decimal UnitPrice, decimal Amount);

public interface IBillingDirectory
{
    Task<InvoiceSummary?> GetInvoiceForServiceRequestAsync(Guid serviceRequestId, CancellationToken ct);
}
