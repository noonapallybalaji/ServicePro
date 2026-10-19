using FluentValidation;
using Microsoft.EntityFrameworkCore;
using ServicePro.BuildingBlocks.Application;
using ServicePro.BuildingBlocks.Settings;
using ServicePro.Contracts;
using ServicePro.Contracts.Ports;
using ServicePro.Modules.ServiceRequests.Domain;
using ServicePro.SharedKernel.Abstractions;
using ServicePro.SharedKernel.Results;
using ServicePro.SharedKernel.ValueObjects;

namespace ServicePro.Modules.ServiceRequests.Application;

/*
 * Customers book a repair on the website (PLAN.md §16 Phase 2, brought forward without the AI call).
 * The phone number is proven with a one-time code, the job is created as NEW, and staff confirm it
 * before dispatch: online forms attract typos and the occasional prank.
 */

// ── Step 1: send a code to the customer's phone ────────────────────────────

public sealed record BookingCodeRequest(string Phone);

public sealed record BookingCodeResponse(DateTimeOffset ExpiresAt, int CodeLength, string? DevelopmentCode);

internal sealed class BookingCodeRequestValidator : AbstractValidator<BookingCodeRequest>
{
    public BookingCodeRequestValidator() => RuleFor(r => r.Phone).NotEmpty();
}

public sealed class RequestBookingCode(DbContext db, IPhoneVerification verification) : IUseCase
{
    public async Task<Result<BookingCodeResponse>> HandleAsync(BookingCodeRequest request, CancellationToken ct)
    {
        var phone = PhoneNumber.Create(request.Phone);
        if (phone.IsFailure)
        {
            return phone.Error!;
        }

        var issued = await verification.IssueAsync(phone.Value, OtpPurpose.Booking, ct);
        if (issued.IsFailure)
        {
            return issued.Error!;
        }

        await db.SaveChangesAsync(ct);
        return new BookingCodeResponse(issued.Value.ExpiresAt, issued.Value.CodeLength, issued.Value.DevelopmentCode);
    }
}

// ── Step 2: create the booking ─────────────────────────────────────────────

/// <summary>
/// Latitude/longitude come from the customer's device ("Detect my location"), if shared. Line1 (house
/// or flat number) is optional on the website: the technician has the pin and calls the customer.
/// </summary>
public sealed record BookingAddressRequest(
    string? Label,
    string? Line1,
    string? Line2,
    string? Landmark,
    string Locality,
    string City,
    string? State,
    string Pincode,
    double? Latitude,
    double? Longitude);

public sealed record OnlineBookingRequest(
    Guid CategoryId,
    Guid? IssueTypeId,
    string? ProblemDescription,
    string FullName,
    string Phone,
    string? Code,
    BookingAddressRequest Address,
    bool AcceptedPolicies = false,
    BookingExtras? Extras = null,
    string? RequestId = null,
    Guid? AddressId = null);

/// <summary>
/// Optional details that help the technician: how to get in, who will be there (when it isn't
/// the person booking), and what the appliance is.
/// </summary>
public sealed record BookingExtras(
    string? AccessNotes,
    string? ContactName,
    string? ContactPhone,
    string? ApplianceBrand,
    string? ApplianceModel,
    int? PurchaseYear,
    bool? UnderWarranty);

/// <summary>
/// Session is set when this booking signed the customer in (their phone was just verified);
/// it is null when they were already signed in.
/// </summary>
public sealed record OnlineBookingResponse(string SrNumber, string TrackingPath, CustomerSessionResponse? Session, Guid ServiceRequestId);

/// <summary>The response plus the refresh token, which the endpoint puts in an HttpOnly cookie.</summary>
public sealed record OnlineBookingOutcome(OnlineBookingResponse Response, IssuedCustomerSession? Session);

