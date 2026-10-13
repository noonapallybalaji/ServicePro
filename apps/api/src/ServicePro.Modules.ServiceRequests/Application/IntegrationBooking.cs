using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using ServicePro.BuildingBlocks.Application;
using ServicePro.Contracts;
using ServicePro.Contracts.Ports;
using ServicePro.Modules.ServiceRequests.Domain;
using ServicePro.SharedKernel.Abstractions;
using ServicePro.SharedKernel.Results;
using ServicePro.SharedKernel.ValueObjects;

namespace ServicePro.Modules.ServiceRequests.Application;

/*
 * Bookings made by a trusted server-to-server integration — today the n8n WhatsApp assistant.
 *
 * Trust: the caller authenticates with an integration key (AuthPolicies.Integration). The phone
 * number is the WhatsApp sender as delivered by Meta to n8n, so no SMS code is needed. Nothing in
 * the response can sign anyone in: no session, no token, no code.
 *
 * Safety: the caller must state that the customer explicitly confirmed the summary, and must send
 * an idempotency key (the WhatsApp message id of that confirmation). The key is stored on the job
 * with a unique index, so a retried or duplicated request returns the first booking instead of
 * creating another. Like website bookings, the job starts in NEW: the time is a preference that the
 * office confirms, never a confirmed appointment.
 */

public sealed record IntegrationBookingRequest(
    string IdempotencyKey,
    bool CustomerConfirmed,
    Guid CategoryId,
    Guid? IssueTypeId,
    string ProblemDescription,
    string FullName,
    string Phone,
    BookingAddressRequest Address,
    DateTimeOffset PreferredSlotStart,
    DateTimeOffset PreferredSlotEnd);

/// <summary>
/// What the assistant may tell the customer. <see cref="AppointmentConfirmed"/> is always false at
/// creation: the office confirms the visit time later (the customer is told on WhatsApp).
/// </summary>
public sealed record IntegrationBookingResponse(
    string SrNumber,
    ServiceRequestStatus Status,
    string StatusText,
    bool AppointmentConfirmed,
    DateTimeOffset PreferredSlotStart,
    DateTimeOffset PreferredSlotEnd,
    string TrackingUrl,
    bool Duplicate);

internal sealed class IntegrationBookingRequestValidator : AbstractValidator<IntegrationBookingRequest>
{
    public IntegrationBookingRequestValidator()
    {
        RuleFor(r => r.IdempotencyKey).NotEmpty().MaximumLength(128).Matches("^[A-Za-z0-9._:=+/-]+$")
            .WithMessage("Use the WhatsApp message id of the customer's confirmation as the idempotency key.");
        RuleFor(r => r.CustomerConfirmed).Equal(true).WithMessage("Create the booking only after the customer has confirmed the summary.");
        RuleFor(r => r.CategoryId).NotEmpty();
        RuleFor(r => r.ProblemDescription).NotEmpty().MaximumLength(1000);
        RuleFor(r => r.FullName).NotEmpty().MaximumLength(120);
        RuleFor(r => r.Phone).NotEmpty();
        RuleFor(r => r.Address).NotNull();
        RuleFor(r => r.Address.Line1).NotEmpty().MaximumLength(200);
        RuleFor(r => r.Address.Line2).MaximumLength(200);
        RuleFor(r => r.Address.Landmark).MaximumLength(120);
        RuleFor(r => r.Address.Locality).NotEmpty().MaximumLength(120);
        RuleFor(r => r.Address.City).NotEmpty().MaximumLength(80);
        RuleFor(r => r.Address.State).MaximumLength(80);
        RuleFor(r => r.Address.Label).MaximumLength(40);
        RuleFor(r => r.Address.Pincode).Matches("^[1-9][0-9]{5}$").WithMessage("Enter a 6-digit pincode.");
        RuleFor(r => r.Address.Latitude).InclusiveBetween(-90, 90).When(r => r.Address.Latitude.HasValue);
        RuleFor(r => r.Address.Longitude).InclusiveBetween(-180, 180).When(r => r.Address.Longitude.HasValue);
        RuleFor(r => r.PreferredSlotEnd).GreaterThan(r => r.PreferredSlotStart).WithMessage("The preferred window must end after it starts.");
    }
}

/// <summary>Where customer-facing links point (the public website, not the API).</summary>
public sealed class PublicSiteOptions
{
    public string PublicSiteUrl { get; set; } = string.Empty;
}

