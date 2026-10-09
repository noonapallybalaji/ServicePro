using FluentValidation;
using Microsoft.EntityFrameworkCore;
using ServicePro.BuildingBlocks.Application;
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

/// <summary>Latitude/longitude come from the customer's device ("Use my current location"), if shared.</summary>
public sealed record BookingAddressRequest(
    string? Label,
    string Line1,
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
    string ProblemDescription,
    string FullName,
    string Phone,
    string Code,
    BookingAddressRequest Address,
    DateTimeOffset PreferredSlotStart,
    DateTimeOffset PreferredSlotEnd);

public sealed record OnlineBookingResponse(string SrNumber, string TrackingPath);

internal sealed class OnlineBookingRequestValidator : AbstractValidator<OnlineBookingRequest>
{
    public OnlineBookingRequestValidator()
    {
        RuleFor(r => r.CategoryId).NotEmpty().WithMessage("Choose what needs repairing.");
        RuleFor(r => r.ProblemDescription).NotEmpty().WithMessage("Tell us briefly what's wrong.").MaximumLength(1000);
        RuleFor(r => r.FullName).NotEmpty().WithMessage("Enter your name.").MaximumLength(120);
        RuleFor(r => r.Phone).NotEmpty();
        RuleFor(r => r.Code).NotEmpty().Matches("^[0-9]{4,8}$").WithMessage("Enter the numeric code from the SMS.");
        RuleFor(r => r.Address).NotNull();
        RuleFor(r => r.Address.Line1).NotEmpty().WithMessage("Enter your house or flat number and street.").MaximumLength(200);
        RuleFor(r => r.Address.Line2).MaximumLength(200);
        RuleFor(r => r.Address.Landmark).MaximumLength(120);
        RuleFor(r => r.Address.Locality).NotEmpty().WithMessage("Enter your area or locality.").MaximumLength(120);
        RuleFor(r => r.Address.City).NotEmpty().WithMessage("Enter your city.").MaximumLength(80);
        RuleFor(r => r.Address.State).MaximumLength(80);
        RuleFor(r => r.Address.Pincode).Matches("^[1-9][0-9]{5}$").WithMessage("Enter a 6-digit pincode.");
        RuleFor(r => r.Address.Label).MaximumLength(40);
        RuleFor(r => r.Address.Latitude).InclusiveBetween(-90, 90).When(r => r.Address.Latitude.HasValue);
        RuleFor(r => r.Address.Longitude).InclusiveBetween(-180, 180).When(r => r.Address.Longitude.HasValue);
        RuleFor(r => r.Address).Must(a => a.Latitude.HasValue == a.Longitude.HasValue)
            .WithMessage("Send both latitude and longitude, or neither.");
        RuleFor(r => r.PreferredSlotEnd).GreaterThan(r => r.PreferredSlotStart).WithMessage("Choose a time slot.");
    }
}

public sealed class BookServiceOnline(
    DbContext db,
    SrNumberGenerator srNumbers,
    IPhoneVerification verification,
    ICustomerRegistry customers,
    ICatalogDirectory catalog,
    IClock clock) : IUseCase
{
    private static readonly TimeSpan BookingHorizon = TimeSpan.FromDays(30);
    private static readonly TimeSpan LongestSlot = TimeSpan.FromHours(8);

    public async Task<Result<OnlineBookingResponse>> HandleAsync(OnlineBookingRequest request, CancellationToken ct)
    {
        var phone = PhoneNumber.Create(request.Phone);
        if (phone.IsFailure)
        {
            return phone.Error!;
        }

        var details = await ValidateDetailsAsync(request, ct);
        if (details.IsFailure)
        {
            return details.Error!;
        }

        // Check the code last, so a typo elsewhere doesn't burn one of the customer's attempts.
        var verified = await verification.VerifyAsync(phone.Value, OtpPurpose.Booking, request.Code, ct);
        if (verified.IsFailure)
        {
            await db.SaveChangesAsync(ct); // persist the attempt count
            return verified.Error!;
        }

        var address = request.Address;
        var pin = address is { Latitude: { } lat, Longitude: { } lng } ? GeoLocation.Create(lat, lng) : null;
        if (pin is { IsFailure: true })
        {
            return pin.Error!;
        }

        var customer = await customers.FindOrCreateAsync(
            new SelfServiceContact(request.FullName.Trim(), phone.Value, RequestChannel.Website),
            new SelfServiceAddress(
                address.Label, address.Line1, address.Line2, address.Landmark, address.Locality, address.City,
                address.State ?? string.Empty, address.Pincode, pin?.Value),
            ct);
        if (customer.IsFailure)
        {
            return customer.Error!;
        }

        var serviceRequest = ServiceRequest.Create(
            new NewServiceRequest(
                await srNumbers.NextAsync(ct),
                customer.Value.CustomerId,
                customer.Value.AddressId,
                ApplianceId: null,
                request.CategoryId,
                request.IssueTypeId,
                request.ProblemDescription,
                RequestChannel.Website,
                Priority.Normal,
                details.Value.BaseVisitCharge,
                request.PreferredSlotStart,
                request.PreferredSlotEnd,
                ScheduledStart: null,
                ScheduledEnd: null,
                IsWarrantyVisit: false,
                ParentServiceRequestId: null,
                AwaitsReview: true),
            Actor.Customer,
            clock.UtcNow);

        db.Set<ServiceRequest>().Add(serviceRequest);
        await db.SaveChangesAsync(ct);
        return new OnlineBookingResponse(serviceRequest.SrNumber, $"/t/{serviceRequest.TrackingToken}");
    }

    private async Task<Result<CategoryInfo>> ValidateDetailsAsync(OnlineBookingRequest request, CancellationToken ct)
    {
        var category = await catalog.GetCategoryAsync(request.CategoryId, ct);
        if (category is null)
        {
            return Error.Validation("booking.category_invalid", "Choose what needs repairing.");
        }

        if (request.IssueTypeId is { } issueTypeId)
        {
            var issue = await catalog.GetIssueTypeAsync(issueTypeId, ct);
            if (issue is null || issue.CategoryId != category.Id)
            {
                return Error.Validation("booking.issue_invalid", "Choose a problem for this appliance.");
            }
        }

        var now = clock.UtcNow;
        if (request.PreferredSlotStart < now || request.PreferredSlotStart > now + BookingHorizon ||
            request.PreferredSlotEnd - request.PreferredSlotStart > LongestSlot)
        {
            return Error.Validation("booking.slot_invalid", "Choose a time slot in the next 30 days.");
        }

        var areas = await catalog.FindServiceAreaIdsByPincodeAsync(request.Address.Pincode.Trim(), ct);
        if (areas.Count == 0)
        {
            return Error.Validation("booking.not_serviceable", "We don't cover this pincode yet. Call us and we'll try to help.");
        }

        return category;
    }
}