internal sealed class OnlineBookingRequestValidator : AbstractValidator<OnlineBookingRequest>
{
    public OnlineBookingRequestValidator()
    {
        RuleFor(r => r.CategoryId).NotEmpty().WithMessage("Choose what needs repairing.");
        RuleFor(r => r.AcceptedPolicies).Equal(true).WithMessage("Please agree to the terms and privacy policy to book.");
        // Optional on the website: without it the technician finds the fault on the visit.
        RuleFor(r => r.ProblemDescription).MaximumLength(1000);
        RuleFor(r => r.FullName).NotEmpty().WithMessage("Enter your name.").MaximumLength(120);
        RuleFor(r => r.Phone).NotEmpty();
        // Required unless the customer is already signed in with this number (checked in the use case).
        RuleFor(r => r.Code).Matches("^[0-9]{4,8}$").WithMessage("Enter the numeric code from the SMS.").When(r => !string.IsNullOrEmpty(r.Code));
        RuleFor(r => r.Address).NotNull();
        RuleFor(r => r.Address.Line1).MaximumLength(200);
        RuleFor(r => r.Address.Line2).MaximumLength(200);
        RuleFor(r => r.Address.Landmark).MaximumLength(120);
        RuleFor(r => r.Address.Locality).NotEmpty().WithMessage("Choose your location.").MaximumLength(120);
        RuleFor(r => r.Address.City).NotEmpty().WithMessage("Enter your city.").MaximumLength(80);
        RuleFor(r => r.Address.State).MaximumLength(80);
        RuleFor(r => r.Address.Pincode).Matches("^[1-9][0-9]{5}$").WithMessage("Enter a 6-digit pincode.");
        RuleFor(r => r.Address.Label).MaximumLength(40);
        RuleFor(r => r.Address.Latitude).InclusiveBetween(-90, 90).When(r => r.Address.Latitude.HasValue);
        RuleFor(r => r.Address.Longitude).InclusiveBetween(-180, 180).When(r => r.Address.Longitude.HasValue);
        RuleFor(r => r.Address).Must(a => a.Latitude.HasValue == a.Longitude.HasValue)
            .WithMessage("Send both latitude and longitude, or neither.");
        // One random id per booking attempt, so a double tap or a retry can't book twice.
        RuleFor(r => r.RequestId).Matches("^[A-Za-z0-9-]{8,64}$").When(r => r.RequestId is not null);
        When(r => r.Extras is not null, () =>
        {
            RuleFor(r => r.Extras!.AccessNotes).MaximumLength(300);
            RuleFor(r => r.Extras!.ContactName).MaximumLength(120);
            RuleFor(r => r.Extras!.ContactName).NotEmpty().WithMessage("Enter the name of the person who will be there.")
                .When(r => !string.IsNullOrWhiteSpace(r.Extras!.ContactPhone));
            RuleFor(r => r.Extras!.ContactPhone).NotEmpty().WithMessage("Enter their mobile number.")
                .When(r => !string.IsNullOrWhiteSpace(r.Extras!.ContactName));
            RuleFor(r => r.Extras!.ApplianceBrand).MaximumLength(80);
            RuleFor(r => r.Extras!.ApplianceModel).MaximumLength(80);
            RuleFor(r => r.Extras!.PurchaseYear).InclusiveBetween(1980, 2100).WithMessage("Enter the year it was bought.")
                .When(r => r.Extras!.PurchaseYear.HasValue);
        });
    }
}