public sealed class BookViaIntegration(
    DbContext db,
    SrNumberGenerator srNumbers,
    ICustomerRegistry customers,
    ICatalogDirectory catalog,
    IOptions<PublicSiteOptions> site,
    IClock clock) : IUseCase
{
    private const RequestChannel Channel = RequestChannel.WhatsApp;

    /// <summary>Recorded in history and audit: the booking was made by the AI assistant on the customer's behalf.</summary>
    private static readonly Actor Assistant = new(ActorType.AiAgent, null);

    public async Task<Result<IntegrationBookingResponse>> HandleAsync(IntegrationBookingRequest request, CancellationToken ct)
    {
        var key = request.IdempotencyKey.Trim();

        // A retry of a booking we already made: answer with that booking, create nothing.
        if (await FindExistingAsync(key, ct) is { } existing)
        {
            return ToResponse(existing, duplicate: true);
        }

        var phone = PhoneNumber.Create(request.Phone);
        if (phone.IsFailure)
        {
            return phone.Error!;
        }

        var details = await BookingRules.ValidateAsync(
            catalog, clock, request.CategoryId, request.IssueTypeId, request.Address.Pincode, request.PreferredSlotStart, request.PreferredSlotEnd, ct);
        if (details.IsFailure)
        {
            return details.Error!;
        }

        var address = request.Address;
        var pin = address is { Latitude: { } lat, Longitude: { } lng } ? GeoLocation.Create(lat, lng) : null;
        if (pin is { IsFailure: true })
        {
            return pin.Error!;
        }

        var customer = await customers.FindOrCreateAsync(
            new SelfServiceContact(request.FullName.Trim(), phone.Value, Channel),
            new SelfServiceAddress(address.Label, address.Line1, address.Line2, address.Landmark, address.Locality, address.City,
                address.State ?? string.Empty, address.Pincode, pin?.Value),
            ct);
        if (customer.IsFailure)
        {
            return customer.Error!;
        }

        var serviceRequest = ServiceRequest.Create(
            new NewServiceRequest(
                await srNumbers.NextAsync(ct),
                customer.Value.Customer.Id,
                customer.Value.AddressId,
                ApplianceId: null,
                request.CategoryId,
                request.IssueTypeId,
                request.ProblemDescription,
                Channel,
                Priority.Normal,
                details.Value.BaseVisitCharge,
                request.PreferredSlotStart,
                request.PreferredSlotEnd,
                ScheduledStart: null,
                ScheduledEnd: null,
                IsWarrantyVisit: false,
                ParentServiceRequestId: null,
                AwaitsReview: true,
                ExternalReference: key),
            Assistant,
            clock.UtcNow);

        db.Set<ServiceRequest>().Add(serviceRequest);
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException)
        {
            // Two deliveries of the same confirmation raced: the unique index let one win.
            db.ChangeTracker.Clear();
            if (await FindExistingAsync(key, ct) is { } winner)
            {
                return ToResponse(winner, duplicate: true);
            }

            throw;
        }

        return ToResponse(serviceRequest, duplicate: false);
    }

    private Task<ServiceRequest?> FindExistingAsync(string key, CancellationToken ct) =>
        db.Set<ServiceRequest>().AsNoTracking().FirstOrDefaultAsync(s => s.Channel == Channel && s.ExternalReference == key, ct);

    private IntegrationBookingResponse ToResponse(ServiceRequest request, bool duplicate) => new(
        request.SrNumber,
        request.Status,
        StatusText(request.Status),
        AppointmentConfirmed: request.ScheduledStart is not null,
        request.PreferredSlotStart ?? default,
        request.PreferredSlotEnd ?? default,
        $"{site.Value.PublicSiteUrl.TrimEnd('/')}/t/{request.TrackingToken}",
        duplicate);

    /// <summary>Plain words the assistant can repeat without over-promising.</summary>
    private static string StatusText(ServiceRequestStatus status) => status switch
    {
        ServiceRequestStatus.New => "Request received. Our team will confirm the visit time and technician on WhatsApp.",
        ServiceRequestStatus.ReadyForAssignment or ServiceRequestStatus.Offered => "Confirmed by our team. We are assigning a technician.",
        ServiceRequestStatus.Accepted => "A technician has been assigned.",
        ServiceRequestStatus.Cancelled => "This request was cancelled.",
        _ => "In progress. Use the tracking link for the latest status.",
    };
}