public sealed class BookServiceOnline(
    DbContext db,
    SrNumberGenerator srNumbers,
    IPhoneVerification verification,
    ICustomerRegistry customers,
    ICustomerDirectory customerDirectory,
    ICustomerSessions sessions,
    ICurrentUser currentUser,
    ICatalogDirectory catalog,
    ISettingsStore settings,
    IClock clock) : IUseCase
{
    public async Task<Result<OnlineBookingOutcome>> HandleAsync(OnlineBookingRequest request, CancellationToken ct)
    {
        var phone = PhoneNumber.Create(request.Phone);
        if (phone.IsFailure)
        {
            return phone.Error!;
        }

        // The same attempt again (double tap, retry after a dropped connection): answer with the
        // booking it already made. The id is random and known only to that browser.
        var key = request.RequestId is { } id ? $"web:{id}" : null;
        if (key is not null && await FindExistingAsync(key, phone.Value, ct) is { } existing)
        {
            return existing;
        }

        // A signed-in customer can book one of their saved addresses (AddressId): it's used as stored,
        // so booking from the list never makes copies. Anyone else's address id is refused.
        AddressInfo? saved = null;
        if (request.AddressId is { } addressId)
        {
            saved = await customerDirectory.GetAddressAsync(addressId, ct);
            if (saved is null || currentUser.CustomerId is not { } owner || saved.CustomerId != owner)
            {
                return Error.Validation("booking.address_invalid", "Choose one of your saved addresses, or enter the address.");
            }
        }

        var details = await BookingRules.ValidateAsync(catalog, request.CategoryId, request.IssueTypeId, saved?.Pincode ?? request.Address.Pincode, ct);
        if (details.IsFailure)
        {
            return details.Error!;
        }

        // A customer already signed in with this number has proven it; anyone else verifies now.
        var signedIn = currentUser.CustomerId is { } signedInId && (await customerDirectory.GetAsync(signedInId, ct))?.Phone == phone.Value;
        if (!signedIn)
        {
            if (string.IsNullOrEmpty(request.Code))
            {
                return Error.Validation("booking.code_required", "Enter the code we sent to your phone.");
            }

            // Check the code last, so a typo elsewhere doesn't burn one of the customer's attempts.
            var verified = await verification.VerifyAsync(phone.Value, OtpPurpose.Booking, request.Code, ct);
            if (verified.IsFailure)
            {
                await db.SaveChangesAsync(ct); // persist the attempt count
                return verified.Error!;
            }
        }

        var address = request.Address;
        var pin = address is { Latitude: { } lat, Longitude: { } lng } ? GeoLocation.Create(lat, lng) : null;
        if (pin is { IsFailure: true })
        {
            return pin.Error!;
        }

        var customer = await customers.FindOrCreateAsync(
            new SelfServiceContact(request.FullName.Trim(), phone.Value, RequestChannel.Website, request.AcceptedPolicies),
            saved is not null
                ? new SelfServiceAddress(null, saved.Line1, saved.Line2, saved.Landmark, saved.Locality, saved.City, string.Empty, saved.Pincode, saved.Location ?? pin?.Value)
                : new SelfServiceAddress(
                    address.Label, address.Line1?.Trim() ?? string.Empty, address.Line2, address.Landmark, address.Locality, address.City,
                    address.State ?? string.Empty, address.Pincode, pin?.Value),
            ct);
        if (customer.IsFailure)
        {
            return customer.Error!;
        }

        var extras = request.Extras;
        PhoneNumber? contactPhone = null;
        if (!string.IsNullOrWhiteSpace(extras?.ContactPhone))
        {
            var parsed = PhoneNumber.Create(extras.ContactPhone);
            if (parsed.IsFailure)
            {
                return Error.Validation("booking.contact_phone_invalid", "Enter a valid 10-digit mobile number for the person at home.");
            }

            contactPhone = parsed.Value;
        }

        Guid? applianceId = extras is { ApplianceBrand: { Length: > 0 } } or { ApplianceModel: { Length: > 0 } } or { PurchaseYear: not null }
            ? await customers.AddApplianceAsync(customer.Value.Customer.Id,
                new SelfServiceAppliance(request.CategoryId, extras!.ApplianceBrand, extras.ApplianceModel, extras.PurchaseYear), ct)
            : null;

        var serviceRequest = ServiceRequest.Create(
            new NewServiceRequest(
                await srNumbers.NextAsync(ct),
                customer.Value.Customer.Id,
                saved?.Id ?? customer.Value.AddressId,
                ApplianceId: applianceId,
                request.CategoryId,
                request.IssueTypeId,
                string.IsNullOrWhiteSpace(request.ProblemDescription) ? $"{details.Value.Name}: to be checked on the visit" : request.ProblemDescription.Trim(),
                RequestChannel.Website,
                Priority.Normal,
                details.Value.BaseVisitCharge,
                PreferredSlotStart: null,
                PreferredSlotEnd: null,
                ScheduledStart: null,
                ScheduledEnd: null,
                IsWarrantyVisit: false,
                ParentServiceRequestId: null,
                AwaitsReview: !await settings.GetAsync(OpsSettings.AutoConfirmWebsiteBookings, ct),
                ExternalReference: key),
            Actor.Customer,
            clock.UtcNow);

        serviceRequest.SetVisitDetails(extras?.AccessNotes, extras?.ContactName, contactPhone, extras?.UnderWarranty);
        db.Set<ServiceRequest>().Add(serviceRequest);

        // The phone was just verified: sign the customer in, in the same save as the booking,
        // so "My bookings" works straight away without another code.
        var session = signedIn ? null : await sessions.IssueAsync(customer.Value.Customer, ct);
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException) when (key is not null)
        {
            // Two copies of the same attempt raced: the unique index let one win.
            db.ChangeTracker.Clear();
            if (await FindExistingAsync(key, phone.Value, ct) is { } winner)
            {
                return winner;
            }

            throw;
        }

        var response = new OnlineBookingResponse(serviceRequest.SrNumber, $"/t/{serviceRequest.TrackingToken}", session?.Response, serviceRequest.Id);
        return new OnlineBookingOutcome(response, session);
    }

    /// <summary>The booking an earlier copy of this attempt made, if any (no new session is issued for it).</summary>
    private async Task<OnlineBookingOutcome?> FindExistingAsync(string key, PhoneNumber phone, CancellationToken ct)
    {
        var existing = await db.Set<ServiceRequest>().AsNoTracking()
            .FirstOrDefaultAsync(s => s.Channel == RequestChannel.Website && s.ExternalReference == key, ct);
        if (existing is null || (await customerDirectory.GetAsync(existing.CustomerId, ct))?.Phone != phone)
        {
            return null;
        }

        return new OnlineBookingOutcome(new OnlineBookingResponse(existing.SrNumber, $"/t/{existing.TrackingToken}", null, existing.Id), null);
    }
}

/// <summary>
/// Checks shared by every self-service booking path (website, WhatsApp assistant). There is no
/// time to check: the office agrees the visit date with the customer after the booking.
/// </summary>
internal static class BookingRules
{
    public static async Task<Result<CategoryInfo>> ValidateAsync(
        ICatalogDirectory catalog,
        Guid categoryId,
        Guid? issueTypeId,
        string pincode,
        CancellationToken ct)
    {
        var category = await catalog.GetCategoryAsync(categoryId, ct);
        if (category is null)
        {
            return Error.Validation("booking.category_invalid", "Choose what needs repairing.");
        }

        if (issueTypeId is { } id)
        {
            var issue = await catalog.GetIssueTypeAsync(id, ct);
            if (issue is null || issue.CategoryId != category.Id)
            {
                return Error.Validation("booking.issue_invalid", "Choose a problem for this appliance.");
            }
        }

        var areas = await catalog.FindServiceAreaIdsByPincodeAsync(pincode.Trim(), ct);
        if (areas.Count == 0)
        {
            return Error.Validation("booking.not_serviceable", "We don't cover this pincode yet. Call us and we'll try to help.");
        }

        return category;
    }


}
